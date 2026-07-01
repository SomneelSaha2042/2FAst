import { ImapFlow, type FetchMessageObject, type ImapFlowOptions, type MessageAddressObject, type SearchObject } from 'imapflow'
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

interface ImapBodyPart {
	readonly part?: string
	readonly type?: string
	readonly subtype?: string
	readonly encoding?: string
	readonly size?: number
	readonly id?: string
	readonly parameters?: Record<string, string>
	readonly disposition?: string
	readonly dispositionParameters?: Record<string, string>
	readonly childNodes?: readonly ImapBodyPart[]
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

const readStreamToString = async (stream: Readable, encoding = 'utf-8'): Promise<string> => {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
		stream.on('error', reject)
		stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding as BufferEncoding)))
	})
}

function decodeQuotedPrintable(input: string): string {
	const cleaned = input.replace(/=\r?\n/g, '')
	const bytes: number[] = []
	let i = 0
	while (i < cleaned.length) {
		const char = cleaned[i]
		if (char === '=' && i + 2 < cleaned.length) {
			const hex = cleaned.slice(i + 1, i + 3)
			if (/^[0-9A-F]{2}$/i.test(hex)) {
				bytes.push(parseInt(hex, 16))
				i += 3
				continue
			}
		}
		bytes.push(cleaned.charCodeAt(i))
		i++
	}
	return Buffer.from(bytes).toString('utf-8')
}

function decodeBase64(input: string): string {
	return Buffer.from(input, 'base64').toString('utf-8')
}

function decodePart(content: string, encoding?: string): string {
	const cleanEncoding = (encoding || '').toLowerCase()
	if (cleanEncoding === 'base64') {
		return decodeBase64(content)
	}
	if (cleanEncoding === 'quoted-printable') {
		return decodeQuotedPrintable(content)
	}
	return content
}

function findTextParts(node?: ImapBodyPart): { plainPartId?: string; htmlPartId?: string } {
	const result: { plainPartId?: string; htmlPartId?: string } = {}
	const traverse = (n?: ImapBodyPart) => {
		if (!n) return
		const type = (n.type || '').toLowerCase()
		const subtype = (n.subtype || '').toLowerCase()
		const disposition = (n.disposition || '').toLowerCase()
		
		if (disposition !== 'attachment') {
			if (type === 'text') {
				if (subtype === 'plain') {
					result.plainPartId = n.part || '1'
				} else if (subtype === 'html') {
					result.htmlPartId = n.part || '1'
				}
			}
		}
		if (n.childNodes) {
			n.childNodes.forEach(traverse)
		}
	}
	traverse(node)
	return result
}

function findNodeByPart(node: ImapBodyPart | undefined, partId: string): ImapBodyPart | null {
	if (!node) return null
	if (node.part === partId || (partId === '1' && !node.part && (!node.childNodes || node.childNodes.length === 0))) {
		return node
	}
	if (node.childNodes) {
		for (const child of node.childNodes) {
			const found = findNodeByPart(child, partId)
			if (found) return found
		}
	}
	return null
}

function findAttachments(node?: ImapBodyPart): Attachment[] {
	const attachments: Attachment[] = []
	let count = 0
	const traverse = (n?: ImapBodyPart) => {
		if (!n) return
		const type = (n.type || '').toLowerCase()
		const subtype = (n.subtype || '').toLowerCase()
		const disposition = (n.disposition || '').toLowerCase()
		
		const isMultipart = type === 'multipart'
		const isExplicitAttachment = disposition === 'attachment'
		const isPrimaryText = !isExplicitAttachment && type === 'text' && (subtype === 'plain' || subtype === 'html')
		
		if (!isMultipart && (isExplicitAttachment || !isPrimaryText)) {
			count++
			const filename = n.dispositionParameters?.filename || n.parameters?.name || `attachment-${count}`
			attachments.push({
				id: n.id || n.parameters?.['content-id'] || `attachment-${count}`,
				filename,
				mimeType: `${n.type}/${n.subtype}`,
				size: n.size || 0,
			})
		}
		if (n.childNodes) {
			n.childNodes.forEach(traverse)
		}
	}
	traverse(node)
	return attachments
}

