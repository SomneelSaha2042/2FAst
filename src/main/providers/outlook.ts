import { Client } from '@microsoft/microsoft-graph-client'
import type { MailFolder, Message, MessageAddress } from '../../shared/models.js'
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
	private cachedClient: Client | null = null

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

	private getClient(): Client {
		if (this.cachedClient) return this.cachedClient
		this.cachedClient = Client.init({
			authProvider: async (done: (error: Error | null, accessToken: string | null) => void) => {
				try {
					const token = await acquireMicrosoftAccessToken(this.accountId, this.oauthAccountId)
					done(null, token)
				} catch (error) {
					done(error instanceof Error ? error : new Error(String(error)), null)
				}
			},
		})
		return this.cachedClient
	}
}
