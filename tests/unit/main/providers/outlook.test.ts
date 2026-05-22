import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFactory = {
	api: vi.fn(),
}

const selectMock = vi.fn()
const orderbyMock = vi.fn()
const topMock = vi.fn()
const skipMock = vi.fn()
const searchMock = vi.fn()
const filterMock = vi.fn()
const getMock = vi.fn()

vi.mock('@microsoft/microsoft-graph-client', () => ({
	Client: {
		init: () => apiFactory,
	},
}))

describe('outlook provider', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		selectMock.mockReturnValue({ orderby: orderbyMock })
		orderbyMock.mockReturnValue({ top: topMock })
		topMock.mockReturnValue({ skip: skipMock, get: getMock })
		skipMock.mockReturnValue({ search: searchMock, get: getMock })
		searchMock.mockReturnValue({ get: getMock })
		filterMock.mockReturnValue({ orderby: orderbyMock, get: getMock })
		apiFactory.api.mockReturnValue({
			select: selectMock,
			orderby: orderbyMock,
			top: topMock,
			skip: skipMock,
			search: searchMock,
			filter: filterMock,
			get: getMock,
		})
	})

	it('maps listMessages payload into shared message shape', async () => {
		getMock.mockResolvedValue({
			value: [
				{
					id: 'm1',
					subject: 'Subject',
					from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
					toRecipients: [{ emailAddress: { address: 'bob@example.com' } }],
					receivedDateTime: '2026-01-01T00:00:00.000Z',
					bodyPreview: 'Preview',
					isRead: false,
					flag: { flagStatus: 'flagged' },
					hasAttachments: true,
					conversationId: 'c1',
				},
			],
			'@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=50',
		})

		const { OutlookProvider } = await import('../../../../src/main/providers/outlook')
		const provider = new OutlookProvider('account-1', 'token')
		const result = await provider.listMessages()

		expect(result.nextPageToken).toBe('50')
		expect(result.messages[0]).toMatchObject({
			id: 'm1',
			accountId: 'account-1',
			subject: 'Subject',
			from: { email: 'alice@example.com' },
			isRead: false,
			isStarred: true,
			threadId: 'c1',
		})
	})

	it('maps folders from Graph response', async () => {
		getMock.mockResolvedValue({
			value: [
				{
					id: 'inbox',
					displayName: 'Inbox',
					parentFolderId: 'root',
					totalItemCount: 100,
					unreadItemCount: 5,
				},
			],
		})

		const { OutlookProvider } = await import('../../../../src/main/providers/outlook')
		const provider = new OutlookProvider('account-1', 'token')
		const folders = await provider.listFolders()

		expect(folders).toEqual([
			{
				id: 'inbox',
				accountId: 'account-1',
				displayName: 'Inbox',
				parentFolderId: 'root',
				totalItemCount: 100,
				unreadItemCount: 5,
			},
		])
	})
})
