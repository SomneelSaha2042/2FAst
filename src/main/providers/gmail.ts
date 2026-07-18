import { google } from 'googleapis'
import type { gmail_v1 } from 'googleapis'
import type { Attachment, MailFolder, Message, MessageAddress } from '../../shared/models.js'
import type { OAuthConfig } from '../oauth/oauth-handler.js'
import { ensureValidAccessToken } from '../oauth/token-refresh.js'
import { loadTokens } from '../accounts/token-store.js'
import type { ListMessagesOptions, ListMessagesResult, MailProvider } from './types.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DEFAULT_MAX_RESULTS = 50
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
	private cachedClient: gmail_v1.Gmail | null = null
	private lastTokenRefresh: number = 0

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
			options?.labelId ? undefined : '(in:inbox OR in:spam OR in:trash)',
			options?.query,
			options?.searchText,
			options?.receivedAfter
				? `after:${Math.floor(new Date(options.receivedAfter).getTime() / 1000)}`
				: undefined,
		].filter((part): part is string => Boolean(part && part.trim().length > 0))
		const response = await gmail.users.messages.list({
			userId: 'me',
			labelIds: options?.labelId ? [options.labelId] : undefined,
			q: queryParts.length > 0 ? queryParts.join(' ') : undefined,
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
	 * Lists folders for providers that support folder APIs.
	 * @returns Empty collection because Gmail uses labels in this phase.
	 */
	async listFolders(): Promise<MailFolder[]> {
		return []
	}



	private async getClient(): Promise<gmail_v1.Gmail> {
		if (this.cachedClient && this.lastTokenRefresh > Date.now() + 60_000) {
			return this.cachedClient
		}
		const tokens = await loadTokens(this.accountId)
		if (!tokens) {
			this.cachedClient = null
			throw new Error('Account is missing OAuth tokens. Reconnect the account.')
		}

		const refreshConfig: OAuthConfig = {
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: GOOGLE_TOKEN_URL,
			clientId: this.clientId,
			clientSecret: this.clientSecret,
			scopes: [],
		}
		const validTokens = await ensureValidAccessToken(this.accountId, refreshConfig, tokens)
		
		if (this.cachedClient && this.lastTokenRefresh === validTokens.expiresAt) {
			return this.cachedClient
		}

		const oauthClient = new google.auth.OAuth2({
			clientId: this.clientId,
			clientSecret: this.clientSecret,
		})
		
		oauthClient.setCredentials({
			access_token: validTokens.accessToken,
			refresh_token: validTokens.refreshToken,
		})
		
		this.cachedClient = google.gmail({ version: 'v1', auth: oauthClient })
		this.lastTokenRefresh = validTokens.expiresAt
		return this.cachedClient
	}
}
