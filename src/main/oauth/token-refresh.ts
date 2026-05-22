import { URLSearchParams } from 'node:url'
import type { OAuthConfig, OAuthTokens } from './oauth-handler.js'
import { deleteTokens, saveTokens } from '../accounts/token-store.js'

const EXPIRY_BUFFER_SECONDS = 300

interface TokenRefreshErrorShape {
	readonly error?: string
	readonly error_description?: string
}

const parseRefreshResponse = (payload: unknown, existing: OAuthTokens): OAuthTokens => {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error('Refresh response was not an object')
	}

	const raw = payload as Record<string, unknown>
	const accessToken = raw.access_token
	const expiresIn = raw.expires_in
	const scope = raw.scope
	const refreshToken = raw.refresh_token

	if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
		throw new Error('Refresh response missing required fields')
	}

	return {
		accessToken,
		refreshToken: typeof refreshToken === 'string' ? refreshToken : existing.refreshToken,
		expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
		scope: typeof scope === 'string' ? scope : existing.scope,
	}
}

/**
 * Ensures an account has a valid access token, refreshing when near expiry.
 * @param accountId Internal account identifier for persistence updates.
 * @param config OAuth provider token endpoint/client configuration.
 * @param tokens Current token bundle.
 * @returns Valid token bundle, refreshed when needed.
 */
export const ensureValidAccessToken = async (
	accountId: string,
	config: OAuthConfig,
	tokens: OAuthTokens
): Promise<OAuthTokens> => {
	const now = Math.floor(Date.now() / 1000)
	if (tokens.expiresAt > now + EXPIRY_BUFFER_SECONDS) {
		return tokens
	}

	const body = new URLSearchParams({
		client_id: config.clientId,
		grant_type: 'refresh_token',
		refresh_token: tokens.refreshToken,
	})

	if (config.clientSecret) {
		body.set('client_secret', config.clientSecret)
	}

	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	})

	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => ({}))) as TokenRefreshErrorShape
		if (errorPayload.error === 'invalid_grant') {
			await deleteTokens(accountId)
			throw new Error('Refresh token is invalid or revoked. Please reconnect your account.')
		}
		throw new Error(
			`Failed to refresh token (${response.status}): ${errorPayload.error_description ?? 'unknown error'}`
		)
	}

	const refreshed = parseRefreshResponse((await response.json()) as unknown, tokens)
	await saveTokens(accountId, refreshed)
	return refreshed
}
