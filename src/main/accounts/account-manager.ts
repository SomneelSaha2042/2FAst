import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { google } from 'googleapis'
import type { Account, Provider } from '../../shared/models.js'
import { loadGoogleOAuthConfig, type GoogleOAuthConfig } from '../oauth/google-config.js'
import {
	runOAuthFlow,
	type OAuthConfig,
	type OAuthTokens,
} from '../oauth/oauth-handler.js'
import { deleteTokens, saveTokens } from './token-store.js'

interface AccountStoreShape {
	readonly accounts: readonly Account[]
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPES = [
	'https://www.googleapis.com/auth/gmail.modify',
	'https://www.googleapis.com/auth/userinfo.email',
	'https://www.googleapis.com/auth/userinfo.profile',
] as const

const defaultStore: AccountStoreShape = {
	accounts: [],
}

export class AccountManager {
	private readonly store = new Store<AccountStoreShape>({
		name: 'accounts',
		defaults: defaultStore,
	})

	private googleConfig: GoogleOAuthConfig | null = null

	/**
	 * Adds a new Google account by completing OAuth and loading the profile.
	 * @returns Created account record stored in metadata store.
	 */
	async addGoogleAccount(): Promise<Account> {
		const oauthConfig = await this.getGoogleOAuthConfig()
		const authConfig: OAuthConfig = {
			authUrl: GOOGLE_AUTH_URL,
			tokenUrl: GOOGLE_TOKEN_URL,
			clientId: oauthConfig.client_id,
			clientSecret: oauthConfig.client_secret,
			scopes: GOOGLE_SCOPES,
		}
		const tokens = await runOAuthFlow(authConfig)
		const profile = await this.fetchGoogleProfile(oauthConfig, tokens)

		const account: Account = {
			id: randomUUID(),
			provider: 'gmail',
			email: profile.email,
			displayName: profile.displayName,
			avatarUrl: profile.avatarUrl,
		}

		await saveTokens(account.id, tokens)
		const accounts = this.store.get('accounts')
		this.store.set('accounts', [...accounts, account])
		return account
	}

	/**
	 * Lists all stored account metadata.
	 * @returns Immutable array of account records.
	 */
	listAccounts(): readonly Account[] {
		return this.store.get('accounts')
	}

	/**
	 * Finds one account by id.
	 * @param id Account identifier.
	 * @returns Matching account, or null if not found.
	 */
	getAccount(id: string): Account | null {
		const account = this.store.get('accounts').find((item: Account) => item.id === id)
		return account ?? null
	}

	/**
	 * Removes an account record and its encrypted token file.
	 * @param id Account identifier.
	 * @returns Promise that resolves once metadata and tokens are deleted.
	 */
	async removeAccount(id: string): Promise<void> {
		await deleteTokens(id)
		const remaining = this.store.get('accounts').filter((account: Account) => account.id !== id)
		this.store.set('accounts', remaining)
	}

	/**
	 * Adds an account for a specific provider.
	 * @param provider Target provider.
	 * @returns Created account metadata.
	 */
	async addAccount(provider: Provider): Promise<Account> {
		if (provider !== 'gmail') {
			throw new Error('Only Gmail is supported in Phase 3')
		}
		return this.addGoogleAccount()
	}

	private async getGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
		if (!this.googleConfig) {
			const config = await loadGoogleOAuthConfig()
			if (!config) {
				throw new Error('Google OAuth config is missing. Complete BYOC setup first.')
			}
			this.googleConfig = config
		}
		return this.googleConfig
	}

	private async fetchGoogleProfile(
		oauthConfig: GoogleOAuthConfig,
		tokens: OAuthTokens
	): Promise<{ email: string; displayName: string; avatarUrl?: string }> {
		const client = new google.auth.OAuth2({
			clientId: oauthConfig.client_id,
			clientSecret: oauthConfig.client_secret,
		})
		client.setCredentials({
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
		})
		const oauth2 = google.oauth2({ version: 'v2', auth: client })
		const { data } = await oauth2.userinfo.get()
		if (!data.email) {
			throw new Error('Google profile did not include an email address')
		}
		return {
			email: data.email,
			displayName: data.name ?? data.email,
			avatarUrl: data.picture ?? undefined,
		}
	}
}

export const accountManager = new AccountManager()
