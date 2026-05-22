import { PublicClientApplication, CryptoProvider, type Configuration } from '@azure/msal-node'
import { shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { URL } from 'node:url'
import type { OAuthTokens } from './oauth-handler.js'
import { MICROSOFT_CONFIG } from './microsoft-config.js'
import { loadTokenCacheByKey, saveTokenCacheByKey } from '../accounts/token-store.js'

const CALLBACK_TIMEOUT_MS = 180000

interface LoopbackWaiter {
	readonly redirectUri: string
	readonly waitForCode: (expectedState: string) => Promise<string>
}

interface ActiveMicrosoftOAuthFlow {
	readonly cancel: () => void
}

const toBase64Url = (value: Buffer): string =>
	value
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '')

const closeServer = (server: Server): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error)
				return
			}
			resolve()
		})
	})

let activeMicrosoftOAuthFlow: ActiveMicrosoftOAuthFlow | null = null

const createLoopbackWaiter = async (): Promise<LoopbackWaiter> => {
	const configuredRedirect = new URL(MICROSOFT_CONFIG.redirectUri)
	const hostname = configuredRedirect.hostname || 'localhost'
	const server = createServer()
	await new Promise<void>((resolve, reject) => {
		server.once('error', (error) => reject(error))
		server.listen(0, hostname, () => resolve())
	})
	const address = server.address()
	if (!address || typeof address === 'string') {
		throw new Error('Loopback server address was unavailable')
	}
	const redirectUri = `${configuredRedirect.protocol}//${hostname}:${address.port}`

	const waitForCode = async (expectedState: string): Promise<string> =>
		new Promise<string>((resolve, reject) => {
			let settled = false
			const finalize = (action: () => void): void => {
				if (settled) {
					return
				}
				settled = true
				action()
				activeMicrosoftOAuthFlow = null
			}
			const timeout = setTimeout(() => {
				finalize(() => {
					void closeServer(server)
					reject(new Error('Timed out waiting for OAuth callback'))
				})
			}, CALLBACK_TIMEOUT_MS)

			server.removeAllListeners('request')
			server.on('request', async (request, response) => {
				try {
					const callbackUrl = new URL(request.url ?? '', redirectUri)
					const code = callbackUrl.searchParams.get('code')
					const state = callbackUrl.searchParams.get('state')
					const error = callbackUrl.searchParams.get('error')
					if (error) {
						response.writeHead(400, { 'Content-Type': 'text/plain' })
						response.end('Authentication failed. You can close this tab.')
						clearTimeout(timeout)
						finalize(() => {
							void closeServer(server)
							reject(new Error(`OAuth error: ${error}`))
						})
						return
					}
					if (!code) {
						response.writeHead(400, { 'Content-Type': 'text/plain' })
						response.end('Missing authorization code. You can close this tab.')
						return
					}
					if (state !== expectedState) {
						response.writeHead(400, { 'Content-Type': 'text/plain' })
						response.end('State verification failed. You can close this tab.')
						clearTimeout(timeout)
						finalize(() => {
							void closeServer(server)
							reject(new Error('OAuth state mismatch'))
						})
						return
					}
					response.writeHead(200, { 'Content-Type': 'text/plain' })
					response.end('Authentication complete. You can close this tab.')
					clearTimeout(timeout)
					finalize(() => {
						void closeServer(server)
						resolve(code)
					})
				} catch (requestError) {
					clearTimeout(timeout)
					finalize(() => {
						void closeServer(server)
						reject(requestError)
					})
				}
			})

			activeMicrosoftOAuthFlow = {
				cancel: () => {
					clearTimeout(timeout)
					finalize(() => {
						void closeServer(server)
						reject(new Error('Microsoft OAuth flow was canceled by the user'))
					})
				},
			}
		})

	return { redirectUri, waitForCode }
}

/**
 * Cancels an in-progress Microsoft OAuth callback wait, if active.
 * @returns True when an active Microsoft OAuth flow was canceled.
 */
export const cancelActiveMicrosoftOAuthFlow = async (): Promise<boolean> => {
	if (!activeMicrosoftOAuthFlow) {
		return false
	}
	activeMicrosoftOAuthFlow.cancel()
	return true
}

const createPca = (accountId: string): PublicClientApplication => {
	const cachePlugin = {
		beforeCacheAccess: async (context: { tokenCache: { deserialize: (cache: string) => void } }) => {
			const cache = await loadTokenCacheByKey(accountId)
			if (cache) {
				context.tokenCache.deserialize(cache)
			}
		},
		afterCacheAccess: async (context: {
			cacheHasChanged: boolean
			tokenCache: { serialize: () => string }
		}) => {
			if (context.cacheHasChanged) {
				await saveTokenCacheByKey(accountId, context.tokenCache.serialize())
			}
		},
	}
	const config: Configuration = {
		auth: {
			clientId: MICROSOFT_CONFIG.clientId,
			authority: MICROSOFT_CONFIG.authority,
		},
		cache: {
			cachePlugin,
		},
	}
	return new PublicClientApplication(config)
}

/**
 * Runs Microsoft OAuth via MSAL public-client auth-code flow with PKCE.
 * @param accountId Account id used as the cache key for token persistence.
 * @returns OAuth token bundle mapped to the shared token shape.
 */
export const runMicrosoftOAuthFlow = async (accountId: string): Promise<OAuthTokens> => {
	if (!MICROSOFT_CONFIG.clientId || MICROSOFT_CONFIG.clientId.startsWith('<')) {
		throw new Error('Microsoft OAuth client ID is not configured in microsoft-config.ts')
	}
	const pca = createPca(accountId)
	const cryptoProvider = new CryptoProvider()
	const { verifier, challenge } = await cryptoProvider.generatePkceCodes()
	const state = toBase64Url(randomBytes(24))
	const { redirectUri, waitForCode } = await createLoopbackWaiter()
	const authUrl = await pca.getAuthCodeUrl({
		scopes: MICROSOFT_CONFIG.scopes as string[],
		redirectUri,
		codeChallenge: challenge,
		codeChallengeMethod: 'S256',
		state,
		prompt: 'select_account',
	})
	await shell.openExternal(authUrl)
	const code = await waitForCode(state)
	const result = await pca.acquireTokenByCode({
		code,
		scopes: MICROSOFT_CONFIG.scopes as string[],
		redirectUri,
		codeVerifier: verifier,
	})
	if (!result?.accessToken || !result.expiresOn) {
		throw new Error('Microsoft token exchange returned an invalid response')
	}
	return {
		accessToken: result.accessToken,
		refreshToken: '',
		expiresAt: Math.floor(result.expiresOn.getTime() / 1000),
		scope: (result.scopes ?? MICROSOFT_CONFIG.scopes).join(' '),
	}
}

/**
 * Gets a Microsoft Graph access token for an account using cached MSAL state.
 * @param accountId Account id used as the cache key.
 * @returns Access token resolved silently from cache/refresh token.
 */
export const acquireMicrosoftAccessToken = async (accountId: string): Promise<string> => {
	const pca = createPca(accountId)
	const accounts = await pca.getTokenCache().getAllAccounts()
	const account = accounts[0]
	if (!account) {
		throw new Error('Microsoft account cache is empty. Reconnect the account.')
	}
	const result = await pca.acquireTokenSilent({
		account,
		scopes: MICROSOFT_CONFIG.scopes as string[],
		forceRefresh: false,
	})
	if (!result?.accessToken) {
		throw new Error('Failed to acquire Microsoft access token silently')
	}
	return result.accessToken
}
