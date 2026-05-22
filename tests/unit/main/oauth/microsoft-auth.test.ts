import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllAccountsMock = vi.fn()
const acquireTokenSilentMock = vi.fn()

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
				expiresOn: new Date('2027-01-01T00:00:00.000Z'),
				scopes: ['Mail.ReadWrite'],
			}
		}

		getTokenCache(): { getAllAccounts: () => Promise<unknown[]> } {
			return {
				getAllAccounts: getAllAccountsMock,
			}
		}

		async acquireTokenSilent(): Promise<unknown> {
			return acquireTokenSilentMock()
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
		getAllAccountsMock.mockResolvedValue([{ homeAccountId: '1' }])
		acquireTokenSilentMock.mockResolvedValue({ accessToken: 'silent-token' })
		const { acquireMicrosoftAccessToken } = await import('../../../../src/main/oauth/microsoft-auth')
		const token = await acquireMicrosoftAccessToken('acc-2')
		expect(token).toBe('silent-token')
	})
})
