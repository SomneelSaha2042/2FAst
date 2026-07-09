import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthTokens } from '../../../../src/main/oauth/oauth-handler'

const runOAuthFlowMock = vi.fn<() => Promise<OAuthTokens>>()
const loadGoogleOAuthConfigMock = vi.fn()
const saveTokensMock = vi.fn()
const deleteTokensMock = vi.fn()
const userInfoGetMock = vi.fn()
const runMicrosoftOAuthFlowMock = vi.fn()
const acquireMicrosoftAccessTokenMock = vi.fn()
const outlookProviderConstructorMock = vi.fn()
const imapProviderConstructorMock = vi.fn()
const validateImapConnectionMock = vi.fn()
const saveImapCredentialsMock = vi.fn()
const loadImapCredentialsMock = vi.fn()
const deleteImapCredentialsMock = vi.fn()

vi.mock('../../../../src/main/oauth/oauth-handler', () => ({
	runOAuthFlow: runOAuthFlowMock,
}))

vi.mock('../../../../src/main/oauth/google-config', () => ({
	loadGoogleOAuthConfig: loadGoogleOAuthConfigMock,
	loadGoogleOAuthConfigByClientId: async (clientId: string) => {
		const config = await loadGoogleOAuthConfigMock()
		return config.client_id === clientId ? config : null
	},
}))

vi.mock('../../../../src/main/oauth/microsoft-auth', () => ({
	acquireMicrosoftAccessToken: acquireMicrosoftAccessTokenMock,
	runMicrosoftOAuthFlow: runMicrosoftOAuthFlowMock,
}))

vi.mock('../../../../src/main/accounts/token-store', () => ({
	saveTokens: saveTokensMock,
	deleteTokens: deleteTokensMock,
}))

vi.mock('../../../../src/main/accounts/imap-credential-store', () => ({
	saveImapCredentials: saveImapCredentialsMock,
	loadImapCredentials: loadImapCredentialsMock,
	deleteImapCredentials: deleteImapCredentialsMock,
}))

vi.mock('../../../../src/main/providers/imap', () => ({
	ImapProvider: class {
		constructor(accountId: string, provider: string, credentials: unknown) {
			imapProviderConstructorMock(accountId, provider, credentials)
		}
		validateConnection = validateImapConnectionMock
	},
}))

