import { useMemo, useState, type ReactElement } from 'react'
import type { PollStatus, StoredOtp } from '../../shared/ipc-api'
import type { Account } from '../../shared/models'
import OtpCard from './OtpCard'
import PollStatusBar from './PollStatus'

interface OtpFeedProps {
	readonly accounts: readonly Account[]
	readonly otps: readonly StoredOtp[]
	readonly statusByAccountId: Readonly<Record<string, PollStatus>>
	readonly onCopy: (id: string) => void
	readonly onPollAccount: (accountId: string) => void
	readonly onClear: () => void
}

/**
 * Renders compact OTP-centric feed with history.
 * @param props Feed state and actions.
 * @returns OTP feed UI.
 */
export default function OtpFeed(props: OtpFeedProps): ReactElement {
	const [showHistory, setShowHistory] = useState<boolean>(true)

	const visibleOtps = useMemo(
		() => props.otps.filter((otp) => !otp.expired),
		[props.otps]
	)

	return (
		<section style={{ display: 'grid', gap: 12 }}>
			<PollStatusBar
				accounts={props.accounts}
				statusByAccountId={props.statusByAccountId}
				onPollAccount={props.onPollAccount}
			/>
			<div style={{ display: 'flex', gap: 8 }}>
				<button type="button" onClick={props.onClear}>Clear History</button>
			</div>
			{visibleOtps.length === 0 ? (
				<div style={{ padding: 24, border: '1px dashed #94a3b8', borderRadius: 12 }}>
					<p style={{ margin: 0, fontSize: 18 }}>Waiting for OTPs...</p>
				</div>
			) : (
				<>
					<OtpCard otp={visibleOtps[0]} onCopy={props.onCopy} />
					<button type="button" onClick={() => setShowHistory((value) => !value)}>
						{showHistory ? 'Hide History' : 'Show History'}
					</button>
					{showHistory ? (
						<div style={{ display: 'grid', gap: 8 }}>
							{visibleOtps.slice(1).map((otp) => (
								<OtpCard key={otp.id} otp={otp} onCopy={props.onCopy} />
							))}
						</div>
					) : null}
				</>
			)}
		</section>
	)
}
