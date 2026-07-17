
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface GoogleOAuthConfig {
	readonly email: string
	readonly client_id: string
	readonly client_secret: string
	readonly project_id?: string
}

interface GoogleOAuthConfigStore {
	readonly active_client_id?: string
	readonly clients: readonly GoogleOAuthConfig[]
}

const GOOGLE_CONFIG_PATH = join(homedir(), '.2fast', 'google-oauth.json')

const GOOGLE_CONFIG_DIR = join(homedir(), '.2fast')

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0

const isValidGoogleOAuthConfig = (value: unknown): value is GoogleOAuthConfig => {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const record = value as Record<string, unknown>
	return (
		isNonEmptyString(record.email) &&
		isNonEmptyString(record.client_id) &&
		isNonEmptyString(record.client_secret)
	)
}

const isValidGoogleOAuthConfigStore = (value: unknown): value is GoogleOAuthConfigStore => {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const record = value as Record<string, unknown>
	return (
		(record.active_client_id === undefined || typeof record.active_client_id === 'string') &&
		Array.isArray(record.clients) &&
		record.clients.every((client) => isValidGoogleOAuthConfig(client))
	)
}



const parseAndValidateConfigStore = (rawJson: string): GoogleOAuthConfigStore => {
	let parsed: unknown
	try {
		parsed = JSON.parse(rawJson) as unknown
	} catch (error) {
		throw new Error('Invalid JSON in Google OAuth config file', {
			cause: error,
		})
	}

	if (isValidGoogleOAuthConfigStore(parsed) && parsed.clients.length > 0) {
		return parsed
	}
	throw new Error(
		`Invalid Google OAuth config shape at ${GOOGLE_CONFIG_PATH}. Expected { active_client_id?, clients: [{ email, client_id, client_secret, project_id? }] }.`
	)
}

const parseAndValidateConfig = (rawJson: string): GoogleOAuthConfig => {
	const store = parseAndValidateConfigStore(rawJson)
	const active = store.clients.find((client) => client.client_id === store.active_client_id) ?? store.clients[0]
	if (!active) {
		throw new Error(
			`Invalid Google OAuth config shape at ${GOOGLE_CONFIG_PATH}. Expected at least one OAuth client.`
		)
	}

	return active
}

/**
 * Loads and validates BYOC Google OAuth desktop credentials from the user profile.
 * @returns Validated Google OAuth config, or null when the file is missing.
 */
export const loadGoogleOAuthConfig = async (): Promise<GoogleOAuthConfig | null> => {
	if (!existsSync(GOOGLE_CONFIG_PATH)) {
		return null
	}

	const rawJson = readFileSync(GOOGLE_CONFIG_PATH, 'utf8')
	return parseAndValidateConfig(rawJson)
}

/**
 * Loads a saved Google OAuth client by its client id.
 * @param clientId Google OAuth client id bound to an account.
 * @returns Matching Google OAuth config, or null when not found.
 */
export const loadGoogleOAuthConfigByClientId = async (clientId: string): Promise<GoogleOAuthConfig | null> => {
	if (!existsSync(GOOGLE_CONFIG_PATH)) {
		return null
	}
	const store = parseAndValidateConfigStore(readFileSync(GOOGLE_CONFIG_PATH, 'utf8'))
	return store.clients.find((client) => client.client_id === clientId) ?? null
}



/**
 * Persists and validates Google OAuth BYOC config at ~/.2fast/google-oauth.json.
 * @param config Google OAuth client values from the setup flow.
 * @returns Saved config path on success.
 */
export const saveGoogleOAuthConfig = async (
	config: GoogleOAuthConfig
): Promise<{ path: string }> => {
	if (!isValidGoogleOAuthConfig(config)) {
		throw new Error('Google OAuth config requires client_id and client_secret')
	}
	if (!config.email || config.email.trim().length === 0) {
		throw new Error('Google OAuth config requires the Gmail email it belongs to')
	}

	mkdirSync(GOOGLE_CONFIG_DIR, { recursive: true })
	const existingStore = existsSync(GOOGLE_CONFIG_PATH)
		? parseAndValidateConfigStore(readFileSync(GOOGLE_CONFIG_PATH, 'utf8'))
		: { clients: [] }
	const clients = [
		config,
		...existingStore.clients.filter((client) => client.client_id !== config.client_id),
	]
	const store: GoogleOAuthConfigStore = {
		active_client_id: config.client_id,
		clients,
	}
	writeFileSync(GOOGLE_CONFIG_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
	return { path: GOOGLE_CONFIG_PATH }
}

/**
 * Deletes saved Google OAuth BYOC config.
 * @returns True when config file existed and was removed.
 */
export const deleteGoogleOAuthConfig = async (): Promise<boolean> => {
	if (!existsSync(GOOGLE_CONFIG_PATH)) {
		return false
	}
	rmSync(GOOGLE_CONFIG_PATH, { force: true })
	return true
}