export class ImapProvider implements MailProvider {
	readonly provider: Provider
	private client: ImapFlow | null = null

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
		const client = await this.ensureConnected()
		try {
			await client.list()
		} finally {
			await this.dispose()
		}
	}

	/**
	 * Lists messages from an IMAP mailbox.
	 * @param options Optional folder, search, date, and pagination controls.
	 * @returns Mapped message list and optional next offset token.
	 */
	async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResult> {
		const mailbox = options?.folderId ?? INBOX
		const client = await this.ensureConnected()
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
	}

	/**
	 * Fetches and parses one full IMAP message.
	 * @param messageId Opaque mailbox and UID locator.
	 * @returns Fully mapped message with parsed bodies and attachment metadata.
	 */
	async getMessage(messageId: string): Promise<Message> {
		const locator = decodeMessageId(messageId)
		const client = await this.ensureConnected()
		const lock = await client.getMailboxLock(locator.mailbox, { readOnly: true })
		try {
			const source = await client.fetchOne(locator.uid, { uid: true, flags: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true })
			if (!source || !source.bodyStructure) throw new Error('IMAP message not found')
			
			const textParts = findTextParts(source.bodyStructure as ImapBodyPart)
			let bodyText = ''
			let bodyHtml = ''
			
			if (textParts.plainPartId) {
				const downloadResult = await client.download(locator.uid, textParts.plainPartId, { uid: true })
				const raw = await readStreamToString(downloadResult.content)
				const plainNode = findNodeByPart(source.bodyStructure as ImapBodyPart, textParts.plainPartId)
				bodyText = decodePart(raw, plainNode?.encoding)
			}
			
			if (textParts.htmlPartId) {
				const downloadResult = await client.download(locator.uid, textParts.htmlPartId, { uid: true })
				const raw = await readStreamToString(downloadResult.content)
				const htmlNode = findNodeByPart(source.bodyStructure as ImapBodyPart, textParts.htmlPartId)
				bodyHtml = decodePart(raw, htmlNode?.encoding)
			}
			
			const base = mapListMessage(this.accountId, locator.mailbox, source)
			const attachments = findAttachments(source.bodyStructure as ImapBodyPart)
			
			return {
				...base,
				snippet: bodyText.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
				bodyHtml: bodyHtml || undefined,
				bodyText: bodyText || undefined,
				attachments,
			}
		} finally {
			lock.release()
		}
	}

	/**
	 * Lists selectable IMAP mailboxes.
	 * @returns Folder collection with available message counts.
	 */
	async listFolders(): Promise<MailFolder[]> {
		const client = await this.ensureConnected()
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
	}

	/**
	 * Returns no labels because IMAP uses folders.
	 * @returns Empty label collection.
	 */
	async listLabels(): Promise<Label[]> {
		return []
	}

	/**
	 * Closes the persistent IMAP client connection.
	 * @returns Promise that resolves when connection is closed.
	 */
	async dispose(): Promise<void> {
		if (this.client) {
			const c = this.client
			this.client = null
			try {
				await c.logout()
			} catch {
				c.close()
			}
		}
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

	private async ensureConnected(): Promise<ImapFlow> {
		if (this.client && this.client.usable) {
			return this.client
		}
		if (this.client) {
			try {
				await this.client.logout()
			} catch {
				// Ignore logout error during reconnect cleanup
			}
			this.client.close()
			this.client = null
		}
		const client = new ImapFlow(this.clientOptions())
		client.on('error', (err) => {
			console.error(`IMAP client error for account ${this.accountId}:`, err)
			if (this.client === client) {
				this.client.close()
				this.client = null
			}
		})
		client.on('close', () => {
			if (this.client === client) {
				this.client = null
			}
		})
		await client.connect()
		this.client = client
		return client
	}
}
