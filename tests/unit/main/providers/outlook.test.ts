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
		const requestMock = {
			select: selectMock,
			orderby: orderbyMock,
			top: topMock,
			skip: skipMock,
			search: searchMock,
			filter: filterMock,
			get: getMock,
		}
		selectMock.mockReturnValue(requestMock)
		orderbyMock.mockReturnValue(requestMock)
		topMock.mockReturnValue(requestMock)
		skipMock.mockReturnValue(requestMock)
		searchMock.mockReturnValue(requestMock)
		filterMock.mockReturnValue(requestMock)
		apiFactory.api.mockReturnValue(requestMock)
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

	it('uses Graph filter and skip for received-after polling', async () => {
		getMock.mockResolvedValue({ value: [] })

		const { OutlookProvider } = await import('../../../../src/main/providers/outlook')
		const provider = new OutlookProvider('account-1', 'token')
		await provider.listMessages({
			receivedAfter: '2026-05-23T01:00:00.000Z',
			pageToken: '20',
			maxResults: 5,
		})

		expect(filterMock).toHaveBeenCalledWith('receivedDateTime ge 2026-05-23T01:00:00.000Z')
		expect(skipMock).toHaveBeenCalledWith(20)
		expect(searchMock).not.toHaveBeenCalled()
	})

	it('does not combine Graph search with skip', async () => {
		getMock.mockResolvedValue({ value: [] })

		const { OutlookProvider } = await import('../../../../src/main/providers/outlook')
		const provider = new OutlookProvider('account-1', 'token')
		await provider.listMessages({
			searchText: 'security code',
			pageToken: '20',
			maxResults: 5,
		})

		expect(searchMock).toHaveBeenCalledWith('"security code"')
		expect(skipMock).not.toHaveBeenCalled()
		expect(filterMock).not.toHaveBeenCalled()
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
