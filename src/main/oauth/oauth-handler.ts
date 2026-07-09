import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { URL, URLSearchParams } from 'node:url'
import { shell } from 'electron'

export interface OAuthConfig {
	readonly authUrl: string
	readonly tokenUrl: string
	readonly clientId: string
	readonly clientSecret?: string
	readonly scopes: readonly string[]
	readonly redirectUri?: string
}

export interface OAuthTokens {
	readonly accessToken: string
	readonly refreshToken: string
	readonly expiresAt: number
	readonly scope: string
}

interface PkcePair {
	readonly codeVerifier: string
	readonly codeChallenge: string
}

interface ActiveOAuthFlow {
	readonly cancel: () => void
}

const PKCE_MIN_LENGTH = 43
const PKCE_MAX_LENGTH = 128
const CALLBACK_TIMEOUT_MS = 180000
let activeOAuthFlow: ActiveOAuthFlow | null = null

const toBase64Url = (value: Buffer): string =>
	value
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '')

/**
 * Generates a PKCE verifier/challenge pair for OAuth native app flows.
 * @returns PKCE verifier and SHA256 challenge using base64url encoding.
 */
export const generatePkcePair = (): PkcePair => {
	const codeVerifier = toBase64Url(randomBytes(64))

	if (codeVerifier.length < PKCE_MIN_LENGTH || codeVerifier.length > PKCE_MAX_LENGTH) {
		throw new Error('Failed to generate a valid PKCE code_verifier length')
	}

	const codeChallenge = toBase64Url(createHash('sha256').update(codeVerifier).digest())

	return {
		codeVerifier,
		codeChallenge,
	}
}

const parseTokenResponse = (payload: unknown): OAuthTokens => {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error('Token response was not an object')
	}

	const raw = payload as Record<string, unknown>
	const accessToken = raw.access_token
	const refreshToken = raw.refresh_token
	const expiresInRaw = raw.expires_in
	const scope = raw.scope

	if (
		typeof accessToken !== 'string' ||
		typeof refreshToken !== 'string' ||
		(typeof expiresInRaw !== 'number' &&
			!(typeof expiresInRaw === 'string' && Number.isFinite(Number(expiresInRaw)))) ||
		typeof scope !== 'string'
	) {
		throw new Error('Token response missing required fields')
	}
	const expiresIn = typeof expiresInRaw === 'number' ? expiresInRaw : Number(expiresInRaw)

	return {
		accessToken,
		refreshToken,
		expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
		scope,
	}
}

const waitForAuthorizationCode = async (
	redirectUri: string,
	expectedState: string
): Promise<string> => {
	const redirectUrl = new URL(redirectUri)
	const hostname = redirectUrl.hostname || '127.0.0.1'
	const port = Number.parseInt(redirectUrl.port, 10)
	if (!Number.isFinite(port)) {
		throw new Error('Redirect URI must include a valid port')
	}

	return new Promise<string>((resolve, reject) => {
		let settled = false
		const finalize = (fn: () => void): void => {
			if (settled) {
				return
			}
			settled = true
			fn()
			activeOAuthFlow = null
		}

		const timeout = setTimeout(() => {
			finalize(() => {
				server.close()
				reject(new Error('Timed out waiting for OAuth callback'))
			})
		}, CALLBACK_TIMEOUT_MS)

		const server = createServer((request, response) => {
			try {
				const requestUrl = request.url ?? ''
				const callbackUrl = new URL(requestUrl, `http://${hostname}:${port}`)
				const authCode = callbackUrl.searchParams.get('code')
				const oauthError = callbackUrl.searchParams.get('error')
				const state = callbackUrl.searchParams.get('state')

				if (oauthError) {
					response.writeHead(400, { 'Content-Type': 'text/plain' })
					response.end('Authentication failed. You can close this tab.')
					clearTimeout(timeout)
					finalize(() => {
						server.close()
						reject(new Error(`OAuth error: ${oauthError}`))
					})
					return
				}

				if (!authCode) {
					response.writeHead(400, { 'Content-Type': 'text/plain' })
					response.end('Missing authorization code. You can close this tab.')
					return
				}
				if (state !== expectedState) {
					response.writeHead(400, { 'Content-Type': 'text/plain' })
					response.end('State verification failed. You can close this tab.')
					clearTimeout(timeout)
					finalize(() => {
						server.close()
						reject(new Error('OAuth state mismatch'))
					})
					return
				}

				response.writeHead(200, { 'Content-Type': 'text/plain' })
				response.end('Authentication complete. You can close this tab.')
				clearTimeout(timeout)
				finalize(() => {
					server.close()
					resolve(authCode)
				})
			} catch (error) {
				clearTimeout(timeout)
				finalize(() => {
					server.close()
					reject(error)
				})
			}
		})

		server.once('error', (error) => {
			clearTimeout(timeout)
			finalize(() => reject(error))
		})

		activeOAuthFlow = {
			cancel: () => {
				clearTimeout(timeout)
				finalize(() => {
					server.close()
					reject(new Error('OAuth flow was canceled by the user'))
				})
			},
		}

		server.listen(port, hostname)
	})
}

