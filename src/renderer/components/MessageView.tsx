import { useMemo } from 'react'
import type { ReactElement } from 'react'
import type { Message } from '../../shared/models'

interface MessageViewProps {
	readonly message: Message | null
	readonly isLoading: boolean
	readonly onRefresh: () => void
}

const formatDate = (value: string): string => {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString()
}

const MessageView = ({ message, isLoading, onRefresh }: MessageViewProps): ReactElement => {
	const iframeSrcDoc = useMemo(() => {
		if (!message?.bodyHtml) {
			return undefined
		}
		return message.bodyHtml
	}, [message?.bodyHtml])

	return (
		<section className="h-full overflow-y-auto bg-white p-4">
			<div className="mb-3 flex justify-end">
				<button
					type="button"
					className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
					onClick={onRefresh}
				>
					Refresh Message
				</button>
			</div>
			{isLoading ? <p className="text-sm text-slate-500">Loading message...</p> : null}
			{!message && !isLoading ? <p className="text-sm text-slate-500">Select a message.</p> : null}
			{message ? (
				<div className="space-y-3">
					<h2 className="text-lg font-semibold text-slate-900">{message.subject || '(No subject)'}</h2>
					<div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
						<p><strong>From:</strong> {message.from.email}</p>
						<p><strong>To:</strong> {message.to.map((item) => item.email).join(', ')}</p>
						{message.cc?.length ? <p><strong>Cc:</strong> {message.cc.map((item) => item.email).join(', ')}</p> : null}
						<p><strong>Date:</strong> {formatDate(message.date)}</p>
					</div>
					{iframeSrcDoc ? (
						<iframe
							title="Email HTML body"
							sandbox=""
							srcDoc={iframeSrcDoc}
							className="h-[60vh] w-full rounded-md border border-slate-200"
						/>
					) : (
						<pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
							{message.bodyText ?? message.snippet}
						</pre>
					)}
				</div>
			) : null}
		</section>
	)
}

export default MessageView
