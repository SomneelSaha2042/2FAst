import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllAccountsMock = vi.fn()
const acquireTokenSilentMock = vi.fn()

const createCachedAccount = (homeAccountId: string) => ({
	homeAccountId,
	environment: 'login.windows.net',
	tenantId: 'tenant-1',
	username: `${homeAccountId}@example.com`,
	localAccountId: `local-${homeAccountId}`,
})

vi.mock('electron', () => ({
	shell: {
		openExternal: vi.fn().mockResolvedValue(undefined),
	},
}))

vi.mock('../../../../src/main/accounts/token-store', () => ({
	loadTokenCacheByKey: vi.fn().mockResolvedValue(null),
	saveTokenCacheByKey: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@azure/msal-node', () => ({
	PublicClientApplication: class {
		async getAuthCodeUrl(): Promise<string> {
			return 'https://login.example/authorize'
		}

		async acquireTokenByCode(): Promise<unknown> {
			return {
				accessToken: 'access',
				account: { homeAccountId: 'home-1' },
				expiresOn: new Date('2027-01-01T00:00:00.000Z'),
				scopes: ['Mail.ReadWrite'],
			}
		}

		getTokenCache(): { getAllAccounts: () => Promise<unknown[]> } {
			return {
				getAllAccounts: getAllAccountsMock,
			}
		}

		async acquireTokenSilent(request: unknown): Promise<unknown> {
			return acquireTokenSilentMock(request)
		}
	},
	CryptoProvider: class {
		async generatePkceCodes(): Promise<{ verifier: string; challenge: string }> {
			return { verifier: 'verifier', challenge: 'challenge' }
		}
	},
}))

describe('microsoft auth', () => {
	beforeEach(() => {
		vi.resetModules()
		vi.clearAllMocks()
	})

	it('rejects oauth flow when client id is not configured', async () => {
		vi.doMock('../../../../src/main/oauth/microsoft-config', () => ({
			MICROSOFT_CONFIG: {
				clientId: '<YOUR_AZURE_CLIENT_ID>',
				authority: 'https://login.microsoftonline.com/common',
				scopes: ['Mail.ReadWrite', 'Mail.Send', 'User.Read', 'offline_access'],
				redirectUri: 'http://localhost',
			},
		}))
		const { runMicrosoftOAuthFlow } = await import('../../../../src/main/oauth/microsoft-auth')
		await expect(runMicrosoftOAuthFlow('acc-1')).rejects.toThrow(
			'Microsoft OAuth client ID is not configured'
		)
	})

	it('acquires access token silently from cache', async () => {
		getAllAccountsMock.mockResolvedValue([createCachedAccount('1')])
		acquireTokenSilentMock.mockResolvedValue({ accessToken: 'silent-token' })
		const { acquireMicrosoftAccessToken } = await import('../../../../src/main/oauth/microsoft-auth')
		const token = await acquireMicrosoftAccessToken('acc-2')
		expect(token).toBe('silent-token')
	})

	it('selects the expected cached account when home account id is provided', async () => {
		getAllAccountsMock.mockResolvedValue([createCachedAccount('other'), createCachedAccount('expected')])
		acquireTokenSilentMock.mockResolvedValue({ accessToken: 'selected-token' })
		const { acquireMicrosoftAccessToken } = await import('../../../../src/main/oauth/microsoft-auth')

		const token = await acquireMicrosoftAccessToken('acc-3', 'expected')

		expect(token).toBe('selected-token')
		expect(acquireTokenSilentMock).toHaveBeenCalledWith(expect.objectContaining({
			account: expect.objectContaining({ homeAccountId: 'expected' }),
		}))
	})

	it('asks for reconnect when the expected cached account is missing', async () => {
		getAllAccountsMock.mockResolvedValue([createCachedAccount('other')])
		const { acquireMicrosoftAccessToken } = await import('../../../../src/main/oauth/microsoft-auth')

		await expect(acquireMicrosoftAccessToken('acc-4', 'expected')).rejects.toThrow(
			'Microsoft account cache is missing the expected account. Reconnect the account.'
		)
	})
})
