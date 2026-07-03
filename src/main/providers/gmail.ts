import { google } from 'googleapis'
import type { gmail_v1 } from 'googleapis'
import type { DraftMessage } from '../../shared/ipc-api.js'
import type { Attachment, Label, MailFolder, Message, MessageAddress, Thread } from '../../shared/models.js'
import type { OAuthConfig } from '../oauth/oauth-handler.js'
import { ensureValidAccessToken } from '../oauth/token-refresh.js'
import { loadTokens } from '../accounts/token-store.js'
import type { ListMessagesOptions, ListMessagesResult, MailProvider } from './types.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DEFAULT_MAX_RESULTS = 50
const IMPORTANT_LABELS = new Set(['INBOX', 'SENT', 'DRAFT', 'DRAFTS', 'SPAM', 'TRASH'])
const METADATA_HEADERS = ['Subject', 'From', 'To', 'Cc', 'Date']

interface ParsedBodies {
	readonly bodyHtml?: string
	readonly bodyText?: string
}

const decodeBase64Url = (value?: string | null): string => {
	if (!value) {
		return ''
	}
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
	const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
	return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf-8')
}

const normalizeDate = (headerDate?: string, internalDate?: string | null): string => {
	if (headerDate) {
		const parsed = Date.parse(headerDate)
		if (!Number.isNaN(parsed)) {
			return new Date(parsed).toISOString()
		}
	}
	if (internalDate) {
		const internalMillis = Number.parseInt(internalDate, 10)
		if (Number.isFinite(internalMillis)) {
			return new Date(internalMillis).toISOString()
		}
	}
	return new Date(0).toISOString()
}

const parseAddress = (raw: string): MessageAddress => {
	const match = raw.match(/^(?<name>.*)<(?<email>[^>]+)>$/)
	if (!match?.groups) {
		return {
			email: raw.trim(),
		}
	}
	return {
		name: match.groups.name.trim().replace(/^"|"$/g, '') || undefined,
		email: match.groups.email.trim(),
	}
}

const parseAddressList = (raw?: string): MessageAddress[] => {
	if (!raw) {
		return []
	}
	return raw
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.map((value) => parseAddress(value))
}

const getHeaderMap = (headers?: gmail_v1.Schema$MessagePartHeader[]): Map<string, string> => {
	const map = new Map<string, string>()
	for (const header of headers ?? []) {
		if (header.name && header.value) {
			map.set(header.name.toLowerCase(), header.value)
		}
	}
	return map
}

const collectParts = (
	part: gmail_v1.Schema$MessagePart | undefined,
	bodies: ParsedBodies,
	attachments: Attachment[]
): void => {
	if (!part) {
		return
	}
	if (part.filename && part.filename.length > 0) {
		attachments.push({
			id: part.body?.attachmentId ?? part.partId ?? part.filename,
			filename: part.filename,
			mimeType: part.mimeType ?? 'application/octet-stream',
			size: part.body?.size ?? 0,
		})
	}
	if (part.mimeType === 'text/html' && part.body?.data && !bodies.bodyHtml) {
		;(bodies as { bodyHtml?: string }).bodyHtml = decodeBase64Url(part.body.data)
	}
	if (part.mimeType === 'text/plain' && part.body?.data && !bodies.bodyText) {
		;(bodies as { bodyText?: string }).bodyText = decodeBase64Url(part.body.data)
	}
	for (const child of part.parts ?? []) {
		collectParts(child, bodies, attachments)
	}
}

