import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthTokens } from '../../../../src/main/oauth/oauth-handler'

const runOAuthFlowMock = vi.fn<() => Promise<OAuthTokens>>()
const loadGoogleOAuthConfigMock = vi.fn()
const saveTokensMock = vi.fn()
const deleteTokensMock = vi.fn()
const userInfoGetMock = vi.fn()

vi.mock('../../../../src/main/oauth/oauth-handler', () => ({
	runOAuthFlow: runOAuthFlowMock,
}))

vi.mock('../../../../src/main/oauth/google-config', () => ({
	loadGoogleOAuthConfig: loadGoogleOAuthConfigMock,
}))

vi.mock('../../../../src/main/accounts/token-store', () => ({
	saveTokens: saveTokensMock,
	deleteTokens: deleteTokensMock,
}))

class MockStore<T extends Record<string, unknown>> {
	private state: T

	constructor(options: { defaults: T }) {
		this.state = options.defaults
	}

	get<K extends keyof T>(key: K): T[K] {
		return this.state[key]
	}

	set<K extends keyof T>(key: K, value: T[K]): void {
		this.state = {
			...this.state,
			[key]: value,
		}
	}
}

vi.mock('electron-store', () => ({
	default: MockStore,
}))

vi.mock('googleapis', () => ({
	google: {
		auth: {
			OAuth2: class {
				setCredentials(): void {}
			},
		},
		oauth2: () => ({
			userinfo: {
				get: userInfoGetMock,
			},
		}),
	},
}))

describe('account manager', () => {
	beforeEach(() => {
		vi.resetModules()
		vi.clearAllMocks()
		loadGoogleOAuthConfigMock.mockResolvedValue({
			client_id: 'client-id',
			client_secret: 'client-secret',
		})
		runOAuthFlowMock.mockResolvedValue({
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: 12345,
			scope: 'scope',
		})
		userInfoGetMock.mockResolvedValue({
			data: {
				email: 'user@example.com',
				name: 'User Name',
				picture: 'https://example.com/avatar.png',
			},
		})
	})

	it('adds, lists, and removes account with token operations', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()

		const added = await manager.addGoogleAccount()
		const listedAfterAdd = manager.listAccounts()

		await manager.removeAccount(added.id)
		const listedAfterRemove = manager.listAccounts()

		expect(added.email).toBe('user@example.com')
		expect(listedAfterAdd).toHaveLength(1)
		expect(saveTokensMock).toHaveBeenCalledWith(
			added.id,
			expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh' })
		)
		expect(deleteTokensMock).toHaveBeenCalledWith(added.id)
		expect(listedAfterRemove).toHaveLength(0)
	})
})
