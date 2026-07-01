import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountAddRequest, ImapReconnectRequest, OtpResult, OtpSettings, PollStartPayload } from '../shared/ipc-api'
import type { Account, ImapSecurity, Provider, ProviderDescriptor } from '../shared/models'
import { getProviderDescriptor, isProvider } from '../shared/provider-registry'

const BYOC_GUIDE_URL = 'https://developers.google.com/identity/protocols/oauth2/native-app'
const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/'
const GOOGLE_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials'

const DEFAULT_SETTINGS: OtpSettings = {
	pollIntervalMs: 10_000,
	otpTtlMinutes: 10,
	autoCopyToClipboard: true,
	showNotifications: true,
	soundEnabled: false,
	launchOnStartup: false,
	filterSenders: undefined,
}

const getApi = (): Window['api'] | null =>
	(window as Window & { api?: Window['api'] }).api ?? null

const getEvents = (): Window['events'] | null =>
	(window as Window & { events?: Window['events'] }).events ?? null

type AppView = 'settings' | 'gmail-setup' | 'preferences' | 'poll'
type SettingsPage = Exclude<AppView, 'poll'>

const viewFromLocation = (): AppView => {
	const params = new URLSearchParams(window.location.search)
	const view = params.get('view')
	if (view === 'poll' || view === 'gmail-setup' || view === 'preferences') {
		return view
	}
	return 'settings'
}

const settingsPageFromLocation = (): SettingsPage => {
	const view = viewFromLocation()
	return view === 'poll' ? 'settings' : view
}

const pollPayloadFromLocation = (): PollStartPayload | null => {
	const params = new URLSearchParams(window.location.search)
	const accountId = params.get('accountId')
	const email = params.get('email')
	const provider = params.get('provider')
	if (!accountId || !email || !isProvider(provider)) {
		return null
	}
	return { accountId, email, provider }
}

const pollPayloadKey = (payload: PollStartPayload): string => `${payload.provider}:${payload.accountId}:${payload.email}`

const automaticPollScans = {
	activeKeys: new Set<string>(),
	completedKeys: new Set<string>(),
}

const shellStyle: CSSProperties = {
	minHeight: '100vh',
	background: 'rgba(6, 10, 20, 0.82)',
	color: '#e5edf8',
	fontFamily: '"Segoe UI", sans-serif',
	backdropFilter: 'blur(20px)',
	border: '1px solid rgba(148, 163, 184, 0.2)',
	borderRadius: 16,
	boxShadow: '0 22px 70px rgba(0, 0, 0, 0.38)',
	boxSizing: 'border-box',
	overflow: 'hidden',
}

const panelStyle: CSSProperties = {
	background: 'rgba(15, 23, 42, 0.72)',
	border: '1px solid rgba(148, 163, 184, 0.22)',
	borderRadius: 8,
	padding: 16,
	boxShadow: '0 18px 42px rgba(0, 0, 0, 0.24)',
}

const rowPanelStyle: CSSProperties = {
	...panelStyle,
	padding: 12,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'space-between',
	gap: 12,
}

const buttonStyle: CSSProperties = {
	border: '1px solid rgba(148, 163, 184, 0.34)',
	borderRadius: 8,
	padding: '9px 12px',
	background: 'rgba(15, 23, 42, 0.68)',
	color: '#dbeafe',
	fontWeight: 650,
	cursor: 'pointer',
	display: 'inline-flex',
	alignItems: 'center',
	gap: 7,
}

const primaryButtonStyle: CSSProperties = {
	...buttonStyle,
	border: '1px solid rgba(56, 189, 248, 0.65)',
	background: 'rgba(14, 165, 233, 0.2)',
	color: '#e0f2fe',
}

const dangerButtonStyle: CSSProperties = {
	...buttonStyle,
	border: '1px solid rgba(248, 113, 113, 0.48)',
	color: '#fecaca',
}

const inputStyle: CSSProperties = {
	width: '100%',
	marginTop: 6,
	padding: 10,
	borderRadius: 8,
	border: '1px solid rgba(148, 163, 184, 0.32)',
	background: 'rgba(2, 6, 23, 0.56)',
	color: '#e5edf8',
	boxSizing: 'border-box',
}

interface WindowChromeProps {
	readonly title: string
	readonly subtitle?: string
	readonly children: ReactElement
}

interface SettingsState {
	readonly accounts: readonly Account[]
	readonly providers: readonly ProviderDescriptor[]
	readonly settings: OtpSettings
	readonly gmailConfigured: boolean
}

type PollState = 'idle' | 'scanning' | 'complete' | 'error'
type GmailSaveState = 'idle' | 'saving' | 'saved' | 'error'

const providerLabel = (provider: Provider): string => getProviderDescriptor(provider)?.displayName ?? provider

const shortClientId = (clientId: string): string => {
	const [prefix] = clientId.split('.')
	return prefix.length > 12 ? `${prefix.slice(0, 6)}...${prefix.slice(-4)}` : prefix
}

const formatTimestamp = (iso: string): string =>
	new Date(iso).toLocaleString([], {
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})

const iconButtonStyle: CSSProperties = {
	...buttonStyle,
	width: 30,
	height: 28,
	padding: 0,
	justifyContent: 'center',
}

