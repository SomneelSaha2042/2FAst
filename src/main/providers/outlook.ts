import { Client } from '@microsoft/microsoft-graph-client'
import type { DraftMessage } from '../../shared/ipc-api.js'
import type { Label, MailFolder, Message, MessageAddress, Thread } from '../../shared/models.js'
import type { ListMessagesOptions, ListMessagesResult, MailProvider } from './types.js'
import { acquireMicrosoftAccessToken } from '../oauth/microsoft-auth.js'

const DEFAULT_MAX_RESULTS = 50
const GRAPH_MESSAGE_SELECT =
	'id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,flag,hasAttachments,conversationId'

interface GraphEmailAddress {
	readonly name?: string
	readonly address?: string
}

interface GraphRecipient {
	readonly emailAddress?: GraphEmailAddress
}

interface GraphMessage {
	readonly id?: string
	readonly subject?: string
	readonly from?: GraphRecipient
	readonly toRecipients?: readonly GraphRecipient[]
	readonly ccRecipients?: readonly GraphRecipient[]
	readonly receivedDateTime?: string
	readonly bodyPreview?: string
	readonly body?: { readonly contentType?: string; readonly content?: string }
	readonly isRead?: boolean
	readonly flag?: { readonly flagStatus?: string }
	readonly hasAttachments?: boolean
	readonly conversationId?: string
}

interface GraphMessageListResponse {
	readonly value?: readonly GraphMessage[]
	readonly '@odata.nextLink'?: string
}

interface GraphMailFolder {
	readonly id?: string
	readonly displayName?: string
	readonly parentFolderId?: string
	readonly totalItemCount?: number
	readonly unreadItemCount?: number
}

interface GraphMailFolderListResponse {
	readonly value?: readonly GraphMailFolder[]
}

const mapAddress = (recipient?: GraphRecipient): MessageAddress => ({
	name: recipient?.emailAddress?.name || undefined,
	email: recipient?.emailAddress?.address ?? '',
})

const mapAddresses = (recipients?: readonly GraphRecipient[]): MessageAddress[] =>
	(recipients ?? [])
		.map((recipient) => mapAddress(recipient))
		.filter((recipient) => recipient.email.length > 0)

const mapMessage = (accountId: string, source: GraphMessage, includeBody: boolean, folderId?: string): Message => ({
	id: source.id ?? '',
	accountId,
	threadId: source.conversationId ?? source.id ?? '',
	subject: source.subject ?? '(No subject)',
	from: mapAddress(source.from),
	to: mapAddresses(source.toRecipients),
	cc: source.ccRecipients ? mapAddresses(source.ccRecipients) : undefined,
	date: source.receivedDateTime ?? new Date(0).toISOString(),
	snippet: source.bodyPreview ?? '',
	bodyHtml: includeBody ? source.body?.content ?? undefined : undefined,
	bodyText: includeBody && source.body?.contentType === 'text' ? source.body.content : undefined,
	labelIds: folderId ? [folderId] : [],
	isRead: Boolean(source.isRead),
	isStarred: source.flag?.flagStatus === 'flagged',
	attachments: source.hasAttachments
		? [{ id: `${source.id ?? 'message'}-attachments`, filename: 'Attachments', mimeType: '', size: 0 }]
		: [],
})

const extractNextPageToken = (nextLink?: string): string | undefined => {
	if (!nextLink) {
		return undefined
	}
	try {
		const parsed = new URL(nextLink)
		const skip = parsed.searchParams.get('$skip')
		return skip ?? undefined
	} catch {
		return undefined
	}
}

