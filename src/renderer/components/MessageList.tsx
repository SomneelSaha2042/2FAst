import type { ReactElement } from 'react'
import type { Message } from '../../shared/models'

interface MessageListProps {
	readonly messages: readonly Message[]
	readonly selectedMessageId?: string
	readonly isLoading: boolean
	readonly hasMore: boolean
	readonly onSelectMessage: (messageId: string) => void
	readonly onLoadMore: () => void
}

const formatDate = (value: string): string => {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString()
}

const MessageList = ({
	messages,
	selectedMessageId,
	isLoading,
	hasMore,
	onSelectMessage,
	onLoadMore,
}: MessageListProps): ReactElement => {
	return (
		<section className="h-full overflow-y-auto border-r border-slate-200 bg-white">
			<div className="sticky top-0 border-b border-slate-200 bg-white px-4 py-3">
				<h2 className="text-sm font-semibold text-slate-900">Messages</h2>
			</div>
			<div className="divide-y divide-slate-200">
				{messages.map((message) => (
					<button
						key={message.id}
						type="button"
						className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${
							selectedMessageId === message.id ? 'bg-slate-100' : ''
						}`}
						onClick={() => onSelectMessage(message.id)}
					>
						<div className="flex items-center justify-between gap-2">
							<p className={`truncate text-sm ${message.isRead ? 'font-medium' : 'font-bold'}`}>
								{message.subject || '(No subject)'}
							</p>
							<p className="shrink-0 text-xs text-slate-500">{formatDate(message.date)}</p>
						</div>
						<p className="truncate text-xs text-slate-600">{message.from.email}</p>
						<p className="truncate text-xs text-slate-500">{message.snippet}</p>
					</button>
				))}
				{messages.length === 0 && !isLoading ? (
					<p className="px-4 py-8 text-center text-sm text-slate-500">No messages found.</p>
				) : null}
			</div>
			<div className="border-t border-slate-200 p-3">
				<button
					type="button"
					className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
					onClick={onLoadMore}
					disabled={!hasMore || isLoading}
				>
					{isLoading ? 'Loading...' : hasMore ? 'Load more' : 'No more messages'}
				</button>
			</div>
		</section>
	)
}

export default MessageList