const buildAuthUrl = (
	config: OAuthConfig,
	redirectUri: string,
	codeChallenge: string,
	state: string
): string => {
	const url = new URL(config.authUrl)
	url.searchParams.set('client_id', config.clientId)
	url.searchParams.set('redirect_uri', redirectUri)
	url.searchParams.set('response_type', 'code')
	url.searchParams.set('scope', config.scopes.join(' '))
	url.searchParams.set('code_challenge', codeChallenge)
	url.searchParams.set('code_challenge_method', 'S256')
	url.searchParams.set('access_type', 'offline')
	url.searchParams.set('prompt', 'consent select_account')
	url.searchParams.set('include_granted_scopes', 'true')
	url.searchParams.set('state', state)
	return url.toString()
}

const exchangeCodeForTokens = async (
	config: OAuthConfig,
	redirectUri: string,
	codeVerifier: string,
	code: string
): Promise<OAuthTokens> => {
	const body = new URLSearchParams({
		code,
		client_id: config.clientId,
		redirect_uri: redirectUri,
		grant_type: 'authorization_code',
		code_verifier: codeVerifier,
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
		const detail = await response.text()
		throw new Error(`Token exchange failed (${response.status}): ${detail}`)
	}

	const tokenPayload: unknown = await response.json()
	return parseTokenResponse(tokenPayload)
}

const createLoopbackRedirectUri = async (): Promise<string> => {
	return new Promise<string>((resolve, reject) => {
		const probeServer = createServer()
		probeServer.once('error', (error) => reject(error))
		probeServer.listen(0, '127.0.0.1', () => {
			const address = probeServer.address()
			probeServer.close(() => {
				if (!address || typeof address === 'string') {
					reject(new Error('Failed to allocate loopback port'))
					return
				}
				resolve(`http://127.0.0.1:${address.port}`)
			})
		})
	})
}

/**
 * Runs an OAuth 2.0 authorization-code flow for installed desktop apps.
 * @param config OAuth configuration for a provider.
 * @returns Access and refresh tokens with expiry and granted scope.
 */
export const runOAuthFlow = async (config: OAuthConfig): Promise<OAuthTokens> => {
	const redirectUri = config.redirectUri ?? (await createLoopbackRedirectUri())
	const { codeVerifier, codeChallenge } = generatePkcePair()
	const state = toBase64Url(randomBytes(24))

	const authUrl = buildAuthUrl(config, redirectUri, codeChallenge, state)
	await shell.openExternal(authUrl)

	const authorizationCode = await waitForAuthorizationCode(redirectUri, state)
	return exchangeCodeForTokens(config, redirectUri, codeVerifier, authorizationCode)
}

/**
 * Cancels an in-progress OAuth browser callback wait, if active.
 * @returns True when an active OAuth flow was canceled.
 */
export const cancelActiveOAuthFlow = async (): Promise<boolean> => {
	if (!activeOAuthFlow) {
		return false
	}
	activeOAuthFlow.cancel()
	return true
}
