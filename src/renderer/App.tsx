import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
	CheckCircle2,
	Copy,
	ExternalLink,
	Mail,
	MonitorSmartphone,
	ShieldCheck,
	XCircle,
} from 'lucide-react'
import type { Account } from '../shared/models'
import InboxPage from './pages/InboxPage'

const BYOC_GUIDE_URL = 'https://developers.google.com/identity/protocols/oauth2/native-app'
const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/'
const GOOGLE_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials'

type Page = 'hub' | 'setupHub' | 'gmailSetup' | 'outlookSetup' | 'inbox'
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'neutral'

const panelStyle: CSSProperties = {
	background: '#ffffff',
	border: '1px solid #e2e8f0',
	borderRadius: 20,
	padding: 22,
	boxShadow: '0 20px 45px rgba(2, 6, 23, 0.08)',
}

const baseButtonStyle: CSSProperties = {
	padding: '10px 14px',
	borderRadius: 10,
	border: '1px solid transparent',
	display: 'inline-flex',
	alignItems: 'center',
	gap: 8,
	fontWeight: 600,
	cursor: 'pointer',
}

const buttonVariantStyle = (variant: ButtonVariant): CSSProperties => {
	if (variant === 'primary') return { background: '#0f172a', color: '#ffffff' }
	if (variant === 'danger') return { background: '#b91c1c', color: '#ffffff' }
	if (variant === 'secondary') return { background: '#0369a1', color: '#ffffff' }
	return { background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }
}

const disabledStyle: CSSProperties = { opacity: 0.6, cursor: 'not-allowed' }

const chipStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 8,
	padding: '6px 10px',
	borderRadius: 999,
	background: '#eef2ff',
	color: '#334155',
	fontSize: 13,
	fontWeight: 600,
}

interface AppButtonProps {
	readonly label: string
	readonly onClick: () => void
	readonly variant?: ButtonVariant
	readonly disabled?: boolean
	readonly icon?: ReactElement
}

const AppButton = ({
	label,
	onClick,
	variant = 'neutral',
	disabled = false,
	icon,
}: AppButtonProps): ReactElement => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		style={{
			...baseButtonStyle,
			...buttonVariantStyle(variant),
			...(disabled ? disabledStyle : {}),
		}}
	>
		{icon}
		{label}
	</button>
)