const compactIconButtonStyle: CSSProperties = {
	...buttonStyle,
	width: 32,
	height: 32,
	padding: 0,
	justifyContent: 'center',
	borderRadius: 8,
}

const linkChipStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 8,
	border: '1px solid rgba(148, 163, 184, 0.24)',
	borderRadius: 8,
	padding: '6px 6px 6px 10px',
	background: 'rgba(2, 6, 23, 0.34)',
	color: '#cbd5e1',
	fontSize: 13,
	fontWeight: 650,
}

const setupStepStyle: CSSProperties = {
	display: 'grid',
	gridTemplateColumns: '28px 1fr',
	gap: 10,
	alignItems: 'start',
}

const setupStepNumberStyle: CSSProperties = {
	width: 24,
	height: 24,
	borderRadius: 8,
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	background: 'rgba(14, 165, 233, 0.18)',
	border: '1px solid rgba(56, 189, 248, 0.42)',
	color: '#bae6fd',
	fontSize: 12,
	fontWeight: 800,
}

/**
 * Renders the frameless dark window shell used by all utility windows.
 * @param props Window chrome content.
 * @returns Window shell element.
 */
function WindowChrome(props: WindowChromeProps): ReactElement {
	const isPollWindow = props.title === 'OTP Check' || props.title.endsWith(' OTP')
	return (
		<main style={shellStyle}>
			<header style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 0 14px', borderBottom: '1px solid rgba(148, 163, 184, 0.18)', ['WebkitAppRegion' as string]: 'drag' }}>
				<div>
					<strong style={{ display: 'block', fontSize: 13 }}>2Fast</strong>
					{props.subtitle ? <span style={{ display: 'block', marginTop: 1, color: '#94a3b8', fontSize: 11 }}>{props.subtitle}</span> : null}
				</div>
				<div style={{ display: 'flex', gap: 6, ['WebkitAppRegion' as string]: 'no-drag' }}>
					<button type="button" aria-label="Minimize" style={iconButtonStyle} onClick={() => { const api = getApi(); if (api) void api['window:minimize']() }}>-</button>
					<button type="button" aria-label="Close" style={iconButtonStyle} onClick={() => { const api = getApi(); if (api) void api['window:hide']() }}>x</button>
				</div>
			</header>
			<section style={{ padding: isPollWindow ? 12 : 20 }}>
				<h1 style={{ margin: '0 0 14px', fontSize: isPollWindow ? 16 : 24, letterSpacing: 0 }}>{props.title}</h1>
				{props.children}
			</section>
		</main>
	)
}

const initialSettingsState: SettingsState = {
	accounts: [],
	providers: [],
	settings: DEFAULT_SETTINGS,
	gmailConfigured: false,
}

/**
 * Renders one provider account group inside settings.
 * @param props Provider group data and actions.
 * @returns Provider account section.
 */