const mapGmailMessage = (
	accountId: string,
	source: gmail_v1.Schema$Message,
	includeBodies: boolean
): Message => {
	const payload = source.payload
	const headerMap = getHeaderMap(payload?.headers)
	const parsedBodies: ParsedBodies = {}
	const attachments: Attachment[] = []

	if (payload?.parts?.length) {
		for (const part of payload.parts) {
			collectParts(part, parsedBodies, attachments)
		}
	} else if (payload?.body?.data) {
		if (payload.mimeType === 'text/html') {
			;(parsedBodies as { bodyHtml?: string }).bodyHtml = decodeBase64Url(payload.body.data)
		}
		if (payload.mimeType === 'text/plain') {
			;(parsedBodies as { bodyText?: string }).bodyText = decodeBase64Url(payload.body.data)
		}
	}

	const fromValue = headerMap.get('from') ?? ''
	const toValue = headerMap.get('to')
	const ccValue = headerMap.get('cc')
	const subject = headerMap.get('subject') ?? '(No subject)'
	const date = normalizeDate(headerMap.get('date'), source.internalDate)
	const labelIds = source.labelIds ?? []

	return {
		id: source.id ?? '',
		accountId,
		threadId: source.threadId ?? '',
		subject,
		from: parseAddress(fromValue),
		to: parseAddressList(toValue),
		cc: ccValue ? parseAddressList(ccValue) : undefined,
		date,
		snippet: source.snippet ?? '',
		bodyHtml: includeBodies ? parsedBodies.bodyHtml : undefined,
		bodyText: includeBodies ? parsedBodies.bodyText : undefined,
		labelIds,
		isRead: !labelIds.includes('UNREAD'),
		isStarred: labelIds.includes('STARRED'),
		attachments,
	}
}

export class GmailProvider implements MailProvider {
	readonly provider = 'gmail' as const

	constructor(
		private readonly accountId: string,
		private readonly clientId: string,
		private readonly clientSecret: string
	) {}

	/**
	 * Lists Gmail messages for an account.
	 * @param options Optional filtering and pagination controls.
	 * @returns Mapped message list and the next page token when available.
	 */
	async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResult> {
		const gmail = await this.getClient()
		const queryParts = [
			options?.query,
			options?.searchText,
			options?.receivedAfter
				? `after:${Math.floor(new Date(options.receivedAfter).getTime() / 1000)}`
				: undefined,
		].filter((part): part is string => Boolean(part && part.trim().length > 0))
		const response = await gmail.users.messages.list({
			userId: 'me',
			labelIds: options?.labelId ? [options.labelId] : undefined,
			q: queryParts.length > 0 ? queryParts.join(' ') : (options?.labelId ? undefined : 'in:inbox OR in:spam OR in:trash'),
			pageToken: options?.pageToken,
			maxResults: options?.maxResults ?? DEFAULT_MAX_RESULTS,
			includeSpamTrash: true,
		})
		const ids = response.data.messages ?? []
		const detailed = await Promise.all(
			ids.map(async (entry: gmail_v1.Schema$Message) => {
				const details = await gmail.users.messages.get({
					userId: 'me',
					id: entry.id ?? '',
					format: 'metadata',
					metadataHeaders: METADATA_HEADERS,
				})
				return mapGmailMessage(this.accountId, details.data, false)
			})
		)
		return {
			messages: detailed,
			nextPageToken: response.data.nextPageToken ?? undefined,
		}
	}

	/**
	 * Fetches a full Gmail message by id.
	 * @param messageId Provider message identifier.
	 * @returns Fully mapped message with parsed MIME body fields.
	 */
	async getMessage(messageId: string): Promise<Message> {
		const gmail = await this.getClient()
		const response = await gmail.users.messages.get({
			userId: 'me',
			id: messageId,
			format: 'full',
		})
		return mapGmailMessage(this.accountId, response.data, true)
	}

	/**
	 * Fetches a Gmail thread and maps all thread messages.
	 * @param threadId Provider thread identifier.
	 * @returns Mapped thread object with nested message collection.
	 */
	async getThread(threadId: string): Promise<Thread> {
		const gmail = await this.getClient()
		const response = await gmail.users.threads.get({
			userId: 'me',
			id: threadId,
			format: 'full',
		})
		const messages = (response.data.messages ?? []).map((item: gmail_v1.Schema$Message) =>
			mapGmailMessage(this.accountId, item, true)
		)
		const last = messages[messages.length - 1]
		return {
			id: response.data.id ?? threadId,
			accountId: this.accountId,
			subject: messages[0]?.subject ?? '(No subject)',
			snippet: last?.snippet ?? '',
			lastMessageDate: last?.date ?? new Date(0).toISOString(),
			messageCount: messages.length,
			messages,
			labelIds: last?.labelIds ?? [],
			isRead: messages.every((message: Message) => message.isRead),
		}
	}

