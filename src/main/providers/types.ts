import type { MailFolder, Message, Provider } from '../../shared/models.js'

export interface ListMessagesOptions {
	readonly labelId?: string
	readonly folderId?: string
	readonly query?: string
	readonly searchText?: string
	readonly receivedAfter?: string
	readonly pageToken?: string
	readonly maxResults?: number
}

export interface ListMessagesResult {
	readonly messages: Message[]
	readonly nextPageToken?: string
}

export interface MailProvider {
	readonly provider: Provider
	listMessages(options?: ListMessagesOptions): Promise<ListMessagesResult>
	getMessage(messageId: string): Promise<Message>
	listFolders(): Promise<MailFolder[]>
	dispose?(): Promise<void>
}
