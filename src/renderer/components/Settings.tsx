import type { CSSProperties, ReactElement } from 'react'
import type { Account } from '../../shared/models'
import type { OtpSettings } from '../../shared/ipc-api'

interface SettingsProps {
	readonly settings: OtpSettings
	readonly accounts: readonly Account[]
	readonly onUpdate: (partial: Partial<OtpSettings>) => Promise<void>
	readonly onRemoveAccount: (account: Account) => Promise<void>
	readonly cardStyle: CSSProperties
	readonly buttonStyle: CSSProperties
	readonly primaryButtonStyle: CSSProperties
}

const intervals = [5000, 10000, 15000, 30000, 60000]
const ttlValues = [5, 10, 15, 30]

/**
 * Renders app settings panel.
 * @param props Settings model and handlers.
 * @returns Settings section.
 */
export default function Settings(props: SettingsProps): ReactElement {
	return (
		<section style={{ display: 'grid', gap: 10 }}>
			<div style={props.cardStyle}>
				<h3 style={{ marginTop: 0 }}>Settings</h3>
				<div style={{ display: 'grid', gap: 8 }}>
					<label>
						Polling interval
						<select value={props.settings.pollIntervalMs} onChange={(event) => void props.onUpdate({ pollIntervalMs: Number(event.target.value) })} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}>
							{intervals.map((value) => <option key={value} value={value}>{value / 1000}s</option>)}
						</select>
					</label>
					<label>
						OTP expiry
						<select value={props.settings.otpTtlMinutes} onChange={(event) => void props.onUpdate({ otpTtlMinutes: Number(event.target.value) })} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}>
							{ttlValues.map((value) => <option key={value} value={value}>{value} min</option>)}
						</select>
					</label>
					<label><input type="checkbox" checked={props.settings.autoCopyToClipboard} onChange={(event) => void props.onUpdate({ autoCopyToClipboard: event.target.checked })} /> Auto-copy to clipboard</label>
					<label><input type="checkbox" checked={props.settings.showNotifications} onChange={(event) => void props.onUpdate({ showNotifications: event.target.checked })} /> Notifications</label>
					<label><input type="checkbox" checked={props.settings.soundEnabled} onChange={(event) => void props.onUpdate({ soundEnabled: event.target.checked })} /> Sound on detection</label>
					<label><input type="checkbox" checked={props.settings.launchOnStartup} onChange={(event) => void props.onUpdate({ launchOnStartup: event.target.checked })} /> Launch on startup</label>
					<label>
						Sender allowlist (comma-separated domains)
						<input value={(props.settings.filterSenders ?? []).join(', ')} onChange={(event) => {
							const domains = event.target.value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
							void props.onUpdate({ filterSenders: domains })
						}} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }} />
					</label>
				</div>
			</div>
			<div style={props.cardStyle}>
				<h3 style={{ marginTop: 0 }}>Accounts</h3>
				{props.accounts.length === 0 ? <p style={{ margin: 0, color: '#64748b' }}>No accounts connected.</p> : (
					<div style={{ display: 'grid', gap: 8 }}>
						{props.accounts.map((account) => (
							<div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
								<div><strong>{account.displayName}</strong><div style={{ fontSize: 12, color: '#64748b' }}>{account.email}</div></div>
								<button type="button" style={props.buttonStyle} onClick={() => void props.onRemoveAccount(account)}>Remove</button>
							</div>
						))}
					</div>
				)}
			</div>
		</section>
	)
}
