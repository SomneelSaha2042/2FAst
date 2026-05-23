import type { CSSProperties, ReactElement } from 'react'
import type { StoredOtp } from '../../shared/ipc-api'

interface OtpCardProps {
	readonly otp: StoredOtp
	readonly onCopy: (id: string) => void
}

const cardStyle: CSSProperties = {
	background: '#ffffff',
	border: '1px solid #cbd5e1',
	borderRadius: 12,
	padding: 14,
	cursor: 'pointer',
}

const codeStyle: CSSProperties = {
	fontFamily: 'Consolas, "Courier New", monospace',
	fontSize: 30,
	fontWeight: 700,
	letterSpacing: 2,
	margin: 0,
}

/**
 * Renders a single OTP summary card.
 * @param props OTP card properties.
 * @returns OTP card element.
 */
export default function OtpCard(props: OtpCardProps): ReactElement {
	return (
		<article style={cardStyle} onClick={() => props.onCopy(props.otp.id)}>
			<p style={codeStyle}>{props.otp.code}</p>
			<p style={{ margin: '8px 0 0', color: '#1e293b' }}>{props.otp.source.sender}</p>
			<p style={{ margin: '4px 0 0', color: '#475569' }}>{props.otp.source.subject.slice(0, 90)}</p>
			<p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 12 }}>
				{new Date(props.otp.detectedAt).toLocaleTimeString()}
			</p>
			<button type="button" style={{ marginTop: 10 }} onClick={() => props.onCopy(props.otp.id)}>
				Copy
			</button>
		</article>
	)
}
