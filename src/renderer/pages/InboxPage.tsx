import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Account, Label, MailFolder, Message } from '../../shared/models'
import MessageList from '../components/MessageList'
import MessageView from '../components/MessageView'
import Sidebar from '../components/Sidebar'

interface InboxPageProps {
	readonly activeAccountId: string
	readonly onBackToHub: () => void
	readonly onResetGoogleCredentials: () => Promise<void>
}

const InboxPage = ({
	activeAccountId,
	onBackToHub,
	onResetGoogleCredentials,
}: InboxPageProps): ReactElement => {
	const [accounts, setAccounts] = useState<readonly Account[]>([])
	const [labels, setLabels] = useState<readonly Label[]>([])
	const [folders, setFolders] = useState<readonly MailFolder[]>([])
	const [activeFilterId, setActiveFilterId] = useState<string>()
	const [messages, setMessages] = useState<readonly Message[]>([])
	const [selectedMessageId, setSelectedMessageId] = useState<string>()
	const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
	const [nextPageToken, setNextPageToken] = useState<string>()
	const [isLoadingList, setIsLoadingList] = useState<boolean>(false)
	const [isLoadingMessage, setIsLoadingMessage] = useState<boolean>(false)
	const [error, setError] = useState<string>()
	const [listError, setListError] = useState<string>()
	const [messageError, setMessageError] = useState<string>()
	const [lastSyncAt, setLastSyncAt] = useState<string>()

	const activeAccount = useMemo(
		() => accounts.find((account) => account.id === activeAccountId) ?? null,
		[accounts, activeAccountId]
	)

	useEffect(() => {
		const loadAccounts = async (): Promise<void> => {
			const result = await window.api['accounts:list']()
			if (!result.success || !result.data) {
				setError(result.error ?? 'Failed to load accounts')
				return
			}
			setAccounts(result.data)
		}
		void loadAccounts()
	}, [activeAccountId])

	useEffect(() => {
		if (!activeAccountId) {
			return
		}
		const loadFilters = async (): Promise<void> => {
			if (activeAccount?.provider === 'gmail') {
				const result = await window.api['mail:listLabels'](activeAccountId)
				if (!result.success || !result.data) {
					setError(result.error ?? 'Failed to load labels')
					return
				}
				setLabels(result.data)
				setFolders([])
				return
			}
			const result = await window.api['mail:listFolders'](activeAccountId)
			if (!result.success || !result.data) {
				setError(result.error ?? 'Failed to load folders')
				return
			}
			setLabels([])
			setFolders(result.data)
		}
		void loadFilters()
	}, [activeAccountId, activeAccount?.provider])

	const loadMessages = async (append: boolean): Promise<void> => {
		if (!activeAccountId) {
			return
		}
		setIsLoadingList(true)
		setListError(undefined)
		const result = await window.api['mail:listMessages'](activeAccountId, {
			labelId: activeAccount?.provider === 'gmail' ? activeFilterId : undefined,
			folderId: activeAccount?.provider === 'outlook' ? activeFilterId : undefined,
			maxResults: 20,
			pageToken: append ? nextPageToken : undefined,
		})
		setIsLoadingList(false)
		if (!result.success || !result.data) {
			const loadError = result.error ?? 'Failed to load messages'
			setListError(loadError)
			setError(loadError)
			return
		}
		const data = result.data
		setNextPageToken(data.nextPageToken)
		setMessages((existing) => (append ? [...existing, ...data.messages] : data.messages))
		setLastSyncAt(new Date().toISOString())
		if (!append && data.messages.length > 0) {
			setSelectedMessageId(data.messages[0].id)
		}
	}

	useEffect(() => {
		setMessages([])
		setSelectedMessage(null)
		setNextPageToken(undefined)
		void loadMessages(false)
	}, [activeAccountId, activeFilterId])

	useEffect(() => {
		if (!activeAccountId || !selectedMessageId) {
			return
		}
		const loadMessage = async (): Promise<void> => {
			setIsLoadingMessage(true)
			setMessageError(undefined)
			const result = await window.api['mail:getMessage'](activeAccountId, selectedMessageId)
			setIsLoadingMessage(false)
			if (!result.success || !result.data) {
				const loadError = result.error ?? 'Failed to load message'
				setMessageError(loadError)
				setError(loadError)
				return
			}
			setSelectedMessage(result.data)
		}
		void loadMessage()
	}, [activeAccountId, selectedMessageId])

	const refreshSelectedMessage = async (): Promise<void> => {
		if (!activeAccountId || !selectedMessageId) {
			return
		}
		setIsLoadingMessage(true)
		setMessageError(undefined)
		const result = await window.api['mail:getMessage'](activeAccountId, selectedMessageId)
		setIsLoadingMessage(false)
		if (!result.success || !result.data) {
			const loadError = result.error ?? 'Failed to refresh message'
			setMessageError(loadError)
			setError(loadError)
			return
		}
		setSelectedMessage(result.data)
		setLastSyncAt(new Date().toISOString())
	}

	return (
		<main className="h-screen bg-slate-100 p-4 text-slate-900">
			<div className="mb-3 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
						onClick={() => void loadMessages(false)}
					>
						Refresh Inbox
					</button>
					<p className="text-xs text-slate-600">
						{lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}` : 'Last sync: not yet'}
					</p>
				</div>
				<button
					type="button"
					className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
					onClick={() => void onResetGoogleCredentials()}
				>
					Reset Credentials
				</button>
				<button
					type="button"
					className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
					onClick={onBackToHub}
				>
					Back to Accounts Hub
				</button>
			</div>
			<div className="grid h-full grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[260px_360px_1fr]">
				<Sidebar
					account={activeAccount}
					labels={labels}
					folders={folders}
					activeFilterId={activeFilterId}
					onSelectFilter={(filterId) => setActiveFilterId(filterId)}
				/>
				<MessageList
					messages={messages}
					selectedMessageId={selectedMessageId}
					isLoading={isLoadingList}
					hasMore={Boolean(nextPageToken)}
					onSelectMessage={setSelectedMessageId}
					onLoadMore={() => void loadMessages(true)}
				/>
				<MessageView
					message={selectedMessage}
					isLoading={isLoadingMessage}
					onRefresh={() => void refreshSelectedMessage()}
				/>
			</div>
			{listError ? <p className="mt-2 text-sm text-amber-700">Inbox: {listError}</p> : null}
			{messageError ? <p className="mt-1 text-sm text-amber-700">Message: {messageError}</p> : null}
			{error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
		</main>
	)
}

export default InboxPage