function ProviderAccounts(props: {
	readonly title: string
	readonly accounts: readonly Account[]
	readonly onReconnectAccount: (account: Account) => Promise<void>
	readonly onRemoveAccount: (account: Account) => Promise<void>
}): ReactElement {
	return (
		<section style={panelStyle}>
			<h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{props.title}</h2>
			{props.accounts.length === 0 ? <p style={{ margin: 0, color: '#94a3b8' }}>No accounts connected.</p> : (
				<div style={{ display: 'grid', gap: 8 }}>
					{props.accounts.map((account) => (
						<div key={account.id} style={rowPanelStyle}>
							<div>
								<strong style={{ display: 'block', fontSize: 14 }}>{account.email}</strong>
								<span style={{ color: '#94a3b8', fontSize: 12 }}>{account.displayName || providerLabel(account.provider)}</span>
								{account.provider === 'gmail' ? (
									<span style={{ display: 'block', color: '#64748b', fontSize: 11, marginTop: 2 }}>
										OAuth client: {account.oauthClientId ? shortClientId(account.oauthClientId) : 'current saved BYOC client'}
									</span>
								) : null}
							</div>
							<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
								<button type="button" style={buttonStyle} onClick={() => void props.onReconnectAccount(account)}>
									Reconnect
								</button>
								<button type="button" style={dangerButtonStyle} onClick={() => void props.onRemoveAccount(account)}>
									Remove
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	)
}

/**
 * Renders a compact copy icon.
 * @returns Copy icon element.
 */
function CopyIcon(): ReactElement {
	return (
		<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
			<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
		</svg>
	)
}

/**
 * Renders a compact check icon.
 * @returns Check icon element.
 */
function CheckIcon(): ReactElement {
	return (
		<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
			<path d="M20 6 9 17l-5-5" />
		</svg>
	)
}

/**
 * Renders a compact icon button for copying setup links.
 * @param props Link label and copy action.
 * @returns Copy-link chip element.
 */
function CopyLinkChip(props: {
	readonly label: string
	readonly ariaLabel: string
	readonly onCopy: () => Promise<void>
}): ReactElement {
	return (
		<span style={linkChipStyle}>
			<span>{props.label}</span>
			<button type="button" title={props.ariaLabel} aria-label={props.ariaLabel} style={compactIconButtonStyle} onClick={() => void props.onCopy()}>
				<CopyIcon />
			</button>
		</span>
	)
}

/**
 * Renders all settings, account linking, and Gmail setup controls.
 * @returns Settings window element.
 */
function SettingsView(): ReactElement {
	const [page, setPage] = useState<SettingsPage>(settingsPageFromLocation())
	const [state, setState] = useState<SettingsState>(initialSettingsState)
	const [isWorking, setIsWorking] = useState<boolean>(false)
	const [canCancelConnection, setCanCancelConnection] = useState<boolean>(false)
	const [status, setStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [gmailSaveState, setGmailSaveState] = useState<GmailSaveState>('idle')
	const [gmailSaveMessage, setGmailSaveMessage] = useState<string | null>(null)
	const [gmailEmail, setGmailEmail] = useState<string>('')
	const [clientId, setClientId] = useState<string>('')
	const [clientSecret, setClientSecret] = useState<string>('')
	const [projectId, setProjectId] = useState<string>('')
	const [imapProvider, setImapProvider] = useState<Exclude<Provider, 'gmail' | 'outlook'>>('yahoo')
	const [imapEmail, setImapEmail] = useState<string>('')
	const [imapUsername, setImapUsername] = useState<string>('')
	const [imapPassword, setImapPassword] = useState<string>('')
	const [imapHost, setImapHost] = useState<string>('')
	const [imapPort, setImapPort] = useState<string>('993')
	const [imapSecurity, setImapSecurity] = useState<ImapSecurity>('tls')

	const grouped = useMemo(() =>
		state.providers
			.map((descriptor) => ({
				descriptor,
				accounts: state.accounts.filter((account) => account.provider === descriptor.id),
			}))
			.filter((group) => group.accounts.length > 0 || group.descriptor.id === 'gmail' || group.descriptor.id === 'outlook'),
	[state.accounts, state.providers])
	const imapDescriptors = useMemo(() =>
		state.providers.filter((descriptor) => descriptor.transport === 'imap'),
	[state.providers])
	const selectedImapDescriptor = imapDescriptors.find((descriptor) => descriptor.id === imapProvider)

	const navigateToPage = (nextPage: SettingsPage): void => {
		setPage(nextPage)
		const url = new URL(window.location.href)
		url.searchParams.set('view', nextPage)
		window.history.replaceState(null, '', url)
	}

	const refresh = useCallback(async (): Promise<void> => {
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable: window.api is undefined.')
			return
		}
		const [accountsResult, providersResult, settingsResult, gmailStatusResult] = await Promise.all([
			api['accounts:list'](),
			api['providers:list'](),
			api['settings:get'](),
			api['oauth:getGoogleConfigStatus'](),
		])
		if (!accountsResult.success) setError(accountsResult.error ?? 'Failed to load accounts')
		if (!providersResult.success) setError(providersResult.error ?? 'Failed to load providers')
		if (!settingsResult.success) setError(settingsResult.error ?? 'Failed to load settings')
		setState({
			accounts: accountsResult.data ?? [],
			providers: providersResult.data ?? [],
			settings: settingsResult.data ?? DEFAULT_SETTINGS,
			gmailConfigured: Boolean(gmailStatusResult.success && gmailStatusResult.data?.configured),
		})
	}, [])

	useEffect(() => {
		void refresh()
	}, [refresh])

	const copyText = async (value: string, successMessage: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(value)
			setStatus(successMessage)
			setError(null)
		} catch (clipboardError) {
			setError(clipboardError instanceof Error ? clipboardError.message : 'Failed to copy to clipboard')
		}
	}

	const updateSettings = async (partial: Partial<OtpSettings>): Promise<void> => {
		const api = getApi()
		if (!api) return
		const result = await api['settings:update'](partial)
		if (!result.success || !result.data) {
			setError(result.error ?? 'Failed to save settings')
			return
		}
		setState((existing) => ({ ...existing, settings: result.data ?? existing.settings }))
		setStatus('Settings saved.')
	}

	const addAccount = async (request: AccountAddRequest): Promise<void> => {
		const api = getApi()
		if (!api) return
		const provider = request.provider
		setIsWorking(true)
		setCanCancelConnection(request.authentication === 'oauth')
		setError(null)
		setStatus(request.authentication === 'oauth'
			? `Waiting for ${providerLabel(provider)} sign-in callback...`
			: `Testing ${providerLabel(provider)} IMAP connection...`)
		try {
			const result = await api['accounts:add'](request)
			if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to add account')
			setStatus(`Connected ${result.data.email}`)
			await refresh()
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			if (message.toLowerCase().includes('canceled')) {
				setStatus(`${providerLabel(provider)} connection canceled.`)
				setError(null)
			} else {
				setError(message)
			}
		} finally {
			setIsWorking(false)
			setCanCancelConnection(false)
			if (request.authentication === 'app-password') setImapPassword('')
		}
	}

	const cancelConnection = async (): Promise<void> => {
		const api = getApi()
		if (!api) return
		const result = await api['oauth:cancelFlow']()
		if (!result.success) {
			setError(result.error ?? 'Failed to cancel connection')
			return
		}
		setStatus(result.data?.canceled ? 'Connection canceled.' : 'No active connection to cancel.')
		setError(null)
		setIsWorking(false)
		setCanCancelConnection(false)
	}

	const addGmailAccount = async (): Promise<void> => {
		if (!state.gmailConfigured) {
			setStatus('Save Gmail BYOC credentials before connecting Gmail.')
			setError(null)
			navigateToPage('gmail-setup')
			return
		}
		await addAccount({ authentication: 'oauth', provider: 'gmail' })
	}

	const addImapAccount = async (): Promise<void> => {
		const customSettings = imapProvider === 'imap'
			? { host: imapHost.trim(), port: Number(imapPort), security: imapSecurity }
			: {}
		await addAccount({
			authentication: 'app-password',
			provider: imapProvider,
			email: imapEmail.trim(),
			username: imapUsername.trim(),
			password: imapPassword,
			...customSettings,
		})
	}

	const removeAccount = async (account: Account): Promise<void> => {
		if (!window.confirm(`Remove ${account.email}? Stored tokens for this account will be deleted.`)) return
		const api = getApi()
		if (!api) return
		setIsWorking(true)
		setError(null)
		try {
			const result = await api['accounts:remove'](account.id)
			if (!result.success) throw new Error(result.error ?? 'Failed to remove account')
			setStatus(`Removed ${account.email}`)
			await refresh()
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : 'Unknown error')
		} finally {
			setIsWorking(false)
		}
	}

	const reconnectAccount = async (account: Account): Promise<void> => {
		const api = getApi()
		if (!api) return
		let reconnectRequest: ImapReconnectRequest | undefined
		const descriptor = getProviderDescriptor(account.provider)
		if (descriptor?.transport === 'imap') {
			const password = window.prompt(`Enter a new app password for ${account.email}:`)
			if (!password) return
			const username = window.prompt(`Enter the IMAP username for ${account.email}:`, account.email)
			if (!username) return
			reconnectRequest = { authentication: 'app-password', username, password }
		}
		setIsWorking(true)
		setCanCancelConnection(descriptor?.authentication === 'oauth')
		setError(null)
		setStatus(`Reconnecting ${account.email}...`)
		try {
			const result = await api['accounts:reconnect'](account.id, reconnectRequest)
			if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to reconnect account')
			setStatus(`Reconnected ${result.data.email}.`)
			await refresh()
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			if (message.toLowerCase().includes('canceled')) {
				setStatus(`Reconnect canceled for ${account.email}.`)
				setError(null)
			} else {
				setError(message)
			}
		} finally {
			setIsWorking(false)
			setCanCancelConnection(false)
		}
	}

	const saveByocConfig = async (): Promise<void> => {
		const api = getApi()
		if (!api) return
		setIsWorking(true)
		setGmailSaveState('saving')
		setGmailSaveMessage('Saving Gmail credentials...')
		setError(null)
		try {
			const result = await api['oauth:saveGoogleConfig']({
				gmailEmail: gmailEmail.trim(),
				clientId,
				clientSecret,
				projectId: projectId.trim() || undefined,
			})
			if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to save Gmail OAuth config')
			setStatus(`Saved config to ${result.data.path}`)
			setGmailSaveState('saved')
			setGmailSaveMessage(`Saved Gmail credentials to ${result.data.path}`)
			await refresh()
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Unknown error'
			setGmailSaveState('error')
			setGmailSaveMessage(message)
			setError(message)
		} finally {
			setIsWorking(false)
		}
	}

	const intervals = [5000, 10000, 15000, 30000, 60000]
	const ttlValues = [5, 10, 15, 30]
	const settingsSummary = [
		`${state.settings.pollIntervalMs / 1000}s polling`,
		`${state.settings.otpTtlMinutes} min OTP TTL`,
		state.settings.autoCopyToClipboard ? 'auto-copy on' : 'auto-copy off',
		state.settings.showNotifications ? 'notifications on' : 'notifications off',
	].join(' - ')
	const pageTitle = page === 'gmail-setup' ? 'Gmail Setup' : page === 'preferences' ? 'Preferences' : 'Settings'

	return (
		<WindowChrome title={pageTitle} subtitle="Tray-first OTP utility">
			<div style={{ display: 'grid', gap: 16 }}>
				{page === 'settings' ? (
					<>
						{state.accounts.length === 0 ? (
							<>
								<div style={{
									background: 'rgba(2, 6, 23, 0.42)',
									border: '1px solid rgba(148, 163, 184, 0.14)',
									borderRadius: 16,
									padding: '24px 20px',
									display: 'grid',
									gridTemplateColumns: '80px 1fr',
									gap: 20,
									alignItems: 'center',
								}}>
									<img
										src="icons/mascot/mascot-notification.png"
										alt="2Fast mascot"
										style={{
											width: 80,
											height: 80,
											objectFit: 'contain',
											imageRendering: 'pixelated'
										}}
									/>
									<div>
										<h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#f8fafc' }}>Welcome to 2Fast!</h2>
										<p style={{ margin: 0, color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
											2Fast is a tray-first desktop utility that retrieves OTP-style verification codes from your recent emails so you can copy them instantly. Get started by connecting a Gmail or Outlook account below.
										</p>
									</div>
								</div>

								<div style={{
									display: 'grid',
									gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
									gap: 12,
								}}>
									<div style={{
										background: 'rgba(2, 6, 23, 0.3)',
										border: '1px solid rgba(148, 163, 184, 0.1)',
										borderRadius: 12,
										padding: 16,
										textAlign: 'center',
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center'
									}}>
										<img
											src="icons/features/feature-fast-delivery.png"
											alt="Fast scanning"
											style={{
												width: 48,
												height: 48,
												objectFit: 'contain',
												imageRendering: 'pixelated',
												marginBottom: 10
											}}
										/>
										<strong style={{ display: 'block', fontSize: 14, color: '#e2e8f0', marginBottom: 4 }}>Fast Retrieval</strong>
										<span style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.4 }}>Rapid on-demand scans and auto-copy of codes to clipboard.</span>
									</div>

									<div style={{
										background: 'rgba(2, 6, 23, 0.3)',
										border: '1px solid rgba(148, 163, 184, 0.1)',
										borderRadius: 12,
										padding: 16,
										textAlign: 'center',
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center'
									}}>
										<img
											src="icons/features/feature-otp-codes.png"
											alt="OTP extraction"
											style={{
												width: 48,
												height: 48,
												objectFit: 'contain',
												imageRendering: 'pixelated',
												marginBottom: 10
											}}
										/>
										<strong style={{ display: 'block', fontSize: 14, color: '#e2e8f0', marginBottom: 4 }}>Smart Extraction</strong>
										<span style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.4 }}>Detects one-time passwords from the newest incoming emails.</span>
									</div>

									<div style={{
										background: 'rgba(2, 6, 23, 0.3)',
										border: '1px solid rgba(148, 163, 184, 0.1)',
										borderRadius: 12,
										padding: 16,
										textAlign: 'center',
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center'
									}}>
										<img
											src="icons/features/feature-secure.png"
											alt="Secure connection"
											style={{
												width: 48,
												height: 48,
												objectFit: 'contain',
												imageRendering: 'pixelated',
												marginBottom: 10
											}}
										/>
										<strong style={{ display: 'block', fontSize: 14, color: '#e2e8f0', marginBottom: 4 }}>Scoped Security</strong>
										<span style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.4 }}>Secure token handling & strictly sandboxed access boundaries.</span>
									</div>

									<div style={{
										background: 'rgba(2, 6, 23, 0.3)',
										border: '1px solid rgba(148, 163, 184, 0.1)',
										borderRadius: 12,
										padding: 16,
										textAlign: 'center',
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center'
									}}>
										<img
											src="icons/features/feature-private.png"
											alt="Private processing"
											style={{
												width: 48,
												height: 48,
												objectFit: 'contain',
												imageRendering: 'pixelated',
												marginBottom: 10
											}}
										/>
										<strong style={{ display: 'block', fontSize: 14, color: '#e2e8f0', marginBottom: 4 }}>Local Privacy</strong>
										<span style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.4 }}>All extraction occurs locally with short-lived history and redacted logs.</span>
									</div>
								</div>
							</>
						) : null}

						<div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
							{grouped.map((group) => (
								<ProviderAccounts key={group.descriptor.id} title={group.descriptor.displayName} accounts={group.accounts} onReconnectAccount={reconnectAccount} onRemoveAccount={removeAccount} />
							))}
						</div>

						<section style={panelStyle}>
							<h2 style={{ margin: '0 0 12px', fontSize: 17 }}>Account Management</h2>
							<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
								<button type="button" style={primaryButtonStyle} disabled={isWorking} onClick={() => void addGmailAccount()}>
									Add Gmail
								</button>
								<button type="button" style={buttonStyle} disabled={isWorking} onClick={() => void addAccount({ authentication: 'oauth', provider: 'outlook' })}>
									Add Outlook
								</button>
							</div>
						</section>

						<section style={panelStyle}>
							<h2 style={{ margin: '0 0 8px', fontSize: 17 }}>Add IMAP Account</h2>
							<p style={{ margin: '0 0 12px', color: '#94a3b8', lineHeight: 1.5 }}>
								Read-only IMAP accounts support OTP polling and message access. Use an app-specific password, never your primary account password.
							</p>
							<div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
								<label>Provider<select style={inputStyle} value={imapProvider} onChange={(event) => setImapProvider(event.target.value as Exclude<Provider, 'gmail' | 'outlook'>)}>
									{imapDescriptors.map((descriptor) => <option key={descriptor.id} value={descriptor.id}>{descriptor.displayName}</option>)}
								</select></label>
								<label>Email<input type="email" style={inputStyle} value={imapEmail} onChange={(event) => { setImapEmail(event.target.value); if (!imapUsername) setImapUsername(event.target.value) }} /></label>
								<label>IMAP username<input style={inputStyle} value={imapUsername} onChange={(event) => setImapUsername(event.target.value)} /></label>
								<label>App password<input type="password" autoComplete="new-password" style={inputStyle} value={imapPassword} onChange={(event) => setImapPassword(event.target.value)} /></label>
								{imapProvider === 'imap' ? (
									<>
										<label>IMAP host<input style={inputStyle} value={imapHost} onChange={(event) => setImapHost(event.target.value)} /></label>
										<label>Port<input type="number" min="1" max="65535" style={inputStyle} value={imapPort} onChange={(event) => setImapPort(event.target.value)} /></label>
										<label>Encryption<select style={inputStyle} value={imapSecurity} onChange={(event) => setImapSecurity(event.target.value as ImapSecurity)}>
											<option value="tls">TLS</option>
											<option value="starttls">STARTTLS</option>
										</select></label>
									</>
								) : null}
							</div>
							<p style={{ margin: '12px 0', color: '#cbd5e1', fontSize: 13 }}>{selectedImapDescriptor?.setupInstructions}</p>
							<button type="button" style={primaryButtonStyle} disabled={isWorking || !imapEmail.trim() || !imapUsername.trim() || !imapPassword} onClick={() => void addImapAccount()}>
								Test and Connect
							</button>
						</section>

						<div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
							<section style={panelStyle}>
								<h2 style={{ margin: '0 0 8px', fontSize: 17 }}>Gmail BYOC</h2>
								<p style={{ margin: '0 0 12px', color: '#94a3b8', lineHeight: 1.5 }}>
									Status: {state.gmailConfigured ? 'configured' : 'not configured'}. Gmail setup, credentials, and troubleshooting live on their own page.
								</p>
								<button type="button" style={buttonStyle} onClick={() => navigateToPage('gmail-setup')}>
									Manage Gmail Setup
								</button>
							</section>

							<section style={panelStyle}>
								<h2 style={{ margin: '0 0 8px', fontSize: 17 }}>Preferences</h2>
								<p style={{ margin: '0 0 12px', color: '#94a3b8', lineHeight: 1.5 }}>
									{settingsSummary}
								</p>
								<button type="button" style={buttonStyle} onClick={() => navigateToPage('preferences')}>
									Open Preferences
								</button>
							</section>
						</div>
					</>
				) : null}

				{page === 'gmail-setup' ? (
					<>
						<div>
							<button type="button" style={buttonStyle} onClick={() => navigateToPage('settings')}>
								Back
							</button>
						</div>
						<section style={panelStyle}>
							<h2 style={{ margin: '0 0 10px', fontSize: 17 }}>Gmail Setup</h2>
							<p style={{ margin: '0 0 10px', color: '#b6c4d6', lineHeight: 1.55 }}>
								BYOC status: {state.gmailConfigured ? 'configured' : 'not configured'}
							</p>
							<p style={{ margin: '0 0 10px', color: '#94a3b8', lineHeight: 1.55 }}>
								Open these links in a browser profile already logged into the Google account you want to connect.
							</p>
							<p style={{ margin: '0 0 10px', color: '#94a3b8', lineHeight: 1.55 }}>
								Each Gmail account remembers the OAuth client used when it was linked. New links use the most recently saved BYOC credentials, while reconnect uses the client already bound to that account.
							</p>
							<ol style={{ margin: '0 0 14px', padding: 0, color: '#cbd5e1', lineHeight: 1.55, listStyle: 'none', display: 'grid', gap: 10 }}>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>1</span><span>Log in with the Google account you want to link in 2Fast.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>2</span><span>Open Google Cloud Console for that account.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>3</span><span>Create a project named Personal, or use an existing project.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>4</span><span>Switch to the selected project and go to APIs and Services, then Credentials.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>5</span><span>Configure OAuth consent screen with app name 2FAst, support email set to your Gmail, audience set to External, and contact email set to your email.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>6</span><span>Go to Data Access, add scope <code style={{ color: '#e0f2fe' }}>https://www.googleapis.com/auth/gmail.readonly</code>, then update.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>7</span><span>Go to Enabled APIs and Services, search for Gmail API, and click Enable.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>8</span><span>Go to Audience and add your email as a test user.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>9</span><span>Go to Clients, click Create Client, set Application type to Desktop app, then create it.</span></li>
								<li style={setupStepStyle}><span style={setupStepNumberStyle}>10</span><span>Copy the client ID and client secret into the fields below, then save credentials.</span></li>
							</ol>
							<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
								<CopyLinkChip label="Google Console" ariaLabel="Copy Google Console link" onCopy={() => copyText(GOOGLE_CONSOLE_URL, 'Google Console link copied.')} />
								<CopyLinkChip label="Credentials" ariaLabel="Copy Google Credentials link" onCopy={() => copyText(GOOGLE_CREDENTIALS_URL, 'Credentials link copied.')} />
								<CopyLinkChip label="OAuth Guide" ariaLabel="Copy OAuth guide link" onCopy={() => copyText(BYOC_GUIDE_URL, 'OAuth guide link copied.')} />
							</div>
							<div style={{ marginBottom: 14, color: '#94a3b8', fontSize: 13, lineHeight: 1.55 }}>
								<p style={{ margin: '0 0 6px' }}>If Google blocks access, confirm the same email is listed under OAuth consent screen test users.</p>
								<p style={{ margin: 0 }}>If Gmail requests fail after linking, confirm the Gmail API is enabled and the readonly Gmail scope was added before creating or reconnecting the account.</p>
							</div>
							<p style={{ margin: '0 0 10px', color: '#94a3b8', fontSize: 13, lineHeight: 1.55 }}>
								The Gmail email is required so 2Fast can label the BYOC client and verify Google returns the same account during OAuth.
							</p>
							<div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
								<label>Gmail email<input type="email" required style={inputStyle} value={gmailEmail} onChange={(event) => setGmailEmail(event.target.value)} /></label>
								<label>Client ID<input style={inputStyle} value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
								<label>Client Secret<input type="password" style={inputStyle} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} /></label>
								<label>Project ID optional<input style={inputStyle} value={projectId} onChange={(event) => setProjectId(event.target.value)} /></label>
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
								<button type="button" style={primaryButtonStyle} disabled={isWorking || !gmailEmail.trim() || !clientId.trim() || !clientSecret.trim()} onClick={() => void saveByocConfig()}>
									{gmailSaveState === 'saving' ? 'Saving...' : 'Save Credentials'}
								</button>
								{gmailSaveMessage ? (
									<span role={gmailSaveState === 'error' ? 'alert' : 'status'} style={{ color: gmailSaveState === 'error' ? '#fca5a5' : '#86efac', fontSize: 13, fontWeight: 650 }}>
										{gmailSaveState === 'saved' ? <CheckIcon /> : null}
										<span style={{ marginLeft: gmailSaveState === 'saved' ? 6 : 0 }}>{gmailSaveMessage}</span>
									</span>
								) : null}
							</div>
						</section>
					</>
				) : null}

				{page === 'preferences' ? (
					<>
						<div>
							<button type="button" style={buttonStyle} onClick={() => navigateToPage('settings')}>
								Back
							</button>
						</div>
						<section style={panelStyle}>
							<h2 style={{ margin: '0 0 12px', fontSize: 17 }}>Preferences</h2>
							<div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
								<label>Polling interval<select value={state.settings.pollIntervalMs} onChange={(event) => void updateSettings({ pollIntervalMs: Number(event.target.value) })} style={inputStyle}>{intervals.map((value) => <option key={value} value={value}>{value / 1000}s</option>)}</select></label>
								<label>OTP expiry<select value={state.settings.otpTtlMinutes} onChange={(event) => void updateSettings({ otpTtlMinutes: Number(event.target.value) })} style={inputStyle}>{ttlValues.map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
								<label>Sender allowlist<input value={(state.settings.filterSenders ?? []).join(', ')} onChange={(event) => void updateSettings({ filterSenders: event.target.value.split(',').map((item) => item.trim()).filter((item) => item.length > 0) })} style={inputStyle} /></label>
							</div>
							<div style={{ display: 'grid', gap: 9, marginTop: 14 }}>
								<label><input type="checkbox" checked={state.settings.autoCopyToClipboard} onChange={(event) => void updateSettings({ autoCopyToClipboard: event.target.checked })} /> Auto-copy to clipboard</label>
								<label><input type="checkbox" checked={state.settings.showNotifications} onChange={(event) => void updateSettings({ showNotifications: event.target.checked })} /> Notifications</label>
								<label><input type="checkbox" checked={state.settings.soundEnabled} onChange={(event) => void updateSettings({ soundEnabled: event.target.checked })} /> Sound on detection</label>
								<label><input type="checkbox" checked={state.settings.launchOnStartup} onChange={(event) => void updateSettings({ launchOnStartup: event.target.checked })} /> Launch on startup</label>
							</div>
						</section>
						<section style={{
							...panelStyle,
							marginTop: 12,
							display: 'grid',
							gridTemplateColumns: '40px 1fr',
							gap: 14,
							alignItems: 'center'
						}}>
							<img
								src="icons/features/feature-cross-platform.png"
								alt="Desktop compatibility badge"
								style={{
									width: 40,
									height: 40,
									objectFit: 'contain',
									imageRendering: 'pixelated'
								}}
							/>
							<div>
								<strong style={{ display: 'block', fontSize: 13, color: '#f8fafc' }}>Desktop Compatibility</strong>
								<span style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.45 }}>
									2Fast runs in your system tray on Windows, Linux, and macOS.
								</span>
							</div>
						</section>
					</>
				) : null}

				{status ? <p style={{ margin: 0, color: '#86efac' }}>{status}</p> : null}
				{error ? <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p> : null}
				{canCancelConnection ? (
					<button type="button" style={buttonStyle} onClick={() => void cancelConnection()}>
						Cancel connection
					</button>
				) : null}
			</div>
		</WindowChrome>
	)
}

