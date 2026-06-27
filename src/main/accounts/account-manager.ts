import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { google } from 'googleapis'
import type { AccountAddRequest, ImapAccountInput, ImapReconnectRequest } from '../../shared/ipc-api.js'
import type { Account, Provider } from '../../shared/models.js'
import { PROVIDER_REGISTRY, getProviderDescriptor } from '../../shared/provider-registry.js'
import { loadGoogleOAuthConfig, loadGoogleOAuthConfigByClientId, type GoogleOAuthConfig } from '../oauth/google-config.js'
import { acquireMicrosoftAccessToken, runMicrosoftOAuthFlow } from '../oauth/microsoft-auth.js'
import type { AccountConnector } from '../providers/connectors.js'
import { GmailProvider } from '../providers/gmail.js'
import { ImapProvider } from '../providers/imap.js'
import { OutlookProvider } from '../providers/outlook.js'
import type { MailProvider } from '../providers/types.js'
import { runOAuthFlow, type OAuthConfig, type OAuthTokens } from '../oauth/oauth-handler.js'
import { deleteImapCredentials, loadImapCredentials, saveImapCredentials, type ImapCredentials } from './imap-credential-store.js'
import { deleteTokens, saveTokens } from './token-store.js'

interface AccountStoreShape { readonly accounts: readonly Account[] }
interface StoreApi<T> { get: <K extends keyof T>(key: K) => T[K]; set: <K extends keyof T>(key: K, value: T[K]) => void }

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'] as const
const defaultStore: AccountStoreShape = { accounts: [] }

export class AccountManager {
	private readonly store = new Store<AccountStoreShape>({ name: 'accounts', defaults: defaultStore })
	private googleConfig: GoogleOAuthConfig | null = null
	private readonly connectors = new Map<Provider, AccountConnector>()

	constructor() {
		this.registerConnector({
			providers: ['gmail'],
			add: async (request) => {
				if (request.authentication !== 'oauth' || request.provider !== 'gmail') throw new Error('Invalid Gmail account request')
				return this.addGoogleAccount()
			},
			reconnect: async (account) => this.reconnectGoogleAccount(account),
			getProvider: async (account) => {
				const oauthConfig = await this.getGoogleOAuthConfigForAccount(account)
				return new GmailProvider(account.id, oauthConfig.client_id, oauthConfig.client_secret)
			},
		})
		this.registerConnector({
			providers: ['outlook'],
			add: async (request) => {
				if (request.authentication !== 'oauth' || request.provider !== 'outlook') throw new Error('Invalid Outlook account request')
				return this.addMicrosoftAccount()
			},
			reconnect: async (account) => this.reconnectMicrosoftAccount(account),
			getProvider: async (account) => new OutlookProvider(account.id, await acquireMicrosoftAccessToken(account.id, account.oauthAccountId)),
		})
		this.registerConnector({
			providers: PROVIDER_REGISTRY.filter((descriptor) => descriptor.transport === 'imap').map((descriptor) => descriptor.id),
			add: async (request) => {
				if (request.authentication !== 'app-password') throw new Error('Invalid IMAP account request')
				return this.addImapAccount(request)
			},
			reconnect: async (account, request) => this.reconnectImapAccount(account, request),
			getProvider: async (account) => this.getImapProvider(account),
		})
	}

	private storeApi(): StoreApi<AccountStoreShape> { return this.store as unknown as StoreApi<AccountStoreShape> }
	private readAccounts(): readonly Account[] { return this.storeApi().get('accounts') }
	private writeAccounts(accounts: readonly Account[]): void { this.storeApi().set('accounts', accounts) }

	/** Adds a new Google account by completing OAuth and loading the profile. @returns Created account record stored in metadata store. */
	async addGoogleAccount(): Promise<Account> {
		const oauthConfig = await this.getGoogleOAuthConfig()
		const authConfig: OAuthConfig = { authUrl: GOOGLE_AUTH_URL, tokenUrl: GOOGLE_TOKEN_URL, clientId: oauthConfig.client_id, clientSecret: oauthConfig.client_secret, scopes: GOOGLE_SCOPES }
		const tokens = await runOAuthFlow(authConfig)
		const profile = await this.fetchGoogleProfile(oauthConfig, tokens)
		this.assertGoogleConfigEmailMatches(oauthConfig, profile.email)
		const account: Account = { id: randomUUID(), provider: 'gmail', email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl, oauthClientId: oauthConfig.client_id }
		await saveTokens(account.id, tokens)
		this.writeAccounts([...this.readAccounts(), account])
		return account
	}

	/** Adds a new Microsoft account by completing OAuth and loading profile. @returns Created account record stored in metadata store. */
	async addMicrosoftAccount(): Promise<Account> {
		const accountId = randomUUID()
		const tokens = await runMicrosoftOAuthFlow(accountId)
		const profile = await this.fetchMicrosoftProfile(accountId)
		const account: Account = { id: accountId, provider: 'outlook', email: profile.email, displayName: profile.displayName, oauthAccountId: tokens.homeAccountId }
		this.writeAccounts([...this.readAccounts(), account])
		return account
	}

