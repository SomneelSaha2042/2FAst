export type Provider = 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'fastmail' | 'zoho' | 'proton' | 'imap'
export type ProviderTransport = 'gmail-api' | 'microsoft-graph' | 'imap'
export type ProviderAuthentication = 'oauth' | 'app-password'
export type MailboxStyle = 'labels' | 'folders'
export type ImapSecurity = 'tls' | 'starttls'

export interface ProviderCapabilities {
	readonly folders: boolean
	readonly labels: boolean
	readonly threads: boolean
	readonly send: boolean
	readonly mutations: boolean
}

export interface ImapPreset {
	readonly host: string
	readonly port: number
	readonly security: ImapSecurity
}

export interface ProviderDescriptor {
	readonly id: Provider
	readonly displayName: string
	readonly transport: ProviderTransport
	readonly authentication: ProviderAuthentication
	readonly mailboxStyle: MailboxStyle
	readonly capabilities: ProviderCapabilities
	readonly setupInstructions: string
	readonly imapPreset?: ImapPreset
}

export interface Account {
	readonly id: string
	readonly provider: Provider
	readonly email: string
	readonly displayName: string
	readonly avatarUrl?: string
	readonly oauthClientId?: string
	readonly oauthAccountId?: string
}

export interface MessageAddress {
	readonly name?: string
	readonly email: string
}

export interface Attachment {
	readonly id: string
	readonly filename: string
	readonly mimeType: string
	readonly size: number
}

export interface Message {
	readonly id: string
	readonly accountId: string
	readonly threadId: string
	readonly subject: string
	readonly from: MessageAddress
	readonly to: readonly MessageAddress[]
	readonly cc?: readonly MessageAddress[]
	readonly bcc?: readonly MessageAddress[]
	readonly date: string
	readonly snippet: string
	readonly bodyHtml?: string
	readonly bodyText?: string
	readonly labelIds: readonly string[]
	readonly isRead: boolean
	readonly isStarred: boolean
	readonly attachments: readonly Attachment[]
}

export interface Thread {
	readonly id: string
	readonly accountId: string
	readonly subject: string
	readonly snippet: string
	readonly lastMessageDate: string
	readonly messageCount: number
	readonly messages: readonly Message[]
	readonly labelIds: readonly string[]
	readonly isRead: boolean
}

export interface Label {
	readonly id: string
	readonly accountId: string
	readonly name: string
	readonly type: 'system' | 'user'
	readonly messageCount?: number
	readonly unreadCount?: number
}

export interface MailFolder {
	readonly id: string
	readonly accountId: string
	readonly displayName: string
	readonly parentFolderId?: string
	readonly totalItemCount?: number
	readonly unreadItemCount?: number
}
