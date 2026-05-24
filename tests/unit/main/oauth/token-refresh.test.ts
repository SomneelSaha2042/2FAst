import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthConfig, OAuthTokens } from '../../../../src/main/oauth/oauth-handler'

const tokenStoreMocks = vi.hoisted(() => ({
	deleteTokens: vi.fn(),
	saveTokens: vi.fn(),
}))

vi.mock('../../../../src/main/accounts/token-store', () => tokenStoreMocks)

const config: OAuthConfig = {
	authUrl: 'https://accounts.example/auth',
	tokenUrl: 'https://accounts.example/token',
	clientId: 'client-id',
	clientSecret: 'client-secret',
	scopes: [],
}

const expiredTokens: OAuthTokens = {
	accessToken: 'old-access',
	refreshToken: 'old-refresh',
	expiresAt: 1,
	scope: 'mail.read',
}

describe('ensureValidAccessToken', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		tokenStoreMocks.deleteTokens.mockReset()
		tokenStoreMocks.saveTokens.mockReset()
	})

	it('clears stale tokens and asks for reconnect on unauthorized refresh', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_description: 'Unauthorized' }), { status: 401 })))
		const { ensureValidAccessToken } = await import('../../../../src/main/oauth/token-refresh')

		await expect(ensureValidAccessToken('account-1', config, expiredTokens)).rejects.toThrow(
			'Authorization expired or no longer matches the current OAuth credentials. Please reconnect this account from Settings.'
		)
		expect(tokenStoreMocks.deleteTokens).toHaveBeenCalledWith('account-1')
		expect(tokenStoreMocks.saveTokens).not.toHaveBeenCalled()
	})
})
