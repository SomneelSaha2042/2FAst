import type { ReactElement } from 'react'
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

type AppView = 'settings' | 'add-account' | 'gmail-setup' | 'preferences' | 'codes' | 'poll'
type SettingsPage = 'settings' | 'add-account' | 'gmail-setup' | 'preferences' | 'codes'

const viewFromLocation = (): AppView => {
	const params = new URLSearchParams(window.location.search)
	const view = params.get('view')
	if (view === 'poll' || view === 'gmail-setup' || view === 'add-account' || view === 'preferences' || view === 'codes') {
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

interface WindowChromeProps {
	readonly title: string
	readonly subtitle?: string
	readonly children: ReactElement
	readonly view: AppView
}

interface SettingsState {
	readonly accounts: readonly Account[]
	readonly providers: readonly ProviderDescriptor[]
	readonly settings: OtpSettings
	readonly gmailConfigured: boolean
	readonly gmailConfigEmail?: string
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

/**
 * Renders the frameless dark window shell used by all utility windows.
 * @param props Window chrome content.
 * @returns Window shell element.
 */
function WindowChrome(props: WindowChromeProps): ReactElement {
	const isPollWindow = props.view === 'poll'

	const handleMinimize = () => {
		const api = getApi()
		if (api) void api['window:minimize']()
	}

	const handleClose = () => {
		const api = getApi()
		if (api) void api['window:hide']()
	}

	return (
		<div className={`${isPollWindow ? 'w-[380px] h-[520px]' : 'w-[840px] h-[720px]'} bg-background text-on-surface flex flex-col relative overflow-hidden border border-outline-variant/15 rounded-xl shadow-2xl`}>
			{/* TopAppBar (Custom Title Bar) */}
			<header className="fixed top-0 w-full h-8 flex items-center justify-between px-4 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/15 z-50 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
				<div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
					<img src="/2FAst.png" alt="2Fast Logo" className="w-4 h-4 object-contain" />
					<span className="font-bold text-primary tracking-wide text-sm">2Fast</span>
					<span className="text-[10px] text-outline ml-3 uppercase tracking-widest font-semibold opacity-60">
						{isPollWindow ? `${props.title} • ${props.subtitle || ''}` : `${props.title}`}
					</span>
				</div>
				<div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
					<button type="button" aria-label="Minimize" className="w-8 h-[24px] flex items-center justify-center rounded-[4px] hover:bg-surface-container-highest transition-colors text-outline cursor-pointer" onClick={handleMinimize}>
						<span className="material-symbols-outlined text-[16px]">remove</span>
					</button>
					<button type="button" aria-label="Close" className="w-8 h-[24px] flex items-center justify-center rounded-[4px] hover:bg-error/20 hover:text-error transition-colors text-outline cursor-pointer" onClick={handleClose}>
						<span className="material-symbols-outlined text-[16px]">close</span>
					</button>
				</div>
			</header>

			{/* Main Layout Area */}
			{props.children}
		</div>
	)
}

const initialSettingsState: SettingsState = {
	accounts: [],
	providers: [],
	settings: DEFAULT_SETTINGS,
	gmailConfigured: false,
}

function CopyLinkButton({ url, label, icon }: { readonly url: string; readonly label: string; readonly icon: string }): ReactElement {
	const [copied, setCopied] = useState(false)
	const handleCopy = async (): Promise<void> => {
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// ignore
		}
	}
	return (
		<button
			type="button"
			className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface hover:bg-surface-container-highest transition-all text-xs font-semibold cursor-pointer"
			onClick={() => void handleCopy()}
			title={url}
		>
			<span className="material-symbols-outlined text-[16px] opacity-70">{icon}</span>
			<span>{label}</span>
			<span className={`material-symbols-outlined text-[14px] ml-1 ${copied ? 'text-green-400' : 'text-primary opacity-80'}`}>
				{copied ? 'check' : 'content_copy'}
			</span>
		</button>
	)
}

/**
 * CodesDashboard Component: Handles Scanning and Displaying OTP Codes
 * inside the large main dashboard panel.
 */
function CodesDashboard(props: { readonly accounts: readonly Account[] }): ReactElement {
	const [selectedAccountId, setSelectedAccountId] = useState<string>(props.accounts[0]?.id || '')
	const [scanState, setScanState] = useState<PollState>('idle')
	const [candidates, setCandidates] = useState<readonly OtpResult[]>([])
	const [copiedCode, setCopiedCode] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const selectedAccount = useMemo(() =>
		props.accounts.find((a) => a.id === selectedAccountId) || props.accounts[0],
	[props.accounts, selectedAccountId])

	const runScan = useCallback(async (accountId: string): Promise<void> => {
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable.')
			setScanState('error')
			return
		}
		setScanState('scanning')
		setCopiedCode(null)
		setError(null)
		try {
			const result = await api['poll:scanAccount'](accountId)
			if (!result.success || !result.data) {
				setError(result.error ?? 'Failed to inspect latest emails')
				setScanState('error')
				return
			}
			setCandidates(result.data)
			setScanState('complete')
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Failed to inspect emails'
			setError(message)
			setScanState('error')
		}
	}, [])

	useEffect(() => {
		if (selectedAccount) {
			void runScan(selectedAccount.id)
		}
	}, [selectedAccount, runScan])

	const copyCandidate = async (candidate: OtpResult): Promise<void> => {
		try {
			await navigator.clipboard.writeText(candidate.code)
			setCopiedCode(candidate.code)
		} catch (clipboardError) {
			setError(clipboardError instanceof Error ? clipboardError.message : 'Failed to copy code')
		}
	}

	return (
		<div className="grid grid-cols-[220px_1fr] gap-6 items-start">
			{/* Accounts list selection */}
			<div className="flex flex-col gap-2">
				<span className="text-[10px] font-bold text-outline uppercase tracking-wider select-none mb-1 text-left">Select Account</span>
				{props.accounts.map((account) => (
					<button
						key={account.id}
						type="button"
						className={`p-3 rounded-lg flex flex-col items-start gap-1 transition-all text-left cursor-pointer border ${
							selectedAccountId === account.id
								? 'bg-primary/10 border-primary text-primary'
								: 'bg-surface-container border-outline-variant/20 text-outline hover:text-on-surface-variant hover:bg-surface-variant/30'
						}`}
						onClick={() => setSelectedAccountId(account.id)}
					>
						<span className="text-xs font-semibold truncate w-full">{account.email}</span>
						<span className="text-[10px] opacity-75">{providerLabel(account.provider)}</span>
					</button>
				))}
			</div>

			{/* Scan Feed Panel */}
			<div className="space-y-4">
				{selectedAccount && (
					<>
						{/* Active scan status */}
						<div className="glass-panel rounded-xl p-4 relative overflow-hidden">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className={`relative w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 text-primary ${scanState === 'scanning' ? 'animate-pulse' : ''}`}>
										<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
									</div>
									<div className="text-left">
										<p className="text-sm font-semibold text-on-surface">
											{scanState === 'scanning' ? 'Scanning Feed...' : scanState === 'error' ? 'Scan Failed' : 'Scan Feed Complete'}
										</p>
										<p className="text-xs text-outline">{selectedAccount.email}</p>
									</div>
								</div>
								<button
									type="button"
									disabled={scanState === 'scanning'}
									className="px-4 py-1.5 bg-primary-container hover:brightness-110 active:scale-[0.98] text-on-primary-container font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 text-xs cursor-pointer"
									onClick={() => void runScan(selectedAccount.id)}
								>
									<span className="material-symbols-outlined text-xs">sync</span>
									Scan Again
								</button>
							</div>
							{scanState === 'scanning' && (
								<div className="mt-3.5 h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
									<div className="h-full bg-primary-container animate-pulse" style={{ width: '70%' }}></div>
								</div>
							)}
						</div>

						{/* Error messaging */}
						{scanState === 'error' && (
							<div className="glass-panel rounded-xl p-4 border-l-2 border-l-error text-left">
								<p className="text-sm font-semibold text-on-surface">Failed to retrieve codes</p>
								<p className="text-xs text-red-300 mt-1">{error || 'Unknown error occurred'}</p>
							</div>
						)}

						{/* Candidates codes list */}
						<div className="space-y-2 text-left">
							<div className="flex items-center justify-between mb-1 select-none">
								<span className="text-[10px] font-bold text-outline uppercase tracking-wider">Latest 5 Scan</span>
								<span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Active Codes</span>
							</div>

							<div className="space-y-2">
								{candidates.map((candidate, idx) => (
									<div
										key={`${candidate.source.messageId}-${candidate.code}-${idx}`}
										className={`glass-panel p-3 rounded-lg flex items-center justify-between transition-all group glow-hover ${
											idx === 0 ? 'border-l-2 border-l-primary' : ''
										}`}
									>
										<div className="flex flex-col min-w-0">
											<span className="font-bold text-on-surface leading-tight text-lg tracking-wider font-code-otp select-text">{candidate.code}</span>
											<span className="text-xs text-outline mt-0.5 truncate max-w-[320px]">{candidate.source.sender}</span>
											<span className="text-[10px] text-outline/60 mt-0.5 truncate max-w-[320px]">
												{formatTimestamp(candidate.source.receivedAt)} - {candidate.source.subject}
											</span>
										</div>
										<button
											type="button"
											title={copiedCode === candidate.code ? 'Copied' : 'Copy code'}
											className="text-primary hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-surface-container-highest shrink-0"
											onClick={() => void copyCandidate(candidate)}
										>
											<span className="material-symbols-outlined text-[18px]">
												{copiedCode === candidate.code ? 'check' : 'content_copy'}
											</span>
										</button>
									</div>
								))}
								{scanState === 'complete' && candidates.length === 0 && (
									<p className="text-xs text-outline text-center py-6 bg-surface-container/30 rounded-lg">No OTP codes found in the latest emails.</p>
								)}
								{scanState === 'idle' && (
									<p className="text-xs text-outline text-center py-6 bg-surface-container/30 rounded-lg">Scanning email inbox...</p>
								)}
							</div>
						</div>
					</>
				)}
			</div>
		</div>
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
	const [imapProvider, setImapProvider] = useState<Exclude<Provider, 'gmail' | 'outlook'>>('zoho')
	const [imapEmail, setImapEmail] = useState<string>('')
	const [imapUsername, setImapUsername] = useState<string>('')
	const [imapPassword, setImapPassword] = useState<string>('')
	const [imapHost, setImapHost] = useState<string>('')
	const [imapPort, setImapPort] = useState<string>('993')
	const [imapSecurity, setImapSecurity] = useState<ImapSecurity>('tls')
	const [selectedVendor, setSelectedVendor] = useState<Provider>('gmail')
	const [hasManuallyEditedHost, setHasManuallyEditedHost] = useState<boolean>(false)

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


	const getZohoHostForEmail = (emailStr: string): string => {
		const domain = emailStr.trim().split('@')[1]?.toLowerCase() || ''
		if (domain.endsWith('.in')) return 'imap.zoho.in'
		if (domain.endsWith('.eu')) return 'imap.zoho.eu'
		if (domain.endsWith('.com.cn') || domain.endsWith('.cn')) return 'imap.zoho.com.cn'
		return 'imap.zoho.com'
	}

	const handleVendorChange = (vendor: Provider) => {
		setSelectedVendor(vendor)
		setHasManuallyEditedHost(false)
		if (vendor !== 'gmail' && vendor !== 'outlook') {
			setImapProvider(vendor)
		}
	}

	const handleHostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setImapHost(e.target.value)
		setHasManuallyEditedHost(true)
	}

	useEffect(() => {
		if (page === 'gmail-setup') {
			setPage('add-account')
			setSelectedVendor('gmail')
		}
	}, [page])

	useEffect(() => {
		if (hasManuallyEditedHost) return
		if (imapProvider === 'zoho') {
			setImapHost(getZohoHostForEmail(imapEmail))
			setImapPort('993')
			setImapSecurity('tls')
		} else {
			const desc = imapDescriptors.find((d) => d.id === imapProvider)
			if (desc?.imapPreset) {
				setImapHost(desc.imapPreset.host)
				setImapPort(String(desc.imapPreset.port))
				setImapSecurity(desc.imapPreset.security)
			}
		}
	}, [imapProvider, imapEmail, imapDescriptors, hasManuallyEditedHost])

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
			gmailConfigEmail: gmailStatusResult.success ? gmailStatusResult.data?.email : undefined,
		})
	}, [])

	useEffect(() => {
		void refresh()
	}, [refresh])

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
			setSelectedVendor('gmail')
			navigateToPage('add-account')
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
			setTimeout(() => navigateToPage('settings'), 1500)
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
	const pageTitle = page === 'add-account' ? 'Add Account' : page === 'preferences' ? 'Preferences' : page === 'codes' ? 'Codes Feed' : 'Settings'

	return (
		<WindowChrome title={pageTitle} view={page}>
			<div className="flex flex-1 mt-8 h-[calc(720px-32px)] overflow-hidden">
				{/* SideNavBar (Visible on Settings, Codes & Preferences views) */}
				{page !== 'add-account' && (
					<aside className="h-full w-20 flex flex-col items-center py-6 bg-surface/80 backdrop-blur-xl border-r border-outline-variant/15 shrink-0 z-20 select-none">
						<div className="flex flex-col items-center gap-1 mb-6 opacity-80" title="2FAst Secure End-to-End">
							<span className="material-symbols-outlined text-primary text-[28px]">lock_open</span>
							<span className="text-[9px] text-outline text-center uppercase tracking-widest font-bold">Secure</span>
						</div>
						<div className="flex flex-col gap-4 w-full px-2">
							<button
								type="button"
								className={`flex flex-col items-center gap-1 py-3 transition-all duration-200 rounded-lg cursor-pointer ${
									page === 'codes'
										? 'text-primary bg-primary/10 font-semibold'
										: 'text-outline hover:text-on-surface-variant hover:bg-surface-variant/30'
								}`}
								onClick={() => navigateToPage('codes')}
							>
								<span className="material-symbols-outlined text-[22px]">qr_code_2</span>
								<span className="text-[10px] font-bold uppercase tracking-wider mt-1">Codes</span>
							</button>
							<button
								type="button"
								className={`flex flex-col items-center gap-1 py-3 transition-all duration-200 rounded-lg cursor-pointer ${
									page === 'settings'
										? 'text-primary bg-primary/10 font-semibold'
										: 'text-outline hover:text-on-surface-variant hover:bg-surface-variant/30'
								}`}
								onClick={() => navigateToPage('settings')}
							>
								<span className="material-symbols-outlined text-[22px]">settings</span>
								<span className="text-[10px] font-bold uppercase tracking-wider mt-1">Accounts</span>
							</button>
							<button
								type="button"
								className={`flex flex-col items-center gap-1 py-3 transition-all duration-200 rounded-lg cursor-pointer ${
									page === 'preferences'
										? 'text-primary bg-primary/10'
										: 'text-outline hover:text-on-surface-variant hover:bg-surface-variant/30'
								}`}
								onClick={() => navigateToPage('preferences')}
							>
								<span className="material-symbols-outlined text-[22px]">tune</span>
								<span className="text-[10px] font-bold uppercase tracking-wider mt-1">Prefs</span>
							</button>
						</div>
					</aside>
				)}

				{/* Main Content Pane */}
				<div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
					{/* Secondary navigation for Wizard Views */}
					{(page === 'add-account') && (
						<div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/10 shrink-0 z-40 relative">
							<button
								type="button"
								className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-variant/30 text-outline transition-all duration-200 group cursor-pointer"
								onClick={() => navigateToPage('settings')}
							>
								<span className="material-symbols-outlined text-[20px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
								<span className="text-label-caps font-bold">Back to Accounts</span>
							</button>
							{selectedVendor === 'gmail' && (
								<div className="flex items-center gap-2">
									<CopyLinkButton url={GOOGLE_CONSOLE_URL} label="Console" icon="open_in_new" />
									<CopyLinkButton url={GOOGLE_CREDENTIALS_URL} label="Credentials" icon="key" />
									<CopyLinkButton url={BYOC_GUIDE_URL} label="OAuth Guide" icon="menu_book" />
								</div>
							)}
						</div>
					)}

					{/* Main Scrollable Canvas */}
					<main className="flex-1 overflow-y-auto p-window-padding bg-background relative">
						{/* Atmospheric Background Glow */}
						<div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[120px] rounded-full -mr-32 -mt-32 pointer-events-none"></div>

						<div className="max-w-2xl mx-auto flex flex-col gap-6 relative z-10">
							{page === 'settings' ? (
								<>
									<div className="text-left flex items-start justify-between">
										<div>
											<h1 className="text-headline-md text-on-surface mb-2 font-semibold">Account Management</h1>
											<p className="text-body-base text-outline">Manage your connected email providers for OTP syncing.</p>
										</div>
										<button
											type="button"
											className="bg-primary hover:bg-primary-container text-on-primary font-bold px-6 py-3 rounded-xl transition-all transform active:scale-95 shadow-[0_0_20px_rgba(164,201,255,0.2)] flex items-center gap-2 cursor-pointer shrink-0"
											onClick={() => navigateToPage('add-account')}
										>
											<span className="material-symbols-outlined">add</span>
											Add Account
										</button>
									</div>

									<section className="flex flex-col gap-3 text-left mt-4">
										<h2 className="text-label-caps text-outline uppercase tracking-[0.15em] font-bold">Connected Services</h2>
										{grouped.map((group) => (
											<div key={group.descriptor.id} className="space-y-3">
												{group.accounts.map((account) => (
													<div key={account.id} className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-l-primary group transition-all">
														<div className="flex items-center gap-4">
															<div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary">
																<span className="material-symbols-outlined">
																	{account.provider === 'gmail' ? 'mail' : account.provider === 'outlook' ? 'work' : 'dns'}
																</span>
															</div>
															<div>
																<p className="text-body-base font-semibold text-on-surface">{account.email}</p>
																<p className="text-body-sm text-outline">
																	Provider: {providerLabel(account.provider)}
																	{account.oauthClientId ? ` • Client: ${shortClientId(account.oauthClientId)}` : ''}
																</p>
															</div>
														</div>
														<div className="flex gap-2">
															<button
																type="button"
																className="px-4 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-variant/50 transition-colors text-label-caps text-on-surface font-bold cursor-pointer"
																onClick={() => void reconnectAccount(account)}
															>
																Reconnect
															</button>
															<button
																type="button"
																className="px-4 py-1.5 rounded-lg border border-outline-variant hover:border-error/50 hover:bg-error/10 text-error transition-colors text-label-caps font-bold cursor-pointer"
																onClick={() => void removeAccount(account)}
															>
																Remove
															</button>
														</div>
													</div>
												))}
											</div>
										))}
										{state.accounts.length === 0 && !state.gmailConfigured && (
											<p className="text-body-base text-outline glass-panel p-4 rounded-xl">No accounts connected yet. Click Add Account to get started.</p>
										)}
										{state.gmailConfigured && state.gmailConfigEmail && !state.accounts.some(a => a.email.toLowerCase() === state.gmailConfigEmail!.toLowerCase() && a.provider === 'gmail') && (
											<div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-l-outline-variant group transition-all mt-3">
												<div className="flex items-center gap-4">
													<div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-outline">
														<span className="material-symbols-outlined">mail</span>
													</div>
													<div>
														<p className="text-body-base font-semibold text-on-surface">{state.gmailConfigEmail}</p>
														<p className="text-body-sm text-outline">
															Provider: Google Workspace / Gmail • <span className="text-primary font-semibold">Ready to Connect</span>
														</p>
													</div>
												</div>
												<div className="flex gap-2">
													<button
														type="button"
														disabled={isWorking}
														className="px-6 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 transition-colors text-label-caps font-bold cursor-pointer disabled:opacity-50"
														onClick={addGmailAccount}
													>
														Connect
													</button>
												</div>
											</div>
										)}
									</section>
								</>
							) : null}

							{page === 'add-account' ? (
								<>
									<div className="text-left mb-6">
										<h1 className="text-headline-md text-on-surface mb-2 font-semibold">Add New Account</h1>
										<p className="text-body-base text-outline">Select a provider and follow the steps to connect your mailbox.</p>
									</div>

									{/* Dropdown Card */}
									<div className="glass-panel p-6 rounded-xl text-left border border-outline-variant/30 mb-6">
										<div className="flex flex-col gap-input-gap">
											<label className="text-label-caps text-outline ml-1">SELECT VENDOR</label>
											<select
												className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all cursor-pointer font-semibold"
												value={selectedVendor}
												onChange={(e) => handleVendorChange(e.target.value as Provider)}
											>
												<option value="gmail">Google Workspace / Gmail</option>
												<option value="outlook">Microsoft Outlook</option>
												<option value="zoho">Zoho Mail (Verified IMAP)</option>
												<option value="imap">Custom IMAP (Other Providers)</option>
											</select>
										</div>
									</div>

									{/* Conditional views */}
									{selectedVendor === 'gmail' && (
										<div className="space-y-6 text-left">
											<div className="glass-panel p-5 rounded-xl border border-blue-500/20 bg-blue-950/10 mb-5 leading-relaxed text-sm">
												<h4 className="font-bold text-on-surface mb-2 flex items-center gap-1.5">
													<span className="material-symbols-outlined text-[18px] text-primary">info</span>
													Gmail BYOC Setup Guide
												</h4>
												<p className="text-outline">
													Follow these steps to generate your own Google Cloud client credentials. This keeps your data private and ensures you have dedicated API rate limits.
												</p>
											</div>

											<div className="space-y-5 pb-6">
												{[
													{ step: 1, title: 'Log In', text: 'Log in with the Google account you want to link in 2Fast.' },
													{ step: 2, title: 'Open Google Console', text: 'Open the Google Cloud Console for that account.' },
													{ step: 3, title: 'Create a Project', text: 'Create a project named "Personal", or use an existing project.' },
													{ step: 4, title: 'Navigate to Credentials', text: 'Switch to the selected project and go to APIs and Services, then Credentials.' },
													{ step: 5, title: 'Configure Consent Screen', text: 'Configure OAuth consent screen with app name 2FAst, support email set to your Gmail, audience set to External, and contact email set to your email.' },
													{ step: 6, title: 'Add modify Scope', text: 'Go to Data Access, add scope "https://www.googleapis.com/auth/gmail.modify", then update.' },
													{ step: 7, title: 'Enable Gmail API', text: 'Go to Enabled APIs and Services, search for Gmail API, and click Enable.' },
													{ step: 8, title: 'Add Test User', text: 'Go to Audience and add your email as a test user.' },
													{ step: 9, title: 'Create Desktop Client', text: 'Go to Clients, click Create Client, set Application type to Desktop app, then create it.' },
													{ step: 10, title: 'Copy and Save', text: 'Copy the client ID and client secret into the fields below, then save credentials.' }
												].map((item) => (
													<div key={item.step} className="flex gap-4">
														<div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-[0_0_10px_rgba(164,201,255,0.3)]">
															{item.step}
														</div>
														<div className="flex-1">
															<h4 className="text-body-base font-semibold text-on-surface mb-0.5">{item.title}</h4>
															<p className="text-body-sm text-outline leading-relaxed">{item.text}</p>
														</div>
													</div>
												))}
											</div>

											{/* Gmail BYOC config inputs */}
											<div className="glass-panel p-6 rounded-xl border border-outline-variant/30 space-y-4">
												<h3 className="text-headline-sm font-semibold text-on-surface mb-2">Gmail API Credentials</h3>
												<div className="grid grid-cols-2 gap-4">
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">GMAIL EMAIL</label>
														<input
															type="email"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
															placeholder="user@gmail.com"
															value={gmailEmail}
															onChange={(e) => setGmailEmail(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">PROJECT ID (OPTIONAL)</label>
														<input
															type="text"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
															placeholder="e.g. personal-project-123"
															value={projectId}
															onChange={(e) => setProjectId(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">CLIENT ID</label>
														<input
															type="text"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-mono text-sm"
															placeholder="Paste Client ID"
															value={clientId}
															onChange={(e) => setClientId(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">CLIENT SECRET</label>
														<input
															type="password"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
															placeholder="Paste Client Secret"
															value={clientSecret}
															onChange={(e) => setClientSecret(e.target.value)}
														/>
													</div>
												</div>
												<div className="pt-2 flex items-center justify-between gap-4">
													{gmailSaveMessage && (
														<span role={gmailSaveState === 'error' ? 'alert' : 'status'} className={`text-xs font-semibold ${gmailSaveState === 'error' ? 'text-red-400' : 'text-green-400'}`}>
															{gmailSaveMessage}
														</span>
													)}
													<button
														type="button"
														disabled={isWorking || !gmailEmail.trim() || !clientId.trim() || !clientSecret.trim()}
														className="ml-auto bg-gradient-to-r from-primary-container to-blue-600 text-on-primary-container font-bold py-3.5 px-8 rounded-xl shadow-[0_0_20px_rgba(96,165,250,0.2)] hover:shadow-[0_0_30px_rgba(96,165,250,0.4)] hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer text-sm"
														onClick={saveByocConfig}
													>
														{gmailSaveState === 'saving' ? 'Saving...' : 'Save Google Credentials'}
													</button>
												</div>
											</div>
										</div>
									)}

									{selectedVendor === 'outlook' && (
										<div className="glass-panel p-6 rounded-xl text-left border border-outline-variant/30 flex flex-col gap-4">
											<div className="flex items-center gap-3">
												<span className="material-symbols-outlined text-primary text-[28px]">work</span>
												<h3 className="text-headline-sm font-semibold text-on-surface">Microsoft Outlook</h3>
											</div>
											<p className="text-body-base text-outline leading-relaxed">
												Connect your Outlook, Hotmail, or Microsoft 365 account with one click using Microsoft OAuth.
											</p>
											<div className="pt-2">
												<button
													type="button"
													disabled={isWorking}
													className="w-full bg-primary hover:bg-primary-container text-on-primary font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 text-sm shadow-[0_0_15px_rgba(164,201,255,0.15)]"
													onClick={() => void addAccount({ authentication: 'oauth', provider: 'outlook' })}
												>
													<span className="material-symbols-outlined text-[20px]">login</span> Connect Outlook Account
												</button>
											</div>
										</div>
									)}

									{selectedVendor !== 'gmail' && selectedVendor !== 'outlook' && (
										<div className="space-y-4">
											{/* Zoho custom instructions */}
											{selectedVendor === 'zoho' && (
												<div className="glass-panel p-5 rounded-xl border border-blue-500/20 bg-blue-950/10 leading-relaxed text-sm text-left">
													<h4 className="font-bold text-on-surface mb-2 flex items-center gap-1.5">
														<span className="material-symbols-outlined text-[18px] text-primary">info</span>
														Zoho Mail Setup Instructions (Custom IMAP)
													</h4>
													<ol className="list-decimal list-inside space-y-2 text-outline">
														<li>
															<strong>Enable IMAP Access</strong>: Sign in to Zoho Mail web interface → Open <strong>Settings</strong> → Go to <strong>Mail Accounts</strong> → Select your primary email address → Scroll to the <strong>IMAP</strong> section → Check <strong>IMAP Access</strong> → Click <strong>Save</strong>.
														</li>
														<li>
															<strong>Generate App Password</strong>: Go to your Zoho Accounts dashboard (accounts.zoho.com) → Select <strong>Security</strong> → <strong>App passwords</strong> → Click <strong>Generate New Password</strong> → Enter the name <code className="bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface font-semibold text-xs">2FAST</code> and click <strong>Generate</strong>.
														</li>
														<li>
															<strong>Enter Credentials</strong>:
															<ul className="list-disc list-inside ml-5 mt-1 space-y-1">
																<li><strong>Email Address</strong>: Enter your full Zoho email (e.g., <code className="text-on-surface">user@zoho.com</code>).</li>
																<li><strong>IMAP Username</strong>: Must be your <strong className="text-on-surface">full email address</strong> (do not enter the app name "2FAST").</li>
																<li><strong>App Password</strong>: Copy and paste the 16-character generated code <strong className="text-on-surface">without any spaces</strong>.</li>
															</ul>
														</li>
													</ol>
												</div>
											)}



											{/* Generic IMAP instructions */}
											{selectedVendor === 'imap' && (
												<div className="glass-panel p-5 rounded-xl border border-outline-variant/30 leading-relaxed text-sm text-left">
													<h4 className="font-bold text-on-surface mb-1.5 flex items-center gap-1.5">
														<span className="material-symbols-outlined text-[18px] text-primary">info</span>
														Custom IMAP Setup
													</h4>
													<p className="text-outline">
														Enter the secure incoming IMAP server credentials provided by your email host (Yahoo, iCloud, Fastmail, Proton Mail Bridge, or any private mail server).
													</p>
												</div>
											)}

											{/* IMAP Input Fields Card */}
											<div className="glass-panel p-6 rounded-xl border border-outline-variant/30 text-left">
												<div className="grid grid-cols-2 gap-x-6 gap-y-4">
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">EMAIL ADDRESS</label>
														<input
															type="email"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all placeholder:text-outline/40"
															placeholder="user@provider.com"
															value={imapEmail}
															onChange={(e) => {
																setImapEmail(e.target.value)
																if (!imapUsername) setImapUsername(e.target.value)
															}}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">IMAP USERNAME</label>
														<input
															type="text"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all placeholder:text-outline/40"
															placeholder="full email address or login name"
															value={imapUsername}
															onChange={(e) => setImapUsername(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap col-span-2">
														<label className="text-label-caps text-outline ml-1">APP PASSWORD</label>
														<input
															type="password"
															autoComplete="new-password"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all placeholder:text-outline/40"
															placeholder="••••••••••••"
															value={imapPassword}
															onChange={(e) => setImapPassword(e.target.value)}
														/>
													</div>

													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">IMAP HOST</label>
														<input
															type="text"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
															value={imapHost}
															onChange={handleHostChange}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="text-label-caps text-outline ml-1">PORT</label>
														<input
															type="number"
															min="1"
															max="65535"
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
															value={imapPort}
															onChange={(e) => setImapPort(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap col-span-2">
														<label className="text-label-caps text-outline ml-1">ENCRYPTION</label>
														<select
															className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-3 text-on-surface text-body-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all cursor-pointer"
															value={imapSecurity}
															onChange={(e) => setImapSecurity(e.target.value as ImapSecurity)}
														>
															<option value="tls">TLS (SSL/TLS)</option>
															<option value="starttls">STARTTLS</option>
														</select>
													</div>

													<div className="col-span-2 mt-2">
														<button
															type="button"
															disabled={isWorking || !imapEmail.trim() || !imapUsername.trim() || !imapPassword || !imapHost.trim()}
															className="w-full bg-gradient-to-r from-primary-container to-blue-600 text-on-primary-container font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(96,165,250,0.2)] hover:shadow-[0_0_30px_rgba(96,165,250,0.4)] hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer text-sm"
															onClick={addImapAccount}
														>
															Verify and Connect Account
														</button>
													</div>
												</div>
											</div>
										</div>
									)}
								</>
							) : null}

							{page === 'codes' ? (
								<div className="text-left">
									{state.accounts.length === 0 ? (
										<div className="glass-panel p-6 rounded-xl text-center">
											<h1 className="text-headline-md text-on-surface mb-2 font-semibold">Security Codes Feed</h1>
											<p className="text-body-base text-outline">No accounts connected yet. Please connect an account first under the Accounts tab.</p>
										</div>
									) : (
										<>
											<div className="mb-6">
												<h1 className="text-headline-md text-on-surface mb-2 font-semibold">Security Codes Feed</h1>
												<p className="text-body-base text-outline">Select a connected account to scan and retrieve the latest OTP codes.</p>
											</div>
											<CodesDashboard accounts={state.accounts} />
										</>
									)}
								</div>
							) : null}



							{page === 'preferences' ? (
								<>
									{/* Screen Header */}
									<div className="text-left">
										<h1 className="text-headline-md text-on-surface font-semibold">Application Settings</h1>
										<p className="text-body-base text-outline">Configure how 2Fast handles your secure tokens and app behavior.</p>
									</div>

									{/* Settings Group: Behavior */}
									<section className="glass-panel p-card-padding rounded-xl space-y-6 neon-glow transition-all duration-300">
										<div className="flex items-center gap-3 mb-2">
											<span className="material-symbols-outlined text-primary">dynamic_form</span>
											<h2 className="text-label-caps text-primary uppercase tracking-widest font-bold">Automation & Polling</h2>
										</div>
										<div className="space-y-4">
											{/* Polling */}
											<div className="flex items-center justify-between">
												<div className="flex flex-col text-left">
													<span className="text-body-base text-on-surface">Background Polling</span>
													<span className="text-body-sm text-outline">Refresh OTP data periodically</span>
												</div>
												<select
													value={state.settings.pollIntervalMs}
													onChange={(e) => void updateSettings({ pollIntervalMs: Number(e.target.value) })}
													className="bg-surface-container rounded-lg px-3 py-1.5 border border-outline-variant/30 text-body-sm text-on-surface focus:outline-none cursor-pointer"
												>
													{intervals.map((val) => (
														<option key={val} value={val}>{val / 1000}s</option>
													))}
												</select>
											</div>
											{/* Auto-copy */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="text-body-base text-on-surface">Smart Auto-copy</span>
													<span className="text-body-sm text-outline">Automatically copy new OTP codes to clipboard</span>
												</div>
												<label className="custom-toggle">
													<input
														type="checkbox"
														checked={state.settings.autoCopyToClipboard}
														onChange={(e) => void updateSettings({ autoCopyToClipboard: e.target.checked })}
													/>
													<span className="slider"></span>
												</label>
											</div>
											{/* Startup */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="text-body-base text-on-surface">Launch on Startup</span>
													<span className="text-body-sm text-outline">Open 2Fast when your computer starts</span>
												</div>
												<label className="custom-toggle">
													<input
														type="checkbox"
														checked={state.settings.launchOnStartup}
														onChange={(e) => void updateSettings({ launchOnStartup: e.target.checked })}
													/>
													<span className="slider"></span>
												</label>
											</div>
										</div>
									</section>

									{/* Settings Group: Security */}
									<section className="glass-panel p-card-padding rounded-xl space-y-6 neon-glow transition-all duration-300">
										<div className="flex items-center gap-3 mb-2">
											<span className="material-symbols-outlined text-primary">security</span>
											<h2 className="text-label-caps text-primary uppercase tracking-widest font-bold">Security & Privacy</h2>
										</div>
										<div className="space-y-4">
											{/* OTP TTL */}
											<div className="flex items-center justify-between">
												<div className="flex flex-col text-left">
													<span className="text-body-base text-on-surface">Token Time-to-Live (TTL)</span>
													<span className="text-body-sm text-outline">Clear sensitive data from memory after a set time</span>
												</div>
												<select
													value={state.settings.otpTtlMinutes}
													onChange={(e) => void updateSettings({ otpTtlMinutes: Number(e.target.value) })}
													className="bg-surface-container rounded-lg px-3 py-1.5 border border-outline-variant/30 text-body-sm text-on-surface focus:outline-none cursor-pointer"
												>
													{ttlValues.map((val) => (
														<option key={val} value={val}>{val} min</option>
													))}
												</select>
											</div>
											{/* Notifications */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="text-body-base text-on-surface">Push Notifications</span>
													<span className="text-body-sm text-outline">Show system alerts when a login code is detected</span>
												</div>
												<label className="custom-toggle">
													<input
														type="checkbox"
														checked={state.settings.showNotifications}
														onChange={(e) => void updateSettings({ showNotifications: e.target.checked })}
													/>
													<span className="slider"></span>
												</label>
											</div>
											{/* Sender allowlist */}
											<div className="flex flex-col gap-2 text-left">
												<span className="text-body-base text-on-surface">Sender Allowlist</span>
												<span className="text-body-sm text-outline">Comma-separated emails to filter scanning (leave empty for all)</span>
												<input
													type="text"
													value={(state.settings.filterSenders ?? []).join(', ')}
													onChange={(e) => void updateSettings({ filterSenders: e.target.value.split(',').map((s) => s.trim()).filter((s) => s.length > 0) })}
													className="w-full bg-[#0F172A] border border-outline-variant rounded-lg p-2.5 text-on-surface text-xs focus:border-primary focus:outline-none"
													placeholder="e.g. secure@bank.com, support@github.com"
												/>
											</div>
										</div>
									</section>

									{/* Settings Group: Feedback */}
									<section className="glass-panel p-card-padding rounded-xl space-y-6 neon-glow transition-all duration-300">
										<div className="flex items-center gap-3 mb-2">
											<span className="material-symbols-outlined text-primary">volume_up</span>
											<h2 className="text-label-caps text-primary uppercase tracking-widest font-bold">Sound & Feedback</h2>
										</div>
										<div className="space-y-4">
											{/* Sound Alerts */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="text-body-base text-on-surface">Sound Alerts</span>
													<span className="text-body-sm text-outline">Play a subtle chime when an OTP is received</span>
												</div>
												<label className="custom-toggle">
													<input
														type="checkbox"
														checked={state.settings.soundEnabled}
														onChange={(e) => void updateSettings({ soundEnabled: e.target.checked })}
													/>
													<span className="slider"></span>
												</label>
											</div>
										</div>
									</section>

									{/* Footer Meta */}
									<div className="flex justify-center pt-6 pb-4">
										<p className="text-label-caps text-outline/40 font-bold">2Fast Build v4.2.0 — Encrypted End-to-End</p>
									</div>
								</>
							) : null}

							{/* Feedback indicators */}
							{status && <p className="text-green-400 font-semibold text-xs text-center mt-2">{status}</p>}
							{error && <p role="alert" className="text-red-400 font-semibold text-xs text-center mt-2">{error}</p>}
							{canCancelConnection && (
								<button type="button" className="px-6 py-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-all duration-200 mt-2 font-bold cursor-pointer" onClick={() => void cancelConnection()}>
									Cancel Connection Flow
								</button>
							)}
						</div>
					</main>
				</div>
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

	const title = target ? `${providerLabel(target.provider)}` : 'OTP Check'
	const copiedCandidateLabel = (candidate: OtpResult): string => copiedCode === candidate.code ? 'Copied' : 'Copy code'

	return (
		<WindowChrome title={title} subtitle={target?.email} view="poll">
			<div className="flex flex-1 mt-8 h-[calc(520px-32px)] overflow-hidden">
				{/* SideNavBar (Compact version for Tray OTP feed) */}
				<nav className="h-full w-16 bg-surface/80 backdrop-blur-xl border-r border-outline-variant/15 flex flex-col items-center py-4 gap-4 z-40 shrink-0 select-none animate-fade-in">
					<button
						type="button"
						disabled={scanState === 'scanning'}
						title="Scan Feed"
						className="w-10 h-10 flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
						onClick={() => {
							if (target) void runScan(target, { force: true })
						}}
					>
						<span className="material-symbols-outlined">lock_open</span>
					</button>
					<button
						type="button"
						title="Open Settings"
						className="w-10 h-10 flex items-center justify-center text-outline hover:text-on-surface-variant hover:bg-surface-variant/30 rounded-lg transition-all duration-200 cursor-pointer"
						onClick={() => {
							const api = getApi()
							if (api) void api['window:openSettings']()
						}}
					>
						<span className="material-symbols-outlined">settings</span>
					</button>
				</nav>

				{/* Main Content Area */}
				<main className="flex-1 flex flex-col p-window-padding overflow-y-auto relative text-left">
					{/* Header Section */}
					<div className="mb-4">
						<h1 className="text-headline-sm text-primary mb-0.5 font-bold">{target ? providerLabel(target.provider) : 'Mail'} OTP</h1>
						<p className="text-[10px] font-bold text-outline uppercase tracking-wider">{target?.email || 'Authentication Feed'}</p>
					</div>

					{/* Scan states representation */}
					<div className="space-y-3 shrink-0">
						{scanState === 'scanning' && (
							<div className="glass-panel rounded-xl p-4 relative overflow-hidden">
								<div className="flex items-center gap-3">
									<div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
										<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
										<div className="absolute inset-0 rounded-full border border-primary/40 animate-ping"></div>
									</div>
									<div>
										<p className="text-sm font-semibold text-on-surface">Scanning Feed...</p>
										<p className="text-xs text-outline">Inspecting latest emails</p>
									</div>
								</div>
								{/* Pulse scan line */}
								<div className="mt-3.5 h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
									<div className="h-full bg-primary-container animate-pulse" style={{ width: '60%' }}></div>
								</div>
							</div>
						)}

						{scanState === 'idle' && (
							<div className="glass-panel rounded-xl p-4 flex items-center gap-3 border-l-2 border-l-primary">
								<div className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest text-outline">
									<span className="material-symbols-outlined">mail</span>
								</div>
								<div>
									<p className="text-sm font-semibold text-on-surface">Ready to Scan</p>
									<p className="text-xs text-outline">Waiting for account query trigger...</p>
								</div>
							</div>
						)}

						{scanState === 'complete' && candidates.length === 0 && (
							<div className="glass-panel rounded-xl p-4 flex items-center gap-3 border-l-2 border-l-tertiary">
								<div className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest text-tertiary">
									<span className="material-symbols-outlined">warning</span>
								</div>
								<div>
									<p className="text-sm font-semibold text-on-surface">No codes found</p>
									<p className="text-xs text-outline">No OTPs matched in the latest 5 emails</p>
								</div>
							</div>
						)}

						{scanState === 'error' && (
							<div className="flex flex-col gap-2">
								<div className="glass-panel rounded-xl p-4 flex items-center gap-3 border-l-2 border-l-error">
									<div className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest text-error">
										<span className="material-symbols-outlined">error</span>
									</div>
									<div>
										<p className="text-sm font-semibold text-on-surface">Scan failed</p>
										<p className="text-xs text-red-300 truncate max-w-[200px]">{error || 'Something went wrong'}</p>
									</div>
								</div>
								{(error?.toLowerCase().includes('reconnect') || error?.toLowerCase().includes('expired')) && (
									<button
										type="button"
										className="w-full py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-bold text-xs rounded-lg transition-colors cursor-pointer"
										onClick={() => {
											const api = getApi()
											if (api) void api['window:openSettings']()
										}}
									>
										Open Settings to Reconnect
									</button>
								)}
							</div>
						)}
					</div>

					{/* Candidates list */}
					<div className="flex-1 flex flex-col gap-2 mt-4 min-h-0">
						<div className="flex items-center justify-between mb-1 select-none shrink-0">
							<span className="text-[10px] font-bold text-outline uppercase tracking-wider">Latest 5 Scan</span>
							<span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Live Updates</span>
						</div>

						<div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
							{candidates.map((candidate, idx) => (
								<div
									key={`${candidate.source.messageId}-${candidate.code}-${idx}`}
									className={`glass-panel p-3 rounded-lg flex items-center justify-between transition-all group glow-hover ${
										idx === 0 ? 'border-l-2 border-l-primary' : ''
									}`}
								>
									<div className="flex flex-col min-w-0">
										<span className="font-bold text-on-surface leading-tight text-lg tracking-wider font-code-otp select-text">{candidate.code}</span>
										<span className="text-xs text-outline mt-0.5 truncate max-w-[170px]">{candidate.source.sender}</span>
										<span className="text-[10px] text-outline/60 mt-0.5 truncate max-w-[170px]">{formatTimestamp(candidate.source.receivedAt)} - {candidate.source.subject}</span>
									</div>
									<button
										type="button"
										title={copiedCandidateLabel(candidate)}
										aria-label={copiedCandidateLabel(candidate)}
										className="text-primary hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-surface-container-highest shrink-0"
										onClick={() => void copyCandidate(candidate)}
									>
										<span className="material-symbols-outlined text-[18px]">
											{copiedCode === candidate.code ? 'check' : 'content_copy'}
										</span>
									</button>
								</div>
							))}
							{candidates.length === 0 && (
								<p className="text-xs text-outline text-center py-6 select-none">Candidates will appear here after scanning.</p>
							)}
						</div>
					</div>

					{/* Scan Trigger Button */}
					{target && (
						<div className="mt-4 shrink-0">
							<button
								type="button"
								disabled={scanState === 'scanning'}
								className="w-full h-11 bg-primary-container hover:brightness-110 active:scale-[0.98] text-on-primary-container font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/10 disabled:opacity-50 cursor-pointer text-sm"
								onClick={() => void runScan(target, { force: true })}
							>
								<span className="material-symbols-outlined text-sm">sync</span>
								Scan Again
							</button>
						</div>
					)}
				</main>
			</div>
		</WindowChrome>
	)
}

const App = (): ReactElement => viewFromLocation() === 'poll' ? <PollView /> : <SettingsView />

export default App
