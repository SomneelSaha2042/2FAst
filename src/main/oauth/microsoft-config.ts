export interface MicrosoftOAuthConfig {
	readonly clientId: string
	readonly authority: string
	readonly scopes: readonly string[]
	readonly redirectUri: string
}

export const MICROSOFT_CONFIG: MicrosoftOAuthConfig = {
	clientId: '7321bea3-a7ad-43c4-aee5-0b2237b04103',
	authority: 'https://login.microsoftonline.com/common',
	scopes: ['Mail.ReadWrite', 'Mail.Send', 'User.Read', 'offline_access'],
	redirectUri: 'http://localhost',
}