/**
 * Renders the small OTP polling window.
 * @returns Poll window element.
 */
function PollView(): ReactElement {
	const [target, setTarget] = useState<PollStartPayload | null>(pollPayloadFromLocation())
	const [scanState, setScanState] = useState<PollState>('idle')
	const [candidates, setCandidates] = useState<readonly OtpResult[]>([])
	const [copiedCode, setCopiedCode] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const runScan = useCallback(async (
		payload: PollStartPayload,
		options?: { readonly force?: boolean }
	): Promise<void> => {
		const key = pollPayloadKey(payload)
		if (!options?.force && (automaticPollScans.activeKeys.has(key) || automaticPollScans.completedKeys.has(key))) {
			return
		}
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable.')
			setScanState('error')
			return
		}
		automaticPollScans.activeKeys.add(key)
		if (options?.force) {
			automaticPollScans.completedKeys.delete(key)
		}
		setScanState('scanning')
		setCopiedCode(null)
		setError(null)
		let result: Awaited<ReturnType<Window['api']['poll:scanAccount']>>
		try {
			result = await api['poll:scanAccount'](payload.accountId)
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Failed to inspect latest emails'
			setError(message.includes('No handler registered') ? 'Restart 2Fast to load the latest polling handler.' : message)
			setScanState('error')
			automaticPollScans.activeKeys.delete(key)
			return
		}
		if (!result.success || !result.data) {
			setError(result.error ?? 'Failed to inspect latest emails')
			setScanState('error')
			automaticPollScans.activeKeys.delete(key)
			return
		}
		setCandidates(result.data)
		setScanState('complete')
		automaticPollScans.completedKeys.add(key)
		automaticPollScans.activeKeys.delete(key)
	}, [])

	useEffect(() => {
		const startAutomaticScan = (payload: PollStartPayload): void => {
			setTarget(payload)
			void runScan(payload)
		}
		const initial = pollPayloadFromLocation()
		if (initial) {
			startAutomaticScan(initial)
		}
		const events = getEvents()
		if (!events) return undefined
		return events.onStartAccountPoll(startAutomaticScan)
	}, [runScan])

	const copyCandidate = async (candidate: OtpResult): Promise<void> => {
		try {
			await navigator.clipboard.writeText(candidate.code)
			setCopiedCode(candidate.code)
		} catch (clipboardError) {
			setError(clipboardError instanceof Error ? clipboardError.message : 'Failed to copy code')
			setScanState('error')
		}
	}

	const title = target ? `${providerLabel(target.provider)} OTP` : 'OTP Check'
	const copiedCandidateLabel = (candidate: OtpResult): string => copiedCode === candidate.code ? 'Copied' : 'Copy code'

	return (
		<WindowChrome title={title} subtitle={target?.email}>
			<div style={{ display: 'grid', gap: 9 }}>
				{scanState === 'idle' ? (
					<div style={{ ...panelStyle, display: 'grid', gridTemplateColumns: '48px 1fr', gap: 12, alignItems: 'center' }}>
						<img
							src="icons/mascot/mascot-notification.png"
							alt="2Fast mascot waiting"
							style={{ width: 48, height: 48, objectFit: 'contain', imageRendering: 'pixelated' }}
						/>
						<div>
							<p style={{ margin: 0, color: '#cbd5e1', fontWeight: 700 }}>Ready to scan</p>
							<p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 12 }}>Waiting for account selection.</p>
						</div>
					</div>
				) : null}
				{scanState === 'scanning' ? (
					<div style={panelStyle}>
						<p style={{ margin: 0, color: '#e0f2fe', fontWeight: 700 }}>Inspecting latest emails...</p>
						<p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 12 }}>Scanning the newest 5 received messages for code-like content.</p>
					</div>
				) : null}
				{scanState === 'complete' && candidates.length === 0 ? (
					<div style={{ ...panelStyle, display: 'grid', gridTemplateColumns: '48px 1fr', gap: 12, alignItems: 'center' }}>
						<img
							src="icons/mascot/mascot-notification.png"
							alt="2Fast mascot empty state"
							style={{ width: 48, height: 48, objectFit: 'contain', imageRendering: 'pixelated' }}
						/>
						<div>
							<p style={{ margin: 0, color: '#fde68a', fontWeight: 700 }}>No code-like emails found.</p>
							<p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 12 }}>The latest 5 messages did not match the OTP detector.</p>
						</div>
					</div>
				) : null}
				{scanState === 'error' ? <div style={panelStyle}><p style={{ margin: 0, color: '#fca5a5', fontWeight: 700 }}>{error ?? 'Something went wrong.'}</p></div> : null}
				<div style={{ ...panelStyle, padding: 12 }}>
					<p style={{ margin: '0 0 8px', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>Latest 5 Scan</p>
					{candidates.length === 0 ? <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Code candidates will appear here after the scan.</p> : (
						<div style={{ display: 'grid', gap: 8 }}>
							{candidates.map((candidate) => (
								<div key={`${candidate.source.messageId}-${candidate.code}`} style={{ display: 'grid', gridTemplateColumns: '1fr max-content', gap: 8, alignItems: 'start', padding: '9px 10px', borderRadius: 10, background: 'rgba(2, 6, 23, 0.42)', border: '1px solid rgba(148, 163, 184, 0.14)' }}>
									<div style={{ minWidth: 0 }}>
										<code style={{ display: 'block', color: '#f8fafc', fontSize: 22, fontWeight: 800, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.code}</code>
										<span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#cbd5e1', fontSize: 12 }}>{candidate.source.sender}</span>
										<span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 11 }}>{formatTimestamp(candidate.source.receivedAt)} - {candidate.source.subject}</span>
									</div>
									<button type="button" title={copiedCandidateLabel(candidate)} aria-label={copiedCandidateLabel(candidate)} style={compactIconButtonStyle} onClick={() => void copyCandidate(candidate)}>
										{copiedCode === candidate.code ? <CheckIcon /> : <CopyIcon />}
									</button>
								</div>
							))}
						</div>
					)}
				</div>
				<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
					{target ? <button type="button" style={scanState === 'complete' ? primaryButtonStyle : buttonStyle} disabled={scanState === 'scanning'} onClick={() => void runScan(target, { force: true })}>Scan Again</button> : null}
				</div>
			</div>
		</WindowChrome>
	)
}

const App = (): ReactElement => viewFromLocation() === 'poll' ? <PollView /> : <SettingsView />

export default App
