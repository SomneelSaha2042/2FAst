import React, { ReactElement, useEffect, useState } from 'react'
import type { Message } from '../shared/models'
import { getApi, WindowChrome } from './shared'

export default function RecentEmailsView(): ReactElement {
	const [recentMessages, setRecentMessages] = useState<Message[]>([])
	const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const loadRecent = async () => {
			const api = getApi()
			if (api) {
				try {
					const res = await api['otp:getRecentParsedMessages']()
					if (res.success && res.data) {
						setRecentMessages(res.data)
					} else {
						setError(res.error ?? 'Failed to load recent messages')
					}
				} catch (e) {
					setError(e instanceof Error ? e.message : 'Unknown error')
				}
			}
		}
		void loadRecent()
	}, [])

	return (
		<WindowChrome title="Recent Emails" view="recent-emails">
			<div className="w-full h-full bg-background flex flex-col font-sans select-none text-on-surface">
				<header className="h-10 shrink-0 flex items-center px-4 bg-surface-container draggable border-b border-outline-variant/30 relative">
					<h1 className="font-body-sm font-semibold tracking-wide">Recent Emails</h1>
					
					{/* Close Button */}
					<div className="absolute right-0 top-0 h-full flex items-center non-draggable">
						<button
							type="button"
							className="h-full px-4 hover:bg-error hover:text-on-error transition-colors flex items-center justify-center cursor-pointer text-on-surface"
							onClick={() => {
								const api = getApi()
								if (api) void api['window:hide']()
							}}
							aria-label="Close"
						>
							<span className="material-symbols-outlined text-[16px]">close</span>
						</button>
					</div>
				</header>

				<main className="flex-1 flex flex-col p-6 overflow-y-auto bg-background text-left gap-4">
					<div className="flex flex-col gap-1 border-b border-surface-container-highest pb-4">
						<h2 className="font-title-md text-primary">Last 5 Parsed Emails</h2>
						<p className="font-body-sm text-outline text-[12px]">These are the emails that were fetched during the last scan. Click on an email to expand its contents.</p>
					</div>

					{error && (
						<div className="terminal-block p-4 rounded border-l-2 border-l-error text-left">
							<p className="font-body-md font-semibold text-error">Failed to retrieve emails</p>
							<p className="font-body-sm text-red-300 mt-1">{error}</p>
						</div>
					)}

					<div className="space-y-3">
						{recentMessages.length === 0 && !error ? (
							<div className="p-8 text-center bg-surface-container/30 rounded border border-outline-variant/10">
								<p className="font-body-md text-outline">No emails parsed recently.</p>
								<p className="font-body-sm text-outline/70 mt-2">Run a manual scan from the app to populate this list.</p>
							</div>
						) : (
							recentMessages.map((msg) => (
								<div key={msg.id} className="warp-block rounded p-4 flex flex-col gap-2 transition-all">
									<div 
										className="flex flex-col gap-1 cursor-pointer group"
										onClick={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
									>
										<div className="flex justify-between items-start gap-4">
											<div className="flex flex-col flex-1 min-w-0">
												<span className="font-body-md font-medium text-primary truncate group-hover:underline">
													{msg.from.name || msg.from.email}
												</span>
												<span className="font-body-sm text-on-surface-variant text-[13px] break-words line-clamp-2">
													{msg.subject || '(No Subject)'}
												</span>
											</div>
											<div className="flex flex-col items-end shrink-0 gap-1">
												<span className="font-body-sm text-outline text-[11px]">
													{msg.date ? new Date(msg.date).toLocaleString() : ''}
												</span>
												{msg.labelIds && msg.labelIds.length > 0 && (
													<div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
														{msg.labelIds.filter(l => !['UNREAD', 'STARRED'].includes(l)).slice(0, 2).map((label, i) => (
															<span key={i} className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded truncate max-w-full">
																{label.replace('CATEGORY_', '')}
															</span>
														))}
													</div>
												)}
											</div>
										</div>
									</div>
									
									{expandedMsgId === msg.id && (
										<div className="mt-3 pt-3 border-t border-surface-container-highest">
											<div className="font-body-sm text-outline text-[12px] whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto custom-scrollbar p-2 bg-surface-container-low rounded">
												{msg.bodyText || msg.snippet || 'No text content available.'}
											</div>
										</div>
									)}
								</div>
							))
						)}
					</div>
				</main>
			</div>
		</WindowChrome>
	)
}
