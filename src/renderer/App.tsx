import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import AddAccountDialog from './components/AddAccountDialog'
import CompactWindow from './components/CompactWindow'
import Settings from './components/Settings'
import AccountHubPage, { type OtpResult } from './pages/AccountHubPage'
import GmailSetupPage from './pages/GmailSetupPage'
import LinkAccountsPage from './pages/LinkAccountsPage'
import type { OtpSettings, StoredOtp } from '../shared/ipc-api'
import type { Account } from '../shared/models'

const BYOC_GUIDE_URL = 'https://developers.google.com/identity/protocols/oauth2/native-app'
const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/'
const GOOGLE_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials'
const POLL_TIMEOUT_MS = 20_000
const POLL_INTERVAL_MS = 2_000

type Page = 'hub' | 'link' | 'gmailSetup' | 'settings'

const cardStyle: CSSProperties = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }
const buttonStyle: CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 11px', background: '#fff', color: '#0f172a', fontWeight: 600, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, border: '1px solid #0f172a', background: '#0f172a', color: '#fff' }

const DEFAULT_SETTINGS: OtpSettings = { pollIntervalMs: 10_000, otpTtlMinutes: 10, autoCopyToClipboard: true, showNotifications: true, soundEnabled: false, launchOnStartup: false, filterSenders: undefined }
const getApi = (): Window['api'] | null =>
	(window as Window & { api?: Window['api'] }).api ?? null

