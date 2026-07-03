import type { DraftMessage } from '../../shared/ipc-api.js'
import type { Label, MailFolder, Message, Provider, Thread } from '../../shared/models.js'

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
	getThread?(threadId: string): Promise<Thread>
	listLabels(): Promise<Label[]>
	listFolders(): Promise<MailFolder[]>
	sendMessage?(draft: DraftMessage): Promise<Message>
	trashMessage?(messageId: string): Promise<void>
	toggleRead?(messageId: string, isRead: boolean): Promise<void>
	toggleStar?(messageId: string, isStarred: boolean): Promise<void>
	dispose?(): Promise<void>
}
