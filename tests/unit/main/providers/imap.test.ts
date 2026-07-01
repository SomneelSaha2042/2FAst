import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'

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
	download: vi.fn(),
	on: vi.fn(),
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
		download = imapMocks.download
		on = imapMocks.on
		get usable() {
			return true
		}
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
		imapMocks.download.mockResolvedValue({ content: Readable.from([]) })
	})

	it('validates a connection and always logs out', async () => {
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		await new ImapProvider('account-1', 'imap', credentials).validateConnection()
		expect(imapMocks.connect).toHaveBeenCalledOnce()
		expect(imapMocks.list).toHaveBeenCalledOnce()
		expect(imapMocks.logout).toHaveBeenCalledOnce()
	})

	it('lists newest messages with opaque ids, search filters, and persistent connection', async () => {
		imapMocks.search.mockResolvedValue([4, 8, 6])
		imapMocks.fetchAll.mockResolvedValue([
			{ uid: 6, seq: 1, flags: new Set(['\\Seen']), envelope: { subject: 'Code 6', from: [{ address: 'sender@example.com' }], date: new Date('2026-06-09T01:00:00Z') } },
			{ uid: 8, seq: 2, flags: new Set(), envelope: { subject: 'Code 8', from: [{ address: 'sender@example.com' }], date: new Date('2026-06-09T02:00:00Z') } },
		])
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		const provider = new ImapProvider('account-1', 'yahoo', credentials)
		const result = await provider.listMessages({
			maxResults: 2,
			receivedAfter: '2026-06-09T00:00:00Z',
			searchText: 'verification',
		})
		expect(result.messages.map((message) => message.subject)).toEqual(['Code 8', 'Code 6'])
		expect(result.messages[0].id).not.toContain('INBOX')
		expect(result.nextPageToken).toBe('2')
		expect(imapMocks.search).toHaveBeenCalledWith(expect.objectContaining({ text: 'verification' }), { uid: true })
		expect(imapMocks.release).toHaveBeenCalledOnce()
		
		// Logout should not be called automatically (persistent connection)
		expect(imapMocks.logout).not.toHaveBeenCalled()
		
		// Dispose should close connection
		await provider.dispose()
		expect(imapMocks.logout).toHaveBeenCalledOnce()
	})

	it('parses structured body content and fetches only text parts without returning attachment bytes', async () => {
		const bodyStructure = {
			type: 'multipart',
			subtype: 'mixed',
			childNodes: [
				{
					part: '1',
					type: 'text',
					subtype: 'plain',
					encoding: 'quoted-printable',
				},
				{
					part: '2',
					type: 'text',
					subtype: 'plain',
					parameters: { name: 'note.txt' },
					disposition: 'attachment',
					dispositionParameters: { filename: 'note.txt' },
				}
			]
		}
		
		const encodedId = Buffer.from(JSON.stringify({ mailbox: 'INBOX', uid: 8 })).toString('base64url')
		imapMocks.fetchOne.mockResolvedValue({
			uid: 8,
			seq: 1,
			flags: new Set(),
			envelope: { subject: 'Verification code', from: [{ address: 'sender@example.com' }] },
			bodyStructure,
		})
		
		imapMocks.download.mockImplementation((uid, part) => {
			if (part === '1') {
				return Promise.resolve({ content: Readable.from(['Your code is =31=32=33=34=35=36']) }) // quoted-printable '123456'
			}
			if (part === '2') {
				return Promise.resolve({ content: Readable.from(['attachment body']) })
			}
			return Promise.resolve({ content: Readable.from([]) })
		})

		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		const provider = new ImapProvider('account-1', 'imap', credentials)
		const message = await provider.getMessage(encodedId)
		
		expect(message.bodyText).toContain('123456')
		expect(message.attachments[0]).toMatchObject({ filename: 'note.txt', mimeType: 'text/plain' })
		expect(message.attachments[0]).not.toHaveProperty('content')
		
		// Clean up
		await provider.dispose()
	})

	it('releases locks after operation failures and closes on dispose socket errors', async () => {
		imapMocks.search.mockRejectedValue(new Error('server failed'))
		imapMocks.logout.mockRejectedValue(new Error('socket gone'))
		
		const { ImapProvider } = await import('../../../../src/main/providers/imap')
		const provider = new ImapProvider('account-1', 'imap', credentials)
		
		await expect(provider.listMessages()).rejects.toThrow('server failed')
		expect(imapMocks.release).toHaveBeenCalledOnce()
		expect(imapMocks.close).not.toHaveBeenCalled()
		
		// Dispose should fail logout and fall back to close
		await provider.dispose()
		expect(imapMocks.logout).toHaveBeenCalledOnce()
		expect(imapMocks.close).toHaveBeenCalledOnce()
	})
})
