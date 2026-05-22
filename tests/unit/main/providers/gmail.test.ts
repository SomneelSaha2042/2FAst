import { beforeEach, describe, expect, it, vi } from 'vitest'

const messagesListMock = vi.fn()
const messagesGetMock = vi.fn()
const labelsListMock = vi.fn()
const labelsGetMock = vi.fn()
const threadsGetMock = vi.fn()
const messagesModifyMock = vi.fn()
const messagesTrashMock = vi.fn()
const ensureValidAccessTokenMock = vi.fn()
const loadTokensMock = vi.fn()
const loadGoogleOAuthConfigMock = vi.fn()

vi.mock('../../../../src/main/oauth/token-refresh', () => ({
	ensureValidAccessToken: ensureValidAccessTokenMock,
}))

vi.mock('../../../../src/main/accounts/token-store', () => ({
	loadTokens: loadTokensMock,
}))

vi.mock('../../../../src/main/oauth/google-config', () => ({
	loadGoogleOAuthConfig: loadGoogleOAuthConfigMock,
}))

vi.mock('googleapis', () => ({
	google: {
		auth: {
			OAuth2: class {
				setCredentials(): void {}
			},
		},
		gmail: () => ({
			users: {
				messages: {
					list: messagesListMock,
					get: messagesGetMock,
					modify: messagesModifyMock,
					trash: messagesTrashMock,
				},
				labels: {
					list: labelsListMock,
					get: labelsGetMock,
				},
				threads: {
					get: threadsGetMock,
				},
			},
		}),
	},
}))

describe('gmail provider', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		loadGoogleOAuthConfigMock.mockResolvedValue({
			client_id: 'client-id',
			client_secret: 'client-secret',
		})
		loadTokensMock.mockResolvedValue({
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: 9999999999,
			scope: 'scope',
		})
		ensureValidAccessTokenMock.mockResolvedValue({
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: 9999999999,
			scope: 'scope',
		})
	})

	it('maps listMessages payload into message shape', async () => {
		messagesListMock.mockResolvedValue({
			data: {
				messages: [{ id: 'm1' }],
				nextPageToken: 'next-token',
			},
		})
		messagesGetMock.mockResolvedValue({
			data: {
				id: 'm1',
				threadId: 't1',
				snippet: 'snippet',
				labelIds: ['INBOX', 'UNREAD'],
				internalDate: '1700000000000',
				payload: {
					headers: [
						{ name: 'Subject', value: 'Subject' },
						{ name: 'From', value: 'Alice <alice@example.com>' },
						{ name: 'To', value: 'Bob <bob@example.com>' },
						{ name: 'Date', value: 'Mon, 01 Jan 2024 10:00:00 +0000' },
					],
				},
			},
		})

		const { GmailProvider } = await import('../../../../src/main/providers/gmail')
		const provider = new GmailProvider('account-1', 'client-id', 'client-secret')
		const result = await provider.listMessages()

		expect(result.nextPageToken).toBe('next-token')
		expect(result.messages).toHaveLength(1)
		expect(result.messages[0]).toMatchObject({
			id: 'm1',
			accountId: 'account-1',
			subject: 'Subject',
			snippet: 'snippet',
			isRead: false,
			from: { email: 'alice@example.com' },
		})
	})

	it('extracts html body from multipart message', async () => {
		messagesGetMock.mockResolvedValue({
			data: {
				id: 'm2',
				threadId: 't2',
				snippet: 'snippet',
				labelIds: ['INBOX'],
				payload: {
					headers: [
						{ name: 'Subject', value: 'Hello' },
						{ name: 'From', value: 'alice@example.com' },
					],
					parts: [
						{
							mimeType: 'multipart/alternative',
							parts: [
								{
									mimeType: 'text/plain',
									body: { data: 'SGVsbG8gdGV4dA' },
								},
								{
									mimeType: 'text/html',
									body: { data: 'PHA-SGVsbG88L3A-' },
								},
							],
						},
					],
				},
			},
		})

		const { GmailProvider } = await import('../../../../src/main/providers/gmail')
		const provider = new GmailProvider('account-1', 'client-id', 'client-secret')
		const message = await provider.getMessage('m2')

		expect(message.bodyText).toBe('Hello text')
		expect(message.bodyHtml).toBe('<p>Hello</p>')
	})

	it('maps labels with counts and type', async () => {
		labelsListMock.mockResolvedValue({
			data: {
				labels: [
					{ id: 'INBOX', name: 'INBOX', type: 'system' },
					{ id: 'Label_1', name: 'Receipts', type: 'user' },
				],
			},
		})
		labelsGetMock.mockResolvedValue({
			data: {
				id: 'INBOX',
				name: 'INBOX',
				type: 'system',
				messagesTotal: 10,
				messagesUnread: 3,
			},
		})

		const { GmailProvider } = await import('../../../../src/main/providers/gmail')
		const provider = new GmailProvider('account-1', 'client-id', 'client-secret')
		const labels = await provider.listLabels()

		expect(labels).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'INBOX',
					accountId: 'account-1',
					type: 'system',
					messageCount: 10,
					unreadCount: 3,
				}),
				expect.objectContaining({
					id: 'Label_1',
					name: 'Receipts',
					type: 'user',
				}),
			])
		)
	})
})
