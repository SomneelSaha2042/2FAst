import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { google } from 'googleapis'
import type { Account, Provider } from '../../shared/models.js'
import { loadGoogleOAuthConfig, loadGoogleOAuthConfigByClientId, type GoogleOAuthConfig } from '../oauth/google-config.js'
import { acquireMicrosoftAccessToken, runMicrosoftOAuthFlow } from '../oauth/microsoft-auth.js'
import { GmailProvider } from '../providers/gmail.js'
import { OutlookProvider } from '../providers/outlook.js'
import type { MailProvider } from '../providers/types.js'
import { runOAuthFlow, type OAuthConfig, type OAuthTokens } from '../oauth/oauth-handler.js'
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
		await deleteTokens(id)
		this.writeAccounts(this.readAccounts().filter((account) => account.id !== id))
	}

	/** Adds an account for a specific provider. @param provider Target provider. @returns Created account metadata. */
	async addAccount(provider: Provider): Promise<Account> {
		if (provider === 'gmail') return this.addGoogleAccount()
		if (provider === 'outlook') return this.addMicrosoftAccount()
		throw new Error(`Unsupported provider: ${provider}`)
	}

	/** Reconnects an existing account by replacing only its OAuth token state. @param id Account identifier. @returns Updated account metadata. */
	async reconnectAccount(id: string): Promise<Account> {
		const account = this.getAccount(id)
		if (!account) throw new Error(`Account not found: ${id}`)
		if (account.provider === 'gmail') return this.reconnectGoogleAccount(account)
		if (account.provider === 'outlook') return this.reconnectMicrosoftAccount(account)
		throw new Error(`Unsupported provider: ${account.provider}`)
	}

	/** Resolves an authenticated provider implementation for an account. @param accountId Internal account identifier. @returns Mail provider bound to account credentials. */
	async getProvider(accountId: string): Promise<MailProvider> {
		const account = this.getAccount(accountId)
		if (!account) throw new Error(`Account not found: ${accountId}`)
		if (account.provider === 'outlook') return new OutlookProvider(account.id, await acquireMicrosoftAccessToken(account.id, account.oauthAccountId))
		if (account.provider !== 'gmail') throw new Error(`Unsupported provider: ${account.provider}`)
		const oauthConfig = await this.getGoogleOAuthConfigForAccount(account)
		return new GmailProvider(account.id, oauthConfig.client_id, oauthConfig.client_secret)
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