const App = (): ReactElement => {
	const [page, setPage] = useState<Page>('hub')
	const [accounts, setAccounts] = useState<readonly Account[]>([])
	const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(true)
	const [isAddDialogOpen, setIsAddDialogOpen] = useState<boolean>(false)
	const [isWorking, setIsWorking] = useState<boolean>(false)
	const [isCheckingConfig, setIsCheckingConfig] = useState<boolean>(true)
	const [gmailConfigured, setGmailConfigured] = useState<boolean>(false)
	const [status, setStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [clientId, setClientId] = useState<string>('')
	const [clientSecret, setClientSecret] = useState<string>('')
	const [projectId, setProjectId] = useState<string>('')
	const [runningByAccountId, setRunningByAccountId] = useState<Record<string, boolean>>({})
	const [otpByAccountId, setOtpByAccountId] = useState<Record<string, OtpResult>>({})
	const [settings, setSettings] = useState<OtpSettings>(DEFAULT_SETTINGS)

	const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => `${a.provider}:${a.displayName}:${a.email}`.localeCompare(`${b.provider}:${b.displayName}:${b.email}`)), [accounts])

	const refreshAccounts = async (): Promise<void> => {
		setIsLoadingAccounts(true)
		try {
			const api = getApi()
			if (!api) throw new Error('Preload bridge unavailable: window.api is undefined.')
			const result = await api['accounts:list']()
			if (result.success) setAccounts(result.data ?? [])
			else setError(result.error ?? 'Failed to load accounts')
		} catch (requestError) {
			const message =
				requestError instanceof Error ? requestError.message : 'Failed to load accounts'
			setError(message)
		} finally {
			setIsLoadingAccounts(false)
		}
	}

	const refreshGmailConfig = async (): Promise<void> => {
		setIsCheckingConfig(true)
		try {
			const api = getApi()
			if (!api) throw new Error('Preload bridge unavailable: window.api is undefined.')
			const result = await api['oauth:getGoogleConfigStatus']()
			setGmailConfigured(Boolean(result.success && result.data?.configured))
		} catch (requestError) {
			const message =
				requestError instanceof Error ? requestError.message : 'Failed to check Gmail config'
			setError(message)
		} finally {
			setIsCheckingConfig(false)
		}
	}

	const refreshSettings = async (): Promise<void> => {
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable: window.api is undefined.')
			return
		}
		const result = await api['settings:get']()
		if (result.success && result.data) setSettings(result.data)
	}

	useEffect(() => {
		void refreshAccounts(); void refreshGmailConfig(); void refreshSettings()
		const onEsc = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				const api = getApi()
				if (api) void api['window:hide']()
			}
		}
		window.addEventListener('keydown', onEsc)
		return () => window.removeEventListener('keydown', onEsc)
	}, [])

	useEffect(() => {
		const timeout = setTimeout(() => {
			if (isCheckingConfig || isLoadingAccounts) {
				setIsCheckingConfig(false)
				setIsLoadingAccounts(false)
				setError((existing) => existing ?? 'Startup timeout: renderer could not finish initialization.')
			}
		}, 7000)
		return () => clearTimeout(timeout)
	}, [isCheckingConfig, isLoadingAccounts])

	const copyText = async (value: string, successMessage: string): Promise<void> => {
		try { await navigator.clipboard.writeText(value); setStatus(successMessage); setError(null) } catch (clipboardError) { setError(clipboardError instanceof Error ? clipboardError.message : 'Failed to copy to clipboard') }
	}

	const addAccount = async (provider: 'gmail' | 'outlook'): Promise<void> => {
		setIsWorking(true); setStatus(`Waiting for ${provider === 'gmail' ? 'Google' : 'Microsoft'} sign-in callback...`); setError(null)
		try {
			const api = getApi()
			if (!api) throw new Error('Preload bridge unavailable: window.api is undefined.')
			const result = await api['accounts:add'](provider)
			if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to add account')
			await refreshAccounts(); setStatus(`Connected ${result.data.email}`); setIsAddDialogOpen(false); setPage('hub')
		} catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unknown error') } finally { setIsWorking(false) }
	}

	const removeAccount = async (account: Account): Promise<void> => {
		if (!window.confirm(`Remove ${account.email}? Stored tokens for this account will be deleted.`)) return
		setIsWorking(true); setError(null); setStatus(null)
		try {
			const api = getApi()
			if (!api) throw new Error('Preload bridge unavailable: window.api is undefined.')
			const result = await api['accounts:remove'](account.id)
			if (!result.success) throw new Error(result.error ?? 'Failed to remove account')
			await refreshAccounts(); setStatus(`Removed ${account.email}`)
		} catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unknown error') } finally { setIsWorking(false) }
	}

	const saveByocConfig = async (): Promise<void> => {
		setIsWorking(true); setError(null); setStatus(null)
		try {
			const api = getApi()
			if (!api) throw new Error('Preload bridge unavailable: window.api is undefined.')
			const result = await api['oauth:saveGoogleConfig']({ clientId, clientSecret, projectId: projectId.trim() || undefined })
			if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to save Gmail OAuth config')
			await refreshGmailConfig(); setStatus(`Saved config to ${result.data.path}`); setPage('link')
		} catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unknown error') } finally { setIsWorking(false) }
	}

	const queryOtpForAccount = async (account: Account): Promise<void> => {
		setRunningByAccountId((existing) => ({ ...existing, [account.id]: true })); setError(null); setStatus(`Checking recent emails for ${account.email}...`)
		setOtpByAccountId((existing) => {
			const next = { ...existing }
			delete next[account.id]
			return next
		})
		try {
			const pollStartedAt = Date.now()
			const pollDeadline = pollStartedAt + POLL_TIMEOUT_MS
			const api = getApi()
			if (!api) throw new Error('Preload bridge unavailable: window.api is undefined.')
			while (Date.now() < pollDeadline) {
				const result = await api['poll:checkAccount'](account.id)
				if (!result.success) throw new Error(result.error ?? 'Failed to query recent emails')

				const historyResult = await api['otp:getHistory']()
				if (!historyResult.success || !historyResult.data) {
					break
				}

				const recentForAccount = historyResult.data.find((otp: StoredOtp) => {
					if (otp.source.accountId !== account.id || otp.expired) return false
					const detectedAtMs = new Date(otp.detectedAt).getTime()
					return detectedAtMs >= pollStartedAt - 2_000
				})

				if (recentForAccount) {
					setOtpByAccountId((existing) => ({
						...existing,
						[account.id]: {
							code: recentForAccount.code,
							source: recentForAccount.source.sender,
							detectedAt: recentForAccount.detectedAt,
						},
					}))
					setStatus(`OTP detected for ${account.email} and copied to clipboard.`)
					return
				}

				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
			}

			setStatus(`No OTP detected for ${account.email} before timeout.`)
		} catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unknown error') } finally { setRunningByAccountId((existing) => ({ ...existing, [account.id]: false })) }
	}

	const updateSettings = async (partial: Partial<OtpSettings>): Promise<void> => {
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable: window.api is undefined.')
			return
		}
		const result = await api['settings:update'](partial)
		if (result.success && result.data) setSettings(result.data)
	}

	if (isCheckingConfig && isLoadingAccounts) return <main style={{ padding: 16 }}>Loading 2Fast...</main>

	return (
		<CompactWindow
			title="OTP Utility"
			onMinimize={() => {
				const api = getApi()
				if (api) void api['window:minimize']()
			}}
			onClose={() => {
				const api = getApi()
				if (api) void api['window:hide']()
			}}
		>
			<nav style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
				<button type="button" style={page === 'hub' ? primaryButtonStyle : buttonStyle} onClick={() => setPage('hub')}>Account Hub</button>
				<button type="button" style={page === 'link' || page === 'gmailSetup' ? primaryButtonStyle : buttonStyle} onClick={() => setPage('link')}>Link Accounts</button>
				<button type="button" style={page === 'settings' ? primaryButtonStyle : buttonStyle} onClick={() => setPage('settings')}>Settings</button>
			</nav>

			{page === 'hub' ? <AccountHubPage accounts={sortedAccounts} runningByAccountId={runningByAccountId} otpByAccountId={otpByAccountId} onQueryOtp={queryOtpForAccount} onCopyOtp={async (code) => copyText(code, 'OTP copied to clipboard.')} onOpenLinkAccounts={() => setPage('link')} cardStyle={cardStyle} buttonStyle={buttonStyle} primaryButtonStyle={primaryButtonStyle} timeoutSeconds={Math.floor(POLL_TIMEOUT_MS / 1000)} /> : null}
			{page === 'link' ? <LinkAccountsPage accounts={sortedAccounts} isWorking={isWorking} onOpenAddAccount={() => setIsAddDialogOpen(true)} onOpenGmailSetup={() => setPage('gmailSetup')} onRemoveAccount={removeAccount} cardStyle={cardStyle} buttonStyle={buttonStyle} primaryButtonStyle={primaryButtonStyle} /> : null}
			{page === 'gmailSetup' ? <GmailSetupPage byocGuideUrl={BYOC_GUIDE_URL} googleConsoleUrl={GOOGLE_CONSOLE_URL} googleCredentialsUrl={GOOGLE_CREDENTIALS_URL} clientId={clientId} clientSecret={clientSecret} projectId={projectId} isWorking={isWorking} gmailConfigured={gmailConfigured} onClientIdChange={setClientId} onClientSecretChange={setClientSecret} onProjectIdChange={setProjectId} onSave={saveByocConfig} onBack={() => setPage('link')} onCopyLink={copyText} cardStyle={cardStyle} buttonStyle={buttonStyle} primaryButtonStyle={primaryButtonStyle} /> : null}
			{page === 'settings' ? <Settings settings={settings} accounts={sortedAccounts} onUpdate={updateSettings} onRemoveAccount={removeAccount} cardStyle={cardStyle} buttonStyle={buttonStyle} primaryButtonStyle={primaryButtonStyle} /> : null}

			{status ? <p style={{ marginTop: 10, color: '#166534' }}>{status}</p> : null}
			{error ? <p role="alert" style={{ marginTop: 8, color: '#b91c1c' }}>{error}</p> : null}
			<AddAccountDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} onSelectProvider={addAccount} />
		</CompactWindow>
	)
}

export default App
