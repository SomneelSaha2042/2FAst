import { dialog } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface GoogleOAuthConfig {
	readonly client_id: string
	readonly client_secret: string
	readonly project_id?: string
}

const GOOGLE_CONFIG_PATH = join(homedir(), '.2fast', 'google-oauth.json')
const BYOC_SETUP_GUIDE_URL = 'https://developers.google.com/identity/protocols/oauth2/native-app'
const GOOGLE_CONFIG_DIR = join(homedir(), '.2fast')

const isValidGoogleOAuthConfig = (value: unknown): value is GoogleOAuthConfig => {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const record = value as Record<string, unknown>
	return typeof record.client_id === 'string' && typeof record.client_secret === 'string'
}

const showMissingConfigDialog = async (): Promise<void> => {
	await dialog.showMessageBox({
		type: 'warning',
		buttons: ['OK'],
		defaultId: 0,
		title: 'Google OAuth Setup Required',
		message: 'Missing Google OAuth configuration.',
		detail: `Create ${GOOGLE_CONFIG_PATH} with your BYOC client_id and client_secret.\nGuide: ${BYOC_SETUP_GUIDE_URL}`,
	})
}

const parseAndValidateConfig = (rawJson: string): GoogleOAuthConfig => {
	let parsed: unknown
	try {
		parsed = JSON.parse(rawJson) as unknown
	} catch (error) {
		throw new Error('Invalid JSON in Google OAuth config file', {
			cause: error,
		})
	}

	if (!isValidGoogleOAuthConfig(parsed)) {
		throw new Error(
			`Invalid Google OAuth config shape at ${GOOGLE_CONFIG_PATH}. Expected { client_id, client_secret, project_id? }.`
		)
	}

	return parsed
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
 * Returns whether a valid Google OAuth config is currently available.
 * @returns True when a valid BYOC config file exists.
 */
export const hasValidGoogleOAuthConfig = (): boolean => {
	if (!existsSync(GOOGLE_CONFIG_PATH)) {
		return false
	}

	try {
		parseAndValidateConfig(readFileSync(GOOGLE_CONFIG_PATH, 'utf8'))
		return true
	} catch {
		return false
	}
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

	mkdirSync(GOOGLE_CONFIG_DIR, { recursive: true })
	writeFileSync(GOOGLE_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
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

/**
 * Displays a BYOC setup reminder dialog for desktop users.
 * @returns Promise that resolves after user dismisses the message box.
 */
export const showGoogleByocSetupDialog = async (): Promise<void> => {
	await showMissingConfigDialog()
}