const App = (): ReactElement => {
	const [page, setPage] = useState<Page>('hub')
	const [configured, setConfigured] = useState<boolean>(false)
	const [isCheckingConfig, setIsCheckingConfig] = useState<boolean>(true)
	const [accounts, setAccounts] = useState<readonly Account[]>([])
	const [activeAccountId, setActiveAccountId] = useState<string>()
	const [status, setStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState<boolean>(false)
	const [clientId, setClientId] = useState<string>('')
	const [clientSecret, setClientSecret] = useState<string>('')
	const [projectId, setProjectId] = useState<string>('')
	const gmailAccounts = accounts.filter((account) => account.provider === 'gmail')
	const outlookAccounts = accounts.filter((account) => account.provider === 'outlook')

	const refreshAccounts = async (): Promise<void> => {
		const result = await window.api['accounts:list']()
		if (result.success && result.data) {
			setAccounts(result.data)
		}
	}

	const refreshConfigStatus = async (): Promise<void> => {
		setIsCheckingConfig(true)
		const result = await window.api['oauth:getGoogleConfigStatus']()
		setConfigured(Boolean(result.success && result.data?.configured))
		setIsCheckingConfig(false)
	}

	useEffect(() => {
		void refreshConfigStatus()
		void refreshAccounts()
	}, [])

	const copyText = async (value: string, successMessage: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(value)
			setStatus(successMessage)
			setError(null)
		} catch (clipboardError) {
			const message = clipboardError instanceof Error ? clipboardError.message : 'Failed to copy text'
			setError(message)
		}
	}

	const saveByocConfig = async (): Promise<void> => {
		setIsLoading(true)
		setError(null)
		setStatus(null)
		try {
			const result = await window.api['oauth:saveGoogleConfig']({
				clientId,
				clientSecret,
				projectId: projectId.trim() || undefined,
			})
			if (!result.success || !result.data) {
				throw new Error(result.error ?? 'Failed to save Google OAuth config')
			}
			await refreshConfigStatus()
			setStatus(`Saved config to ${result.data.path}`)
			setPage('hub')
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			setError(message)
		} finally {
			setIsLoading(false)
		}
	}

	const deleteByocConfig = async (): Promise<void> => {
		setIsLoading(true)
		setError(null)
		setStatus(null)
		try {
			const accountsResult = await window.api['accounts:list']()
			if (!accountsResult.success || !accountsResult.data) {
				throw new Error(accountsResult.error ?? 'Failed to list accounts before reset')
			}
			for (const account of accountsResult.data) {
				if (account.provider === 'gmail') {
					await window.api['accounts:remove'](account.id)
				}
			}

			const result = await window.api['oauth:deleteGoogleConfig']()
			if (!result.success || !result.data) {
				throw new Error(result.error ?? 'Failed to delete Google OAuth config')
			}
			setClientId('')
			setClientSecret('')
			setProjectId('')
			await refreshAccounts()
			await refreshConfigStatus()
			setStatus(
				result.data.deleted
					? 'Saved Gmail credentials deleted. Gmail accounts removed and tokens cleared.'
					: 'No Gmail credentials file found. Gmail accounts were still cleared.'
			)
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			setError(message)
		} finally {
			setIsLoading(false)
		}
	}

	const connectProvider = async (provider: 'gmail' | 'outlook'): Promise<void> => {
		setIsLoading(true)
		setError(null)
		setStatus(`Waiting for ${provider === 'gmail' ? 'Google' : 'Microsoft'} sign-in callback...`)
		try {
			const result = await window.api['accounts:add'](provider)
			if (!result.success || !result.data) {
				throw new Error(result.error ?? `Failed to connect ${provider} account`)
			}
			await refreshAccounts()
			setStatus(`Connected ${result.data.email}`)
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			setError(message)
		} finally {
			setIsLoading(false)
		}
	}

	const removeAccount = async (account: Account): Promise<void> => {
		setIsLoading(true)
		setError(null)
		setStatus(null)
		try {
			const result = await window.api['accounts:remove'](account.id)
			if (!result.success) {
				throw new Error(result.error ?? `Failed to remove ${account.provider} account`)
			}
			await refreshAccounts()
			setStatus(`Removed ${account.email}`)
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			setError(message)
		} finally {
			setIsLoading(false)
		}
	}

	const cancelConnect = async (): Promise<void> => {
		const result = await window.api['oauth:cancelFlow']()
		if (result.success) {
			setStatus(result.data?.canceled ? 'Connection flow canceled.' : 'No active connection flow.')
		}
	}

	if (page === 'inbox' && activeAccountId) {
		return (
			<InboxPage
				activeAccountId={activeAccountId}
				onBackToHub={() => setPage('hub')}
				onResetGoogleCredentials={deleteByocConfig}
			/>
		)
	}

	if (isCheckingConfig) {
		return <main style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif' }}>Checking setup...</main>
	}

	return (
		<main
			style={{
				minHeight: '100vh',
				padding: 24,
				background:
					'radial-gradient(1200px 600px at 5% -5%, #dbeafe 0%, transparent 40%), radial-gradient(900px 500px at 95% 5%, #cffafe 0%, transparent 42%), linear-gradient(160deg, #f8fafc 0%, #eef2ff 100%)',
				fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
				color: '#0f172a',
			}}
		>
			<section style={{ maxWidth: 980, margin: '0 auto', ...panelStyle }}>
				<header
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						gap: 12,
						marginBottom: 18,
					}}
				>
					<div>
						<h1 style={{ margin: 0, fontSize: 32 }}>2Fast</h1>
						<p style={{ margin: '6px 0 0', color: '#334155' }}>
							Central hub for Gmail and Outlook account connections.
						</p>
					</div>
					<nav style={{ display: 'flex', gap: 8 }}>
						<AppButton label="Accounts Hub" onClick={() => setPage('hub')} />
						<AppButton label="Setup Guide" onClick={() => setPage('setupHub')} />
					</nav>
				</header>

				{page === 'hub' ? (
					<section style={{ display: 'grid', gap: 14 }}>
						<div style={panelStyle}>
							<h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
								<ShieldCheck size={19} /> Connect Accounts
							</h2>
							<div style={{ marginBottom: 12, ...chipStyle }}>
								{configured ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
								{configured ? 'Gmail BYOC configured' : 'Gmail BYOC not configured'}
							</div>
							<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
								<AppButton
									label={isLoading ? 'Connecting...' : 'Connect Gmail'}
									onClick={() => void connectProvider('gmail')}
									disabled={isLoading || !configured}
									variant="secondary"
									icon={<Mail size={16} />}
								/>
								<AppButton
									label={isLoading ? 'Connecting...' : 'Connect Outlook'}
									onClick={() => void connectProvider('outlook')}
									disabled={isLoading}
									variant="primary"
									icon={<MonitorSmartphone size={16} />}
								/>
								<AppButton
									label="Cancel Connection"
									onClick={() => void cancelConnect()}
									disabled={!isLoading}
									variant="neutral"
									icon={<XCircle size={16} />}
								/>
							</div>
						</div>
						<div style={panelStyle}>
							<h2 style={{ marginTop: 0 }}>Linked Accounts</h2>
							{accounts.length === 0 ? <p style={{ marginBottom: 0, color: '#475569' }}>No linked accounts yet.</p> : null}
							<section style={{ marginTop: 12 }}>
								<h3 style={{ marginTop: 0 }}>Gmail</h3>
								{gmailAccounts.length === 0 ? (
									<p style={{ marginBottom: 0, color: '#64748b' }}>No Gmail accounts linked.</p>
								) : (
									<div style={{ display: 'grid', gap: 10 }}>
										{gmailAccounts.map((account) => (
											<div
												key={account.id}
												style={{
													padding: 12,
													borderRadius: 12,
													border: '1px solid #cbd5e1',
													background: '#f8fafc',
												}}
											>
												<button
													type="button"
													onClick={() => {
														setActiveAccountId(account.id)
														setPage('inbox')
													}}
													style={{
														textAlign: 'left',
														background: 'transparent',
														border: 0,
														padding: 0,
														cursor: 'pointer',
														width: '100%',
													}}
												>
													<strong>{account.displayName}</strong>
													<p style={{ margin: '4px 0 0', color: '#475569' }}>{account.email}</p>
												</button>
												<div style={{ marginTop: 8 }}>
													<AppButton
														label="Delete"
														onClick={() => void removeAccount(account)}
														disabled={isLoading}
														variant="danger"
													/>
												</div>
											</div>
										))}
									</div>
								)}
							</section>
							<section style={{ marginTop: 16 }}>
								<h3 style={{ marginTop: 0 }}>Outlook</h3>
								{outlookAccounts.length === 0 ? (
									<p style={{ marginBottom: 0, color: '#64748b' }}>No Outlook accounts linked.</p>
								) : (
									<div style={{ display: 'grid', gap: 10 }}>
										{outlookAccounts.map((account) => (
											<div
												key={account.id}
												style={{
													padding: 12,
													borderRadius: 12,
													border: '1px solid #cbd5e1',
													background: '#f8fafc',
												}}
											>
												<button
													type="button"
													onClick={() => {
														setActiveAccountId(account.id)
														setPage('inbox')
													}}
													style={{
														textAlign: 'left',
														background: 'transparent',
														border: 0,
														padding: 0,
														cursor: 'pointer',
														width: '100%',
													}}
												>
													<strong>{account.displayName}</strong>
													<p style={{ margin: '4px 0 0', color: '#475569' }}>{account.email}</p>
												</button>
												<div style={{ marginTop: 8 }}>
													<AppButton
														label="Delete"
														onClick={() => void removeAccount(account)}
														disabled={isLoading}
														variant="danger"
													/>
												</div>
											</div>
										))}
									</div>
								)}
							</section>
						</div>
					</section>
				) : null}

				{page === 'setupHub' ? (
					<section style={{ display: 'grid', gap: 14 }}>
						<div style={panelStyle}>
							<h2 style={{ marginTop: 0 }}>Setup Guide</h2>
							<p style={{ color: '#475569' }}>
								Choose which provider setup flow you want to open.
							</p>
							<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
								<AppButton
									label="Open Gmail Setup Guide"
									onClick={() => setPage('gmailSetup')}
									variant="secondary"
									icon={<Mail size={16} />}
								/>
							</div>
						</div>
					</section>
				) : null}

				{page === 'gmailSetup' ? (
					<section style={{ display: 'grid', gap: 14 }}>
						<div style={panelStyle}>
							<h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
								<Mail size={19} /> Gmail BYOC Setup Guide
							</h2>
							<ol style={{ lineHeight: 1.55 }}>
								<li>Log in with the Google account you want to link in 2Fast.</li>
								<li>
									Open Google Cloud Console for that account.{' '}
									<a href={GOOGLE_CONSOLE_URL} target="_blank" rel="noreferrer">
										Open Console
										<ExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'text-top' }} />
									</a>{' '}
									<button
										type="button"
										aria-label="Copy Google Cloud Console link"
										onClick={() => void copyText(GOOGLE_CONSOLE_URL, 'Google Console link copied.')}
										style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '2px 6px' }}
									>
										<Copy size={14} />
									</button>
								</li>
								<li>Create a project named Personal, or use an existing project.</li>
								<li>
									Switch to the selected project and go to APIs &amp; Services -&gt; Credentials.{' '}
									<a href={GOOGLE_CREDENTIALS_URL} target="_blank" rel="noreferrer">
										Open Credentials
										<ExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'text-top' }} />
									</a>{' '}
									<button
										type="button"
										aria-label="Copy Google Credentials link"
										onClick={() => void copyText(GOOGLE_CREDENTIALS_URL, 'Credentials link copied.')}
										style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '2px 6px' }}
									>
										<Copy size={14} />
									</button>
								</li>
								<li>
									Configure consent screen: app name `2FAst`, support email = your Gmail, audience =
									External, contact email = your email, then finish and create.
								</li>
								<li>
									Go to Data Access -&gt; Add or Remove Scopes -&gt; add scope
									`https://www.googleapis.com/auth/gmail.readonly` and update.
								</li>
								<li>
									Go to APIs &amp; Services -&gt; Enabled APIs and Services, click Enable APIs
									and Services, search for Gmail API, and click Enable.
								</li>
								<li>Go to Audience and add your email as a test user.</li>
								<li>
									Go to Clients -&gt; Create -&gt; Application type = Desktop app, then copy client ID
									and client secret.
								</li>
							</ol>
							<p style={{ marginBottom: 0 }}>
								Reference doc:{' '}
								<a href={BYOC_GUIDE_URL} target="_blank" rel="noreferrer">
									Google OAuth for Desktop Apps
									<ExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'text-top' }} />
								</a>{' '}
								<button
									type="button"
									aria-label="Copy OAuth guide link"
									onClick={() => void copyText(BYOC_GUIDE_URL, 'OAuth guide link copied.')}
									style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '2px 6px' }}
								>
									<Copy size={14} />
								</button>
							</p>
						</div>
						<div style={panelStyle}>
							<h2 style={{ marginTop: 0 }}>Enter Gmail Credentials</h2>
							<div style={{ display: 'grid', gap: 12, maxWidth: 650 }}>
								<label>
									Client ID
									<input
										value={clientId}
										onChange={(event) => setClientId(event.target.value)}
										style={{
											width: '100%',
											padding: 10,
											borderRadius: 10,
											border: '1px solid #cbd5e1',
											marginTop: 4,
										}}
									/>
								</label>
								<label>
									Client Secret
									<input
										value={clientSecret}
										onChange={(event) => setClientSecret(event.target.value)}
										style={{
											width: '100%',
											padding: 10,
											borderRadius: 10,
											border: '1px solid #cbd5e1',
											marginTop: 4,
										}}
									/>
								</label>
								<label>
									Project ID (optional)
									<input
										value={projectId}
										onChange={(event) => setProjectId(event.target.value)}
										style={{
											width: '100%',
											padding: 10,
											borderRadius: 10,
											border: '1px solid #cbd5e1',
											marginTop: 4,
										}}
									/>
								</label>
								<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
									<AppButton
										label={isLoading ? 'Saving...' : 'Save Credentials'}
										onClick={() => void saveByocConfig()}
										disabled={isLoading || !clientId.trim() || !clientSecret.trim()}
										variant="primary"
										icon={<CheckCircle2 size={16} />}
									/>
									<AppButton label="Back to Hub" onClick={() => setPage('hub')} />
								</div>
							</div>
						</div>
					</section>
				) : null}

				{page === 'outlookSetup' ? (
					<section style={{ display: 'grid', gap: 14 }}>
						<div style={panelStyle}>
							<h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
								<MonitorSmartphone size={19} /> Outlook Setup Guide
							</h2>
							<p style={{ marginBottom: 0, color: '#64748b' }}>
								This page is intentionally blank for now. You can add Microsoft setup steps here next.
							</p>
						</div>
					</section>
				) : null}

				{status ? <p style={{ color: '#166534', marginTop: 14 }}>{status}</p> : null}
				{error ? (
					<p role="alert" style={{ color: '#b91c1c', marginTop: 14 }}>
						{error}
					</p>
				) : null}
			</section>
		</main>
	)
}

export default App
