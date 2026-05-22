export type Provider = 'gmail' | 'outlook'

export interface Account {
	readonly id: string
	readonly provider: Provider
	readonly email: string
	readonly displayName: string
	readonly avatarUrl?: string
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
