import { beforeEach, describe, expect, it, vi } from 'vitest'

const imapMocks = vi.hoisted(() => ({
	connect: vi.fn(),
	logout: vi.fn(),
	close: vi.fn(),
	list: vi.fn(),
	getMailboxLock: vi.fn(),
	release: vi.fn(),
	search: vi.fn(),
	fetchAll: vi.fn(),
	fetchOne: vi.fn(),
	options: [] as unknown[],
}))

vi.mock('imapflow', () => ({
	ImapFlow: class {
		constructor(options: unknown) {
			imapMocks.options.push(options)
		}
		connect = imapMocks.connect
		logout = imapMocks.logout
		close = imapMocks.close
		list = imapMocks.list
		getMailboxLock = imapMocks.getMailboxLock
		search = imapMocks.search
		fetchAll = imapMocks.fetchAll
		fetchOne = imapMocks.fetchOne
	},
}))

const credentials = {
	host: 'imap.example.com',
	port: 993,
	security: 'tls' as const,
	username: 'user@example.com',
	password: 'app-password',
	allowSelfSigned: false,
}

describe('IMAP provider', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		imapMocks.options.length = 0
		imapMocks.getMailboxLock.mockResolvedValue({ release: imapMocks.release })
		imapMocks.list.mockResolvedValue([])
		imapMocks.search.mockResolvedValue([])
	})

	it('validates a connection and always logs out', async () => {
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		await new ImapProvider('account-1', 'imap', credentials).validateConnection()
		expect(imapMocks.connect).toHaveBeenCalledOnce()
		expect(imapMocks.list).toHaveBeenCalledOnce()
		expect(imapMocks.logout).toHaveBeenCalledOnce()
	})

	it('lists newest messages with opaque ids, search filters, and pagination', async () => {
		imapMocks.search.mockResolvedValue([4, 8, 6])
		imapMocks.fetchAll.mockResolvedValue([
			{ uid: 6, seq: 1, flags: new Set(['\\Seen']), envelope: { subject: 'Code 6', from: [{ address: 'sender@example.com' }], date: new Date('2026-06-09T01:00:00Z') } },
			{ uid: 8, seq: 2, flags: new Set(), envelope: { subject: 'Code 8', from: [{ address: 'sender@example.com' }], date: new Date('2026-06-09T02:00:00Z') } },
		])
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		const result = await new ImapProvider('account-1', 'yahoo', credentials).listMessages({
			maxResults: 2,
			receivedAfter: '2026-06-09T00:00:00Z',
			searchText: 'verification',
		})
		expect(result.messages.map((message) => message.subject)).toEqual(['Code 8', 'Code 6'])
		expect(result.messages[0].id).not.toContain('INBOX')
		expect(result.nextPageToken).toBe('2')
		expect(imapMocks.search).toHaveBeenCalledWith(expect.objectContaining({ text: 'verification' }), { uid: true })
		expect(imapMocks.release).toHaveBeenCalledOnce()
		expect(imapMocks.logout).toHaveBeenCalledOnce()
	})

	it('parses full MIME content without returning attachment bytes', async () => {
		const raw = Buffer.from([
			'From: Sender <sender@example.com>',
			'To: user@example.com',
			'Subject: Verification code',
			'Date: Tue, 09 Jun 2026 02:00:00 +0000',
			'MIME-Version: 1.0',
			'Content-Type: multipart/mixed; boundary="test"',
			'',
			'--test',
			'Content-Type: text/plain; charset=utf-8',
			'',
			'Your code is 123456',
			'--test',
			'Content-Type: text/plain; name="note.txt"',
			'Content-Disposition: attachment; filename="note.txt"',
			'',
			'attachment body',
			'--test--',
		].join('\r\n'))
		const encodedId = Buffer.from(JSON.stringify({ mailbox: 'INBOX', uid: 8 })).toString('base64url')
		imapMocks.fetchOne.mockResolvedValue({ uid: 8, seq: 1, source: raw, flags: new Set(), envelope: { subject: 'Verification code', from: [{ address: 'sender@example.com' }] } })
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		const message = await new ImapProvider('account-1', 'imap', credentials).getMessage(encodedId)
		expect(message.bodyText).toContain('123456')
		expect(message.attachments[0]).toMatchObject({ filename: 'note.txt', mimeType: 'text/plain' })
		expect(message.attachments[0]).not.toHaveProperty('content')
	})

	it('releases locks and closes after operation failures', async () => {
		imapMocks.search.mockRejectedValue(new Error('server failed'))
		imapMocks.logout.mockRejectedValue(new Error('socket gone'))
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		await expect(new ImapProvider('account-1', 'imap', credentials).listMessages()).rejects.toThrow('server failed')
		expect(imapMocks.release).toHaveBeenCalledOnce()
		expect(imapMocks.close).toHaveBeenCalledOnce()
	})
})