	/** Lists all stored account metadata. @returns Immutable array of account records. */
	listAccounts(): readonly Account[] { return this.readAccounts() }

	/** Finds one account by id. @param id Account identifier. @returns Matching account, or null if not found. */
	getAccount(id: string): Account | null { return this.readAccounts().find((item) => item.id === id) ?? null }

	/** Removes an account record and its encrypted token file. @param id Account identifier. @returns Promise that resolves once metadata and tokens are deleted. */
	async removeAccount(id: string): Promise<void> {
		await Promise.all([deleteTokens(id), deleteImapCredentials(id)])
		this.writeAccounts(this.readAccounts().filter((account) => account.id !== id))
	}

	/** Adds an account using its registered connector. @param request Validated account connection request. @returns Created account metadata. */
	async addAccount(request: AccountAddRequest): Promise<Account> {
		return this.getConnector(request.provider).add(request)
	}

	/** Reconnects an existing account using its registered connector. @param id Account identifier. @param request Optional replacement IMAP credentials. @returns Updated account metadata. */
	async reconnectAccount(id: string, request?: ImapReconnectRequest): Promise<Account> {
		const account = this.getAccount(id)
		if (!account) throw new Error(`Account not found: ${id}`)
		return this.getConnector(account.provider).reconnect(account, request)
	}

	/** Resolves an authenticated provider implementation for an account. @param accountId Internal account identifier. @returns Mail provider bound to account credentials. */
	async getProvider(accountId: string): Promise<MailProvider> {
		const account = this.getAccount(accountId)
		if (!account) throw new Error(`Account not found: ${accountId}`)
		return this.getConnector(account.provider).getProvider(account)
	}

	private registerConnector(connector: AccountConnector): void {
		for (const provider of connector.providers) {
			if (this.connectors.has(provider)) throw new Error(`Duplicate account connector: ${provider}`)
			this.connectors.set(provider, connector)
		}
	}

	private getConnector(provider: Provider): AccountConnector {
		const connector = this.connectors.get(provider)
		if (!connector) throw new Error(`Unsupported provider: ${provider}`)
		return connector
	}

	private async addImapAccount(request: ImapAccountInput): Promise<Account> {
		const accountId = randomUUID()
		const credentials = this.resolveImapCredentials(request.provider, request)
		const account: Account = {
			id: accountId,
			provider: request.provider,
			email: this.normalizeEmail(request.email),
			displayName: this.normalizeEmail(request.email),
		}
		await new ImapProvider(account.id, account.provider, credentials).validateConnection()
		await saveImapCredentials(account.id, credentials)
		this.writeAccounts([...this.readAccounts(), account])
		return account
	}

	private async reconnectImapAccount(account: Account, request?: ImapReconnectRequest): Promise<Account> {
		if (!request) throw new Error(`Enter a new app password to reconnect ${account.email}.`)
		const existing = await loadImapCredentials(account.id)
		const provider = account.provider as ImapAccountInput['provider']
		const credentials = this.resolveImapCredentials(provider, {
			provider,
			email: account.email,
			username: request.username,
			password: request.password,
			host: request.host,
			port: request.port,
			security: request.security,
		}, existing)
		await new ImapProvider(account.id, account.provider, credentials).validateConnection()
		await saveImapCredentials(account.id, credentials)
		return account
	}

	private async getImapProvider(account: Account): Promise<MailProvider> {
		const credentials = await loadImapCredentials(account.id)
		if (!credentials) throw new Error(`Missing IMAP credentials for ${account.email}. Reconnect the account.`)
		return new ImapProvider(account.id, account.provider, credentials)
	}

	private resolveImapCredentials(provider: ImapAccountInput['provider'], input: ImapAccountInput, existing?: ImapCredentials | null): ImapCredentials {
		const descriptor = getProviderDescriptor(provider)
		if (!descriptor || descriptor.transport !== 'imap') throw new Error(`Unsupported IMAP provider: ${provider}`)
		const username = input.username.trim()
		const password = input.password
		if (!username || !password) throw new Error('IMAP username and app password are required')
		if (provider !== 'imap' && (input.host !== undefined || input.port !== undefined || input.security !== undefined)) {
			throw new Error(`Server settings cannot override the ${descriptor.displayName} preset`)
		}
		const preset = descriptor.imapPreset
		const host = preset?.host ?? input.host?.trim() ?? existing?.host
		const port = preset?.port ?? input.port ?? existing?.port
		const security = preset?.security ?? input.security ?? existing?.security
		if (!host || !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|::1)$/i.test(host) || host.includes('..')) throw new Error('Invalid IMAP host')
		if (!port || !Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Invalid IMAP port')
		if (security !== 'tls' && security !== 'starttls') throw new Error('Custom IMAP must use TLS or STARTTLS')
		if (provider === 'proton' && host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') throw new Error('Proton Bridge must use a loopback host')
		return { host, port, security, username, password, allowSelfSigned: provider === 'proton' }
	}

	private normalizeEmail(email: string): string {
		const normalized = email.trim().toLowerCase()
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error('Invalid email address')
		return normalized
	}

	private async getGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
		const config = await loadGoogleOAuthConfig()
		if (!config) { this.googleConfig = null; throw new Error('Google OAuth config is missing. Complete BYOC setup first.') }
		if (!this.googleConfig || this.googleConfig.email !== config.email || this.googleConfig.client_id !== config.client_id || this.googleConfig.client_secret !== config.client_secret || this.googleConfig.project_id !== config.project_id) this.googleConfig = config
		return config
	}

