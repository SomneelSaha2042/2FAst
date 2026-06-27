import { ImapFlow, type FetchMessageObject, type ImapFlowOptions, type MessageAddressObject, type SearchObject } from 'imapflow'
import { MailParser, type AttachmentStream, type MessageText } from 'mailparser'
import { Readable } from 'node:stream'
import type { Attachment, Label, MailFolder, Message, MessageAddress, Provider } from '../../shared/models.js'
import type { ImapCredentials } from '../accounts/imap-credential-store.js'
import type { ListMessagesOptions, ListMessagesResult, MailProvider } from './types.js'

const DEFAULT_MAX_RESULTS = 50
const INBOX = 'INBOX'

interface MessageLocator {
	readonly mailbox: string
	readonly uid: number
}

interface ParsedMessageContent {
	readonly bodyHtml?: string
	readonly bodyText?: string
	readonly attachments: readonly Attachment[]
}

const encodeMessageId = (locator: MessageLocator): string =>
	Buffer.from(JSON.stringify(locator), 'utf8').toString('base64url')

const decodeMessageId = (messageId: string): MessageLocator => {
	try {
		const value = JSON.parse(Buffer.from(messageId, 'base64url').toString('utf8')) as Record<string, unknown>
		if (typeof value.mailbox !== 'string' || value.mailbox.length === 0 || typeof value.uid !== 'number' || !Number.isInteger(value.uid) || value.uid < 1) {
			throw new Error('Invalid locator')
		}
		return { mailbox: value.mailbox, uid: value.uid }
	} catch {
		throw new Error('Invalid IMAP message identifier')
	}
}

const mapAddress = (address?: MessageAddressObject): MessageAddress => ({
	name: address?.name || undefined,
	email: address?.address ?? '',
})

const mapAddresses = (addresses?: MessageAddressObject[]): MessageAddress[] =>
	(addresses ?? []).map(mapAddress).filter((address) => address.email.length > 0)

const mapListMessage = (accountId: string, mailbox: string, source: FetchMessageObject): Message => {
	const envelope = source.envelope
	const dateValue = envelope?.date ?? source.internalDate
	const date = dateValue ? new Date(dateValue).toISOString() : new Date(0).toISOString()
	const id = encodeMessageId({ mailbox, uid: source.uid })
	return {
		id,
		accountId,
		threadId: id,
		subject: envelope?.subject ?? '(No subject)',
		from: mapAddress(envelope?.from?.[0]),
		to: mapAddresses(envelope?.to),
		cc: envelope?.cc ? mapAddresses(envelope.cc) : undefined,
		bcc: envelope?.bcc ? mapAddresses(envelope.bcc) : undefined,
		date,
		snippet: '',
		labelIds: [mailbox],
		isRead: source.flags?.has('\\Seen') ?? false,
		isStarred: source.flags?.has('\\Flagged') ?? false,
		attachments: [],
	}
}

const parseMessageContent = async (source: Buffer): Promise<ParsedMessageContent> =>
	new Promise((resolve, reject) => {
		const attachments: Attachment[] = []
		let bodyHtml: string | undefined
		let bodyText: string | undefined
		const parser = new MailParser({ skipImageLinks: true })
		parser.on('data', (part: AttachmentStream | MessageText) => {
			if (part.type === 'attachment') {
				attachments.push({
					id: part.contentId ?? part.checksum ?? part.filename ?? `attachment-${attachments.length + 1}`,
					filename: part.filename ?? 'attachment',
					mimeType: part.contentType,
					size: part.size,
				})
				part.release()
				return
			}
			bodyHtml = typeof part.html === 'string' ? part.html : undefined
			bodyText = part.text
		})
		parser.once('error', reject)
		parser.once('end', () => resolve({ bodyHtml, bodyText, attachments }))
		Readable.from(source).pipe(parser)
	})

export class ImapProvider implements MailProvider {
	readonly provider: Provider

	constructor(
		private readonly accountId: string,
		provider: Provider,
		private readonly credentials: ImapCredentials
	) {
		this.provider = provider
	}