vi.mock('../../../../src/main/providers/outlook', () => ({
	OutlookProvider: class {
		constructor(accountId: string, accessToken: string) {
			outlookProviderConstructorMock(accountId, accessToken)
		}
	},
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
			email: 'user@example.com',
			client_id: 'client-id',
			client_secret: 'client-secret',
		})
		runOAuthFlowMock.mockResolvedValue({
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: 12345,
			scope: 'scope',
		})
		runMicrosoftOAuthFlowMock.mockResolvedValue({
			accessToken: 'ms-access',
			refreshToken: '',
			expiresAt: 12345,
			scope: 'Mail.ReadWrite',
			homeAccountId: 'ms-home-1',
		})
		acquireMicrosoftAccessTokenMock.mockResolvedValue('graph-access')
		loadImapCredentialsMock.mockResolvedValue(null)
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			displayName: 'Outlook User',
			mail: 'outlook@example.com',
		}))))
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
		expect(added.oauthClientId).toBe('client-id')
		expect(listedAfterAdd).toHaveLength(1)
		expect(saveTokensMock).toHaveBeenCalledWith(
			added.id,
			expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh' })
		)
		expect(deleteTokensMock).toHaveBeenCalledWith(added.id)
		expect(listedAfterRemove).toHaveLength(0)
	})

	it('reconnects an existing gmail account without removing account metadata', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()
		const added = await manager.addGoogleAccount()
		runOAuthFlowMock.mockResolvedValueOnce({
			accessToken: 'fresh-access',
			refreshToken: 'fresh-refresh',
			expiresAt: 67890,
			scope: 'fresh-scope',
		})

		const reconnected = await manager.reconnectAccount(added.id)

		expect(reconnected.id).toBe(added.id)
		expect(reconnected.oauthClientId).toBe('client-id')
		expect(manager.listAccounts()).toHaveLength(1)
		expect(saveTokensMock).toHaveBeenLastCalledWith(
			added.id,
			expect.objectContaining({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' })
		)
		expect(deleteTokensMock).not.toHaveBeenCalled()
	})

	it('rejects a gmail OAuth result that does not match the BYOC email label', async () => {
		loadGoogleOAuthConfigMock.mockResolvedValueOnce({
			email: 'expected@example.com',
			client_id: 'client-id',
			client_secret: 'client-secret',
		})
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()

		await expect(manager.addGoogleAccount()).rejects.toThrow(
			'BYOC credentials are labeled for expected@example.com, but Google authenticated user@example.com.'
		)
		expect(saveTokensMock).not.toHaveBeenCalled()
	})

	it('stores the Microsoft home account id and uses it for Outlook provider lookup', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()

		const added = await manager.addMicrosoftAccount()
		await manager.getProvider(added.id)

		expect(added.provider).toBe('outlook')
		expect(added.email).toBe('outlook@example.com')
		expect(added.oauthAccountId).toBe('ms-home-1')
		// The access token is no longer acquired during getProvider, so the last call was during fetchMicrosoftProfile
		expect(acquireMicrosoftAccessTokenMock).toHaveBeenLastCalledWith(added.id)
		expect(outlookProviderConstructorMock).toHaveBeenCalledWith(added.id, 'ms-home-1')
	})

	it('keeps the same Outlook account id when reconnecting and updates home account id', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()
		const added = await manager.addMicrosoftAccount()
		runMicrosoftOAuthFlowMock.mockResolvedValueOnce({
			accessToken: 'fresh-ms-access',
			refreshToken: '',
			expiresAt: 67890,
			scope: 'Mail.ReadWrite',
			homeAccountId: 'ms-home-2',
		})

		const reconnected = await manager.reconnectAccount(added.id)

		expect(reconnected.id).toBe(added.id)
		expect(reconnected.email).toBe('outlook@example.com')
		expect(reconnected.oauthAccountId).toBe('ms-home-2')
		expect(manager.listAccounts()).toHaveLength(1)
	})

	it('adds a branded IMAP account through the shared connector and encrypts credentials', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()
		const added = await manager.addAccount({
			authentication: 'app-password',
			provider: 'zoho',
			email: 'USER@zoho.com',
			username: 'user@zoho.com',
			password: 'app-password',
		})
		expect(added).toMatchObject({ provider: 'zoho', email: 'user@zoho.com' })
		expect(imapProviderConstructorMock).toHaveBeenCalledWith(added.id, 'zoho', expect.objectContaining({
			host: 'imap.zoho.com',
			port: 993,
			allowSelfSigned: false,
		}))
		expect(validateImapConnectionMock).toHaveBeenCalledOnce()
		expect(saveImapCredentialsMock).toHaveBeenCalledWith(added.id, expect.objectContaining({ password: 'app-password' }))
	})

	it('rejects preset server overrides', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()
		await expect(manager.addAccount({
			authentication: 'app-password',
			provider: 'zoho',
			email: 'user@zoho.com',
			username: 'user@zoho.com',
			password: 'app-password',
			host: 'evil.example.com',
		})).rejects.toThrow('cannot override')
	})

	it('uses custom secure IMAP settings and deletes IMAP credentials on removal', async () => {
		const { AccountManager } = await import('../../../../src/main/accounts/account-manager')
		const manager = new AccountManager()
		const added = await manager.addAccount({
			authentication: 'app-password',
			provider: 'imap',
			email: 'user@example.com',
			username: 'user@example.com',
			password: 'app-password',
			host: 'mail.example.com',
			port: 143,
			security: 'starttls',
		})
		await manager.removeAccount(added.id)
		expect(saveImapCredentialsMock).toHaveBeenCalledWith(added.id, expect.objectContaining({ security: 'starttls' }))
		expect(deleteImapCredentialsMock).toHaveBeenCalledWith(added.id)
	})
})