	/**
	 * Lists Gmail labels for the account.
	 * @returns Label collection with mapped type and count fields.
	 */
	async listLabels(): Promise<Label[]> {
		const gmail = await this.getClient()
		const response = await gmail.users.labels.list({ userId: 'me' })
		const labels = response.data.labels ?? []
		const detailed = await Promise.all(
			labels.map(async (label: gmail_v1.Schema$Label) => {
				if (!label.id || !IMPORTANT_LABELS.has(label.id)) {
					return label
				}
				const details = await gmail.users.labels.get({
					userId: 'me',
					id: label.id,
				})
				return {
					...label,
					...details.data,
				}
			})
		)
		return detailed
			.filter((label: gmail_v1.Schema$Label): label is gmail_v1.Schema$Label & { id: string; name: string } =>
				Boolean(label.id && label.name)
			)
			.map((label: gmail_v1.Schema$Label & { id: string; name: string }) => ({
				id: label.id,
				accountId: this.accountId,
				name: label.name,
				type: label.type === 'system' ? 'system' : 'user',
				messageCount: label.messagesTotal ?? undefined,
				unreadCount: label.messagesUnread ?? undefined,
			}))
	}

	/**
	 * Lists folders for providers that support folder APIs.
	 * @returns Empty collection because Gmail uses labels in this phase.
	 */
	async listFolders(): Promise<MailFolder[]> {
		return []
	}

	/**
	 * Sends a message draft for this provider.
	 * @param _draft Draft payload.
	 * @returns A promise that rejects because send is not implemented in Phase 4.
	 */
	async sendMessage(_draft: DraftMessage): Promise<Message> {
		void _draft
		throw new Error('Gmail sendMessage is not implemented in Phase 4')
	}

	/**
	 * Moves a message to trash.
	 * @param messageId Provider message identifier.
	 * @returns Promise that resolves when the API call completes.
	 */
	async trashMessage(messageId: string): Promise<void> {
		const gmail = await this.getClient()
		await gmail.users.messages.trash({
			userId: 'me',
			id: messageId,
		})
	}

	/**
	 * Adds or removes unread status from a message.
	 * @param messageId Provider message identifier.
	 * @param isRead Target read state.
	 * @returns Promise that resolves when modify request completes.
	 */
	async toggleRead(messageId: string, isRead: boolean): Promise<void> {
		const gmail = await this.getClient()
		await gmail.users.messages.modify({
			userId: 'me',
			id: messageId,
			requestBody: isRead ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] },
		})
	}

	/**
	 * Adds or removes starred status from a message.
	 * @param messageId Provider message identifier.
	 * @param isStarred Target starred state.
	 * @returns Promise that resolves when modify request completes.
	 */
	async toggleStar(messageId: string, isStarred: boolean): Promise<void> {
		const gmail = await this.getClient()
		await gmail.users.messages.modify({
			userId: 'me',
			id: messageId,
			requestBody: isStarred ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] },
		})
	}

	private async getClient(): Promise<gmail_v1.Gmail> {
		const tokens = await loadTokens(this.accountId)
		if (!tokens) {
			throw new Error('Account is missing OAuth tokens. Reconnect the account.')
		}

		const oauthClient = new google.auth.OAuth2({
			clientId: this.clientId,
			clientSecret: this.clientSecret,
		})
		const refreshConfig: OAuthConfig = {
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: GOOGLE_TOKEN_URL,
			clientId: this.clientId,
			clientSecret: this.clientSecret,
			scopes: [],
		}
		const validTokens = await ensureValidAccessToken(this.accountId, refreshConfig, tokens)
		oauthClient.setCredentials({
			access_token: validTokens.accessToken,
			refresh_token: validTokens.refreshToken,
		})
		return google.gmail({ version: 'v1', auth: oauthClient })
	}
}
