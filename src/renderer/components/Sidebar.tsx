import type { ReactElement } from 'react'
import type { Account, Label, MailFolder } from '../../shared/models'

interface SidebarProps {
	readonly account: Account | null
	readonly labels: readonly Label[]
	readonly folders: readonly MailFolder[]
	readonly activeFilterId?: string
	readonly onSelectFilter: (filterId?: string) => void
}

const Sidebar = ({
	account,
	labels,
	folders,
	activeFilterId,
	onSelectFilter,
}: SidebarProps): ReactElement => {
	const isGmail = account?.provider === 'gmail'
	const items = isGmail
		? labels.map((label) => ({
				id: label.id,
				name: label.name,
				count: label.unreadCount ?? label.messageCount,
			}))
		: folders.map((folder) => ({
				id: folder.id,
				name: folder.displayName,
				count: folder.unreadItemCount ?? folder.totalItemCount,
			}))

	return (
		<aside className="h-full border-r border-slate-200 bg-slate-50 p-4">
			<div className="mb-4">
				<p className="text-xs uppercase tracking-wide text-slate-500">Account</p>
				<p className="text-sm font-semibold text-slate-900">
					{account?.displayName ?? 'No account connected'}
				</p>
				<p className="text-xs text-slate-600">{account?.email ?? '-'}</p>
			</div>
			<button
				type="button"
				className={`mb-2 w-full rounded-md px-3 py-2 text-left text-sm ${
					!activeFilterId ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
				}`}
				onClick={() => onSelectFilter(undefined)}
			>
				All Mail
			</button>
			<div className="space-y-1">
				{items.map((item) => (
					<button
						key={item.id}
						type="button"
						className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
							activeFilterId === item.id
								? 'bg-slate-900 text-white'
								: 'text-slate-700 hover:bg-slate-200'
						}`}
						onClick={() => onSelectFilter(item.id)}
					>
						<span className="truncate">{item.name}</span>
						<span className="text-xs">{item.count ?? ''}</span>
					</button>
				))}
			</div>
		</aside>
	)
}

export default Sidebar
