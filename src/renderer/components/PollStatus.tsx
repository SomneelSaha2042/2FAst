import type { CSSProperties, ReactElement } from 'react'
import type { Account } from '../../shared/models'
import type { PollStatus } from '../../shared/ipc-api'

interface PollStatusProps {
	readonly accounts: readonly Account[]
	readonly statusByAccountId: Readonly<Record<string, PollStatus>>
	readonly onPollAccount: (accountId: string) => void
}

const barStyle: CSSProperties = {
	background: '#e2e8f0',
	border: '1px solid #cbd5e1',
	borderRadius: 10,
	padding: 12,
}

/**
 * Shows polling status for all connected accounts.
 * @param props Poll status display props.
 * @returns Polling status element.
 */
export default function PollStatusBar(props: PollStatusProps): ReactElement {
	return (
		<section style={barStyle}>
			<strong>Polling: On demand</strong>
			<div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
				{props.accounts.map((account) => {
					const status = props.statusByAccountId[account.id]
					return (
						<div key={account.id} style={{ fontSize: 13, color: '#334155' }}>
							{account.email} - {status?.active ? 'active' : 'idle'} - last poll:{' '}
							{status?.lastPollTime ? new Date(status.lastPollTime).toLocaleTimeString() : 'never'}
							<button
								type="button"
								style={{ marginLeft: 8 }}
								onClick={() => props.onPollAccount(account.id)}
							>
								Check OTP
							</button>
						</div>
					)
				})}
			</div>
		</section>
	)
}