	private async getGoogleOAuthConfigForAccount(account: Account): Promise<GoogleOAuthConfig> {
		if (!account.oauthClientId) {
			return this.getGoogleOAuthConfig()
		}
		const config = await loadGoogleOAuthConfigByClientId(account.oauthClientId)
		if (!config) {
			throw new Error(`Missing BYOC credentials for ${account.email}. Save the OAuth client with client ID ${account.oauthClientId}, then reconnect this account.`)
		}
		return config
	}

	private async reconnectGoogleAccount(account: Account): Promise<Account> {
		const oauthConfig = await this.getGoogleOAuthConfigForAccount(account)
		const authConfig: OAuthConfig = { authUrl: GOOGLE_AUTH_URL, tokenUrl: GOOGLE_TOKEN_URL, clientId: oauthConfig.client_id, clientSecret: oauthConfig.client_secret, scopes: GOOGLE_SCOPES }
		const tokens = await runOAuthFlow(authConfig)
		const profile = await this.fetchGoogleProfile(oauthConfig, tokens)
		this.assertGoogleConfigEmailMatches(oauthConfig, profile.email)
		if (profile.email.toLowerCase() !== account.email.toLowerCase()) {
			throw new Error(`Authenticated as ${profile.email}, but this account is ${account.email}. Choose the same Google account to reconnect.`)
		}
		const updated: Account = { ...account, displayName: profile.displayName, avatarUrl: profile.avatarUrl, oauthClientId: oauthConfig.client_id }
		await saveTokens(account.id, tokens)
		this.writeAccounts(this.readAccounts().map((item) => item.id === account.id ? updated : item))
		return updated
	}

	private async reconnectMicrosoftAccount(account: Account): Promise<Account> {
		const tokens = await runMicrosoftOAuthFlow(account.id)
		const profile = await this.fetchMicrosoftProfile(account.id)
		if (profile.email.toLowerCase() !== account.email.toLowerCase()) {
			throw new Error(`Authenticated as ${profile.email}, but this account is ${account.email}. Choose the same Microsoft account to reconnect.`)
		}
		const updated: Account = { ...account, displayName: profile.displayName, oauthAccountId: tokens.homeAccountId }
		this.writeAccounts(this.readAccounts().map((item) => item.id === account.id ? updated : item))
		return updated
	}

	private async fetchGoogleProfile(oauthConfig: GoogleOAuthConfig, tokens: OAuthTokens): Promise<{ email: string; displayName: string; avatarUrl?: string }> {
		const client = new google.auth.OAuth2({ clientId: oauthConfig.client_id, clientSecret: oauthConfig.client_secret })
		client.setCredentials({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
		const oauth2 = google.oauth2({ version: 'v2', auth: client })
		const { data } = await oauth2.userinfo.get()
		if (!data.email) throw new Error('Google profile did not include an email address')
		return { email: data.email, displayName: data.name ?? data.email, avatarUrl: data.picture ?? undefined }
	}

	private async fetchMicrosoftProfile(accountId: string): Promise<{ email: string; displayName: string }> {
		const accessToken = await acquireMicrosoftAccessToken(accountId)
		const response = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
		if (!response.ok) throw new Error(`Failed to fetch Microsoft profile (${response.status}): ${await response.text()}`)
		const payload = (await response.json()) as { readonly displayName?: string; readonly mail?: string; readonly userPrincipalName?: string }
		const email = payload.mail ?? payload.userPrincipalName
		if (!email) throw new Error('Microsoft profile did not include an email address')
		return { email, displayName: payload.displayName ?? email }
	}

	private assertGoogleConfigEmailMatches(oauthConfig: GoogleOAuthConfig, profileEmail: string): void {
		if (oauthConfig.email.toLowerCase() !== profileEmail.toLowerCase()) {
			throw new Error(`BYOC credentials are labeled for ${oauthConfig.email}, but Google authenticated ${profileEmail}. Save the matching Gmail email or choose the matching Google account.`)
		}
	}
}

export const accountManager = new AccountManager()