	/**
	 * Verifies that the configured IMAP account can authenticate and list mailboxes.
	 * @returns Promise that resolves after successful validation.
	 */
	async validateConnection(): Promise<void> {
		await this.withClient(async (client) => {
			await client.list()
		})
	}

	/**
	 * Lists messages from an IMAP mailbox.
	 * @param options Optional folder, search, date, and pagination controls.
	 * @returns Mapped message list and optional next offset token.
	 */
	async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResult> {
		const mailbox = options?.folderId ?? INBOX
		return this.withClient(async (client) => {
			const lock = await client.getMailboxLock(mailbox, { readOnly: true })
			try {
				const query: SearchObject = { all: true }
				if (options?.receivedAfter) query.since = new Date(options.receivedAfter)
				if (options?.searchText?.trim()) query.text = options.searchText.trim()
				if (options?.query?.trim()) query.subject = options.query.trim()
				const result = await client.search(query, { uid: true })
				const uids = result === false ? [] : result.slice().sort((a, b) => b - a)
				const offset = Number.parseInt(options?.pageToken ?? '0', 10)
				const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0
				const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS
				const selected = uids.slice(safeOffset, safeOffset + maxResults)
				const fetched = selected.length > 0
					? await client.fetchAll(selected, { uid: true, flags: true, envelope: true, internalDate: true }, { uid: true })
					: []
				const byUid = new Map(fetched.map((message) => [message.uid, message]))
				const messages = selected.flatMap((uid) => {
					const message = byUid.get(uid)
					return message ? [mapListMessage(this.accountId, mailbox, message)] : []
				})
				const nextOffset = safeOffset + selected.length
				return { messages, nextPageToken: nextOffset < uids.length ? String(nextOffset) : undefined }
			} finally {
				lock.release()
			}
		})
	}

	/**
	 * Fetches and parses one full IMAP message.
	 * @param messageId Opaque mailbox and UID locator.
	 * @returns Fully mapped message with parsed bodies and attachment metadata.
	 */
	async getMessage(messageId: string): Promise<Message> {
		const locator = decodeMessageId(messageId)
		return this.withClient(async (client) => {
			const lock = await client.getMailboxLock(locator.mailbox, { readOnly: true })
			try {
				const source = await client.fetchOne(locator.uid, { uid: true, flags: true, envelope: true, internalDate: true, source: true }, { uid: true })
				if (!source || !source.source) throw new Error('IMAP message not found')
				const content = await parseMessageContent(source.source)
				const base = mapListMessage(this.accountId, locator.mailbox, source)
				return {
					...base,
					snippet: content.bodyText?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
					bodyHtml: content.bodyHtml,
					bodyText: content.bodyText,
					attachments: content.attachments,
				}
			} finally {
				lock.release()
			}
		})
	}

	/**
	 * Lists selectable IMAP mailboxes.
	 * @returns Folder collection with available message counts.
	 */
	async listFolders(): Promise<MailFolder[]> {
		return this.withClient(async (client) => {
			const folders = await client.list({ statusQuery: { messages: true, unseen: true } })
			return folders
				.filter((folder) => !folder.flags.has('\\Noselect'))
				.map((folder) => ({
					id: folder.path,
					accountId: this.accountId,
					displayName: folder.name,
					parentFolderId: folder.parentPath || undefined,
					totalItemCount: folder.status?.messages,
					unreadItemCount: folder.status?.unseen,
				}))
		})
	}

	/**
	 * Returns no labels because IMAP uses folders.
	 * @returns Empty label collection.
	 */
	async listLabels(): Promise<Label[]> {
		return []
	}

	private clientOptions(): ImapFlowOptions {
		return {
			host: this.credentials.host,
			port: this.credentials.port,
			secure: this.credentials.security === 'tls',
			doSTARTTLS: this.credentials.security === 'starttls',
			auth: { user: this.credentials.username, pass: this.credentials.password },
			tls: { rejectUnauthorized: !this.credentials.allowSelfSigned },
			logger: false,
			disableAutoIdle: true,
		}
	}

	private async withClient<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
		const client = new ImapFlow(this.clientOptions())
		try {
			await client.connect()
			return await operation(client)
		} finally {
			try {
				await client.logout()
			} catch {
				client.close()
			}
		}
	}
}