const escapeODataString = (value: string): string => value.replace(/'/g, "''")

const isIsoDate = (value: string): boolean => !Number.isNaN(Date.parse(value))

export class OutlookProvider implements MailProvider {
	readonly provider = 'outlook' as const

	constructor(
		private readonly accountId: string,
		private readonly oauthAccountId?: string
	) {}

	/**
	 * Lists Outlook messages using Graph list endpoint.
	 * @param options Optional folder, query, and pagination controls.
	 * @returns Mapped message list and optional next skip token.
	 */
	async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResult> {
		const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS
		const skip = Number.parseInt(options?.pageToken ?? '0', 10)
		const endpoint = options?.folderId ? `/me/mailFolders/${options.folderId}/messages` : '/me/messages'
		let request = this.getClient()
			.api(endpoint)
			.select(GRAPH_MESSAGE_SELECT)
			.top(maxResults)
		const searchText = options?.searchText?.trim()
		if (searchText) {
			request = request.search(`"${searchText}"`)
		} else {
			request = request.orderby('receivedDateTime desc')
			const filters = this.buildListFilters(options)
			if (filters.length > 0) {
				request = request.filter(filters.join(' and '))
			}
			request = request.skip(Number.isFinite(skip) ? skip : 0)
		}
		const response = (await request.get()) as GraphMessageListResponse
		const messages = (response.value ?? []).map((message) => mapMessage(this.accountId, message, false, options?.folderId))
		return {
			messages,
			nextPageToken: extractNextPageToken(response['@odata.nextLink']),
		}
	}

	private buildListFilters(options?: ListMessagesOptions): string[] {
		const filters: string[] = []
		if (options?.receivedAfter && isIsoDate(options.receivedAfter)) {
			filters.push(`receivedDateTime ge ${options.receivedAfter}`)
		}
		if (options?.query?.trim()) {
			filters.push(`contains(subject,'${escapeODataString(options.query.trim())}')`)
		}
		return filters
	}

	/**
	 * Fetches a full Outlook message.
	 * @param messageId Provider message identifier.
	 * @returns Fully mapped message including HTML body.
	 */
	async getMessage(messageId: string): Promise<Message> {
		const response = (await this.getClient().api(`/me/messages/${messageId}`).get()) as GraphMessage
		return mapMessage(this.accountId, response, true)
	}

	/**
	 * Fetches all messages in a Graph conversation and maps to thread shape.
	 * @param threadId Outlook conversation id.
	 * @returns Thread representation with ordered messages.
	 */
	async getThread(threadId: string): Promise<Thread> {
		const response = (await this.getClient()
			.api('/me/messages')
			.filter(`conversationId eq '${threadId}'`)
			.orderby('receivedDateTime asc')
			.get()) as GraphMessageListResponse
		const messages = (response.value ?? []).map((message) => mapMessage(this.accountId, message, true))
		const last = messages[messages.length - 1]
		return {
			id: threadId,
			accountId: this.accountId,
			subject: messages[0]?.subject ?? '(No subject)',
			snippet: last?.snippet ?? '',
			lastMessageDate: last?.date ?? new Date(0).toISOString(),
			messageCount: messages.length,
			messages,
			labelIds: [],
			isRead: messages.every((message) => message.isRead),
		}
	}

	/**
	 * Outlook uses folders and not Gmail-style labels.
	 * @returns Empty label list.
	 */
	async listLabels(): Promise<Label[]> {
		return []
	}

	/**
	 * Lists Outlook mail folders.
	 * @returns Mapped folder collection.
	 */
	async listFolders(): Promise<MailFolder[]> {
		const response = (await this.getClient().api('/me/mailFolders').top(100).get()) as GraphMailFolderListResponse
		return (response.value ?? [])
			.filter((folder): folder is GraphMailFolder & { id: string; displayName: string } =>
				Boolean(folder.id && folder.displayName)
			)
			.map((folder) => ({
				id: folder.id,
				accountId: this.accountId,
				displayName: folder.displayName,
				parentFolderId: folder.parentFolderId,
				totalItemCount: folder.totalItemCount,
				unreadItemCount: folder.unreadItemCount,
			}))
	}

	/**
	 * Sends a message draft for this provider.
	 * @param _draft Draft payload.
	 * @returns A promise that rejects because send is not implemented in this phase.
	 */
	async sendMessage(_draft: DraftMessage): Promise<Message> {
		void _draft
		throw new Error('Outlook sendMessage is not implemented in Phase 5')
	}

	/**
	 * Trashes a message for this provider.
	 * @param _messageId Provider message identifier.
	 * @returns A promise that rejects because trash is not implemented in this phase.
	 */
	async trashMessage(_messageId: string): Promise<void> {
		void _messageId
		throw new Error('Outlook trashMessage is not implemented in Phase 5')
	}

	/**
	 * Toggles read status for this provider.
	 * @param _messageId Provider message identifier.
	 * @param _isRead Desired read state.
	 * @returns A promise that rejects because toggle is not implemented in this phase.
	 */
	async toggleRead(_messageId: string, _isRead: boolean): Promise<void> {
		void _messageId
		void _isRead
		throw new Error('Outlook toggleRead is not implemented in Phase 5')
	}

	/**
	 * Toggles starred status for this provider.
	 * @param _messageId Provider message identifier.
	 * @param _isStarred Desired star state.
	 * @returns A promise that rejects because toggle is not implemented in this phase.
	 */
	async toggleStar(_messageId: string, _isStarred: boolean): Promise<void> {
		void _messageId
		void _isStarred
		throw new Error('Outlook toggleStar is not implemented in Phase 5')
	}

	private getClient(): Client {
		return Client.init({
			authProvider: async (done: (error: Error | null, accessToken: string | null) => void) => {
				try {
					const token = await acquireMicrosoftAccessToken(this.accountId, this.oauthAccountId)
					done(null, token)
				} catch (error) {
					done(error instanceof Error ? error : new Error(String(error)), null)
				}
			},
		})
	}
}
