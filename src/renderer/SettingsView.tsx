import React, { ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountAddRequest, ImapReconnectRequest, OtpResult, OtpSettings } from '../shared/ipc-api'
import type { Account, ImapSecurity, Provider } from '../shared/models'
import { getProviderDescriptor } from '../shared/provider-registry'
import { BYOC_GUIDE_URL, GOOGLE_CONSOLE_URL, GOOGLE_CREDENTIALS_URL, DEFAULT_SETTINGS, getApi, SettingsPage, settingsPageFromLocation, SettingsState, PollState, GmailSaveState, providerLabel, shortClientId, formatTimestamp, WindowChrome, CopyLinkButton, openRecentEmailsWindow } from './shared'
function CodesDashboard(props: { readonly accounts: readonly Account[] }): ReactElement {
	const [selectedAccountId, setSelectedAccountId] = useState<string>(props.accounts[0]?.id || '')
	const [scanState, setScanState] = useState<PollState>('idle')
	const [candidates, setCandidates] = useState<readonly OtpResult[]>([])
	const [copiedCode, setCopiedCode] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const isAccountExpired = Boolean(
		error &&
			(error.toLowerCase().includes('reconnect') ||
				error.toLowerCase().includes('token') ||
				error.toLowerCase().includes('expired') ||
				error.toLowerCase().includes('credential') ||
				error.toLowerCase().includes('permission'))
	)
	const selectedAccount = useMemo(() =>
		props.accounts.find((a) => a.id === selectedAccountId) || props.accounts[0],
	[props.accounts, selectedAccountId])

	const runScan = useCallback(async (accountId: string, isCurrent: () => boolean): Promise<void> => {
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable.')
			setScanState('error')
			return
		}
		setScanState('scanning')
		setCandidates([])
		setCopiedCode(null)
		setError(null)
		try {
			const result = await api['poll:scanAccount'](accountId)
			if (!isCurrent()) return
			if (!result.success || !result.data) {
				setError(result.error ?? 'Failed to inspect latest emails')
				setScanState('error')
				return
			}
			setCandidates(result.data)
			setScanState('complete')
		} catch (requestError) {
			if (!isCurrent()) return
			const message = requestError instanceof Error ? requestError.message : 'Failed to inspect emails'
			setError(message)
			setScanState('error')
		}
	}, [])

	useEffect(() => {
		if (selectedAccount) {
			let isCurrent = true
			void runScan(selectedAccount.id, () => isCurrent)
			return () => {
				isCurrent = false
			}
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
				<span className="font-label-md text-outline uppercase tracking-wider select-none mb-1 text-left">Select Account</span>
				{props.accounts.map((account) => (
					<button
						key={account.id}
						type="button"
						className={`p-3 rounded flex flex-col items-start gap-1 transition-all text-left cursor-pointer border ${
							selectedAccountId === account.id
								? 'bg-secondary-container border-secondary text-secondary'
								: 'bg-surface-container border-outline-variant text-outline hover:text-on-surface-variant hover:bg-surface-variant/30'
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
						<div className="warp-block rounded p-4 relative overflow-hidden border border-outline-variant/30 bg-surface-container/40">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className={`relative w-10 h-10 flex items-center justify-center rounded bg-secondary-container text-secondary ${scanState === 'scanning' ? 'animate-pulse' : ''}`}>
										<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
									</div>
									<div className="text-left">
										<p className="font-body-sm text-on-surface flex items-center gap-2">
											{scanState === 'scanning' ? 'Scanning Feed...' : scanState === 'error' ? 'Scan Failed' : 'Scan Feed Complete'}
											{scanState === 'scanning' && <span className="w-1.5 h-3.5 bg-primary terminal-blink inline-block"></span>}
										</p>
										<p className="font-body-sm text-outline text-[11px] mt-1">{selectedAccount.email}</p>
									</div>
								</div>
								<button
									type="button"
									disabled={scanState === 'scanning'}
									className="px-4 py-1.5 bg-surface border border-outline-variant hover:bg-surface-variant transition-colors font-label-md text-on-surface cursor-pointer flex items-center gap-2"
									onClick={() => void runScan(selectedAccount.id, () => true)}
								>
									<span className="material-symbols-outlined text-xs">sync</span>
									Scan Again
								</button>
							</div>
							{scanState === 'scanning' && (
								<div className="mt-3.5 h-[2px] w-full bg-surface-container-highest overflow-hidden">
									<div className="h-full bg-primary animate-pulse" style={{ width: '70%' }}></div>
								</div>
							)}
						</div>

						{/* Error messaging */}
						{scanState === 'error' && (
							<div className="terminal-block p-4 rounded-lg border-l-2 border-l-error text-left">
								<p className="font-body-md font-semibold text-on-surface">Failed to retrieve codes</p>
								<p className="font-body-sm text-red-300 mt-1">{error || 'Unknown error occurred'}</p>
							</div>
						)}

						{/* Candidates codes list */}
						<div className="space-y-2 text-left">
							<div className="flex items-center justify-between mb-1 select-none">
								{!isAccountExpired ? (
									<button type="button" onClick={() => void openRecentEmailsWindow(selectedAccount.id)} className="text-[11px] text-primary hover:underline cursor-pointer">
										Missed an OTP? View recent emails
									</button>
								) : (
									<div />
								)}
								<span className="font-label-md text-secondary/80 uppercase tracking-wider">LIVE</span>
							</div>

							<div className="space-y-2">
								{candidates.map((candidate, idx) => (
									<div
										key={`${candidate.source.messageId}-${candidate.code}-${idx}`}
										className={`rounded p-3 flex items-center justify-between transition-all group cursor-pointer ${
											idx === 0 ? 'warp-block-active' : 'warp-block opacity-80 hover:opacity-100'
										}`}
									>
										<div className="flex flex-col gap-1 min-w-0">
											<span className={`font-code-otp text-code-otp leading-tight select-text ${idx === 0 ? 'text-primary' : 'text-on-surface-variant'}`}>{candidate.code}</span>
											<div className="flex items-center gap-1.5 min-w-0 max-w-[320px] mt-0.5">
												<span className="font-body-sm text-outline text-[11px] truncate">{candidate.source.sender}</span>
												{candidate.source.folder && <span className="px-1 py-[1px] bg-surface-container-highest text-[9px] text-outline rounded uppercase tracking-wider shrink-0">{candidate.source.folder}</span>}
											</div>
											<span className="font-body-sm text-outline/60 text-[10px] truncate max-w-[320px]">
												{formatTimestamp(candidate.source.receivedAt)} - {candidate.source.subject}
											</span>
										</div>
										<button
											type="button"
											title={copiedCode === candidate.code ? 'Copied' : 'Copy code'}
											className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-2 rounded hover:bg-surface-bright shrink-0"
											onClick={() => void copyCandidate(candidate)}
										>
											<span className="material-symbols-outlined text-[18px]">
												{copiedCode === candidate.code ? 'check' : 'content_copy'}
											</span>
										</button>
									</div>
								))}
								{scanState === 'complete' && candidates.length === 0 && (
									<p className="font-body-sm text-outline text-center py-6 bg-surface-container/30 rounded-lg">No OTP codes found in the latest emails.</p>
								)}
								{scanState === 'idle' && (
									<p className="font-body-sm text-outline text-center py-6 bg-surface-container/30 rounded-lg">Scanning email inbox...</p>
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
				{/* SideNavBar */}
				{page !== 'add-account' && (
					<aside className="h-full w-20 flex flex-col items-center py-6 bg-surface-container-lowest border-r border-outline-variant shrink-0 z-20 select-none">

						<div className="flex flex-col gap-4 w-full px-2">
							<button
								type="button"
								className={`flex flex-col items-center gap-1 py-3 transition-all duration-200 rounded-lg cursor-pointer ${
									page === 'codes'
										? 'text-secondary bg-secondary-container font-semibold'
										: 'text-outline hover:text-on-surface hover:bg-surface-variant/30'
								}`}
								onClick={() => navigateToPage('codes')}
							>
								<span className="material-symbols-outlined text-[22px]">qr_code_2</span>
								<span className="font-label-md text-[10px] mt-1">Codes</span>
							</button>
							<button
								type="button"
								className={`flex flex-col items-center gap-1 py-3 transition-all duration-200 rounded-lg cursor-pointer ${
									page === 'settings'
										? 'text-secondary bg-secondary-container font-semibold'
										: 'text-outline hover:text-on-surface hover:bg-surface-variant/30'
								}`}
								onClick={() => navigateToPage('settings')}
							>
								<span className="material-symbols-outlined text-[22px]">settings</span>
								<span className="font-label-md text-[10px] mt-1">Accounts</span>
							</button>
							<button
								type="button"
								className={`flex flex-col items-center gap-1 py-3 transition-all duration-200 rounded-lg cursor-pointer ${
									page === 'preferences'
										? 'text-secondary bg-secondary-container font-semibold'
										: 'text-outline hover:text-on-surface hover:bg-surface-variant/30'
								}`}
								onClick={() => navigateToPage('preferences')}
							>
								<span className="material-symbols-outlined text-[22px]">tune</span>
								<span className="font-label-md text-[10px] mt-1">Prefs</span>
							</button>
						</div>
					</aside>
				)}

				{/* Main Content Pane */}
				<div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
					{/* Secondary navigation for Wizard Views */}
					{(page === 'add-account') && (
						<div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/30 shrink-0 z-40 relative bg-surface">
							<button
								type="button"
								className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-variant text-outline hover:text-on-surface transition-all duration-200 group font-label-md text-label-md cursor-pointer"
								onClick={() => navigateToPage('settings')}
							>
								<span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
								<span>cd ../accounts</span>
							</button>
							{selectedVendor === 'gmail' && (
								<div className="flex items-center gap-2">
									<CopyLinkButton url={GOOGLE_CONSOLE_URL} label="Console" icon="open_in_new" />
									<CopyLinkButton url={GOOGLE_CREDENTIALS_URL} label="Credentials" icon="key" />
									<CopyLinkButton url={BYOC_GUIDE_URL} label="Docs" icon="menu_book" />
								</div>
							)}
						</div>
					)}

					{/* Main Scrollable Canvas */}
					<main className="flex-1 overflow-y-auto p-window-padding bg-background relative">
						<div className="max-w-2xl mx-auto flex flex-col gap-6 relative z-10">
							{page === 'settings' ? (
								<>
									<div className="text-left flex items-start justify-between border-b border-outline-variant pb-4 mb-4">
										<div>
											<h1 className="font-headline-lg text-headline-lg text-on-surface mb-2 font-semibold">Account Management</h1>
											<p className="font-body-md text-outline">Connect your email providers to automatically sync 2FA tokens and security alerts.</p>
										</div>
										<button
											type="button"
											className="bg-primary hover:bg-primary-fixed text-on-primary font-bold px-6 py-3 rounded transition-all transform active:scale-95 flex items-center gap-2 cursor-pointer shrink-0 text-sm font-body-md"
											onClick={() => navigateToPage('add-account')}
										>
											<span className="material-symbols-outlined text-sm">add</span>
											Add Account
										</button>
									</div>

									<section className="flex flex-col gap-3 text-left">
										<h2 className="font-label-md text-outline uppercase tracking-widest">Connected Services</h2>
										{grouped.map((group) => (
											<div key={group.descriptor.id} className="space-y-3">
												{group.accounts.map((account) => (
													<div key={account.id} className="terminal-block p-4 rounded-lg flex items-center justify-between border-l-2 border-l-secondary group transition-all">
														<div className="flex items-center gap-4">
															<div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center border border-outline-variant">
																<span className="material-symbols-outlined text-secondary">
																	{account.provider === 'gmail' ? 'mail' : account.provider === 'outlook' ? 'work' : 'dns'}
																</span>
															</div>
															<div>
																<p className="font-body-md font-semibold text-on-surface">{account.email}</p>
																<p className="font-body-sm text-outline mt-1">
																	Provider: {providerLabel(account.provider)}
																	{account.oauthClientId ? ` • Client: ${shortClientId(account.oauthClientId)}` : ''}
																</p>
															</div>
														</div>
														<div className="flex gap-2">
															<button
																type="button"
																className="px-4 py-1.5 rounded bg-surface border border-outline-variant hover:bg-surface-variant transition-colors font-label-md text-on-surface cursor-pointer"
																onClick={() => void reconnectAccount(account)}
															>
																Reconnect
															</button>
															<button
																type="button"
																className="px-4 py-1.5 rounded bg-surface border border-outline-variant hover:border-error hover:bg-error-container text-error transition-colors font-label-md cursor-pointer"
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
											<p className="font-body-base text-outline terminal-block p-4 rounded-lg">No accounts connected yet. Click Add Account to get started.</p>
										)}
										{state.gmailConfigured && state.gmailConfigEmail && !state.accounts.some(a => a.email.toLowerCase() === state.gmailConfigEmail!.toLowerCase() && a.provider === 'gmail') && (
											<div className="terminal-block p-4 rounded-lg flex items-center justify-between border-l-2 border-l-secondary group transition-all mt-3">
												<div className="flex items-center gap-4">
													<div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center border border-outline-variant text-outline">
														<span className="material-symbols-outlined">mail</span>
													</div>
													<div>
														<p className="font-body-md font-semibold text-on-surface">{state.gmailConfigEmail}</p>
														<p className="font-body-sm text-outline mt-1">
															Provider: Google Workspace / Gmail • <span className="text-secondary font-semibold">Ready to Connect</span>
														</p>
													</div>
												</div>
												<div className="flex gap-2">
													<button
														type="button"
														disabled={isWorking}
														className="px-6 py-1.5 rounded bg-secondary-container text-secondary hover:bg-surface-variant border border-secondary transition-all font-label-md cursor-pointer disabled:opacity-50"
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
									<div className="text-left mb-6 border-b border-outline-variant pb-4">
										<h1 className="font-headline-lg text-headline-lg text-primary mb-2">&gt; Add New Account</h1>
										<p className="font-body-md text-outline">Select a provider and follow the steps to connect your mailbox.</p>
									</div>

									{/* Dropdown Card */}
									<div className="terminal-block p-6 rounded-lg text-left border border-outline-variant mb-6">
										<div className="flex flex-col gap-input-gap">
											<label className="font-label-md text-outline ml-1">SELECT VENDOR</label>
											<select
												className="w-full bg-surface-container-low border border-outline-variant rounded p-3 text-on-surface font-body-md focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all cursor-pointer font-semibold"
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
											<div className="terminal-block p-5 rounded-lg border border-outline-variant mb-5 leading-relaxed text-sm bg-surface-container/20">
												<h4 className="font-bold text-on-surface mb-2 flex items-center gap-1.5 font-headline-md">
													<span className="material-symbols-outlined text-[18px] text-primary">info</span>
													Gmail BYOC Setup Guide
												</h4>
												<p className="font-body-sm text-outline">
													Follow these steps to generate your own Google Cloud client credentials. This keeps your data private and ensures you have dedicated API rate limits.
												</p>
											</div>

											<div className="space-y-5 pb-6 border-b border-outline-variant/30">
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
														<div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center font-bold text-body-md shrink-0 select-none shadow-[0_0_10px_rgba(201,198,197,0.3)]">
															{item.step}
														</div>
														<div className="flex-1">
															<h4 className="font-headline-md text-headline-md text-on-surface mb-0.5">{item.title}</h4>
															<p className="font-body-sm text-outline leading-relaxed">{item.text}</p>
														</div>
													</div>
												))}
											</div>

											{/* Setup Card Illustration / Placeholder */}
											<div className="w-full h-48 rounded bg-surface-container border border-outline-variant flex items-center justify-center relative overflow-hidden mb-6">
												<div className="absolute inset-0 opacity-40">
													<div className="w-full h-full bg-gradient-to-br from-primary/30 via-transparent to-secondary/30"></div>
												</div>
												<div className="relative z-10 flex flex-col items-center">
													<span className="material-symbols-outlined text-primary text-[48px] mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
													<span className="font-label-md text-label-md text-on-surface tracking-[0.2em] uppercase">Awaiting Input</span>
												</div>
											</div>

											{/* Gmail BYOC config inputs */}
											<div className="terminal-block p-6 rounded-lg border border-outline-variant space-y-4">
												<h3 className="font-headline-md text-headline-md font-semibold text-on-surface mb-2">&gt; Gmail API Credentials</h3>
												<div className="grid grid-cols-2 gap-4">
													<div className="flex flex-col gap-input-gap">
														<label className="font-label-md text-outline ml-1">GMAIL EMAIL</label>
														<input
															type="email"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="user@gmail.com"
															value={gmailEmail}
															onChange={(e) => setGmailEmail(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="font-label-md text-outline ml-1">PROJECT ID (OPTIONAL)</label>
														<input
															type="text"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="e.g. personal-project-123"
															value={projectId}
															onChange={(e) => setProjectId(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap col-span-2">
														<label className="font-label-md text-outline ml-1">CLIENT ID</label>
														<input
															type="text"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="000000000000-xxxxx.apps.googleusercontent.com"
															value={clientId}
															onChange={(e) => setClientId(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap col-span-2">
														<label className="font-label-md text-outline ml-1">CLIENT SECRET</label>
														<input
															type="password"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="••••••••••••••••••••"
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
														className="ml-auto bg-primary hover:bg-primary-fixed text-on-primary font-bold px-8 py-2.5 rounded transition-all transform active:scale-95 flex items-center gap-2 font-body-md cursor-pointer disabled:opacity-50 text-sm"
														onClick={saveByocConfig}
													>
														{gmailSaveState === 'saving' ? 'Saving...' : '> Authorize'}
														<span className="material-symbols-outlined text-[18px]">keyboard_return</span>
													</button>
												</div>
											</div>
										</div>
									)}

									{selectedVendor === 'outlook' && (
										<div className="terminal-block p-6 rounded-lg text-left border border-outline-variant flex flex-col gap-4">
											<div className="flex items-center gap-3">
												<span className="material-symbols-outlined text-primary text-[28px]">work</span>
												<h3 className="font-headline-md text-headline-md font-semibold text-on-surface">Microsoft Outlook</h3>
											</div>
											<p className="font-body-md text-outline leading-relaxed">
												Connect your Outlook, Hotmail, or Microsoft 365 account with one click using Microsoft OAuth.
											</p>
											<div className="pt-2">
												<button
													type="button"
													disabled={isWorking}
													className="w-full bg-secondary-container text-secondary border border-secondary font-headline-sm py-4 rounded hover:bg-surface-variant transition-all active:scale-[0.98] font-headline-md cursor-pointer flex items-center justify-center gap-2"
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
												<div className="terminal-block p-5 rounded-lg border border-outline-variant leading-relaxed text-sm text-left">
													<h4 className="font-bold text-on-surface mb-2 flex items-center gap-1.5 font-headline-md">
														<span className="material-symbols-outlined text-[18px] text-primary">info</span>
														Zoho Mail Setup Instructions (Custom IMAP)
													</h4>
													<ol className="list-decimal list-inside space-y-2 text-outline font-body-sm">
														<li>
															<strong>Enable IMAP Access</strong>: Sign in to Zoho Mail web interface → Open <strong>Settings</strong> → Go to <strong>Mail Accounts</strong> → Select your primary email address → Scroll to the <strong>IMAP</strong> section → Check <strong>IMAP Access</strong> → Click <strong>Save</strong>.
														</li>
														<li>
															<strong>Generate App Password</strong>: Go to your Zoho Accounts dashboard (accounts.zoho.com) → Select <strong>Security</strong> → <strong>App passwords</strong> → Click <strong>Generate New Password</strong> → Enter the name <code className="bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface font-semibold text-xs border border-outline-variant/30">2FAST</code> and click <strong>Generate</strong>.
														</li>
														<li>
															<strong>Enter Credentials</strong>:
															<ul className="list-disc list-inside ml-5 mt-1 space-y-1">
																<li><strong>Email Address</strong>: Enter your full Zoho email (e.g., <code className="text-on-surface font-mono">user@zoho.com</code>).</li>
																<li><strong>IMAP Username</strong>: Must be your <strong className="text-on-surface">full email address</strong> (do not enter the app name "2FAST").</li>
																<li><strong>App Password</strong>: Copy and paste the 16-character generated code <strong className="text-on-surface">without any spaces</strong>.</li>
															</ul>
														</li>
													</ol>
												</div>
											)}

											{/* Generic IMAP instructions */}
											{selectedVendor === 'imap' && (
												<div className="terminal-block p-5 rounded-lg border border-outline-variant leading-relaxed text-sm text-left">
													<h4 className="font-bold text-on-surface mb-1.5 flex items-center gap-1.5 font-headline-md">
														<span className="material-symbols-outlined text-[18px] text-primary">info</span>
														Custom IMAP Setup
													</h4>
													<p className="font-body-sm text-outline">
														Enter the secure incoming IMAP server credentials provided by your email host (Yahoo, iCloud, Fastmail, Proton Mail Bridge, or any private mail server).
													</p>
												</div>
											)}

											{/* IMAP Input Fields Card */}
											<div className="terminal-block p-6 rounded-lg border border-outline-variant text-left">
												<div className="grid grid-cols-2 gap-x-6 gap-y-4">
													<div className="flex flex-col gap-input-gap">
														<label className="font-label-md text-outline ml-1">EMAIL ADDRESS</label>
														<input
															type="email"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="user@provider.com"
															value={imapEmail}
															onChange={(e) => {
																setImapEmail(e.target.value)
																if (!imapUsername) setImapUsername(e.target.value)
															}}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="font-label-md text-outline ml-1">IMAP USERNAME</label>
														<input
															type="text"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="full email address or login name"
															value={imapUsername}
															onChange={(e) => setImapUsername(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap col-span-2">
														<label className="font-label-md text-outline ml-1">APP PASSWORD</label>
														<input
															type="password"
															autoComplete="new-password"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 placeholder:text-outline/40"
															placeholder="••••••••••••"
															value={imapPassword}
															onChange={(e) => setImapPassword(e.target.value)}
														/>
													</div>

													<div className="flex flex-col gap-input-gap">
														<label className="font-label-md text-outline ml-1">IMAP HOST</label>
														<input
															type="text"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
															value={imapHost}
															onChange={handleHostChange}
														/>
													</div>
													<div className="flex flex-col gap-input-gap">
														<label className="font-label-md text-outline ml-1">PORT</label>
														<input
															type="number"
															min="1"
															max="65535"
															className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
															value={imapPort}
															onChange={(e) => setImapPort(e.target.value)}
														/>
													</div>
													<div className="flex flex-col gap-input-gap col-span-2">
														<label className="font-label-md text-outline ml-1">ENCRYPTION</label>
														<select
															className="w-full bg-surface-container-low border border-outline-variant rounded p-3 text-on-surface font-body-md focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all cursor-pointer"
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
															className="w-full bg-secondary-container text-secondary border border-secondary font-headline-sm py-4 rounded hover:bg-surface-variant transition-all active:scale-[0.98] font-headline-md cursor-pointer disabled:opacity-50 text-sm"
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
										<div className="terminal-block p-6 rounded-lg text-center border border-outline-variant">
											<h1 className="font-headline-lg text-headline-lg text-on-surface mb-2 font-semibold">Security Codes Feed</h1>
											<p className="font-body-base text-outline">No accounts connected yet. Please connect an account first under the Accounts tab.</p>
										</div>
									) : (
										<>
											<div className="mb-6 border-b border-outline-variant pb-4">
												<h1 className="font-headline-lg text-headline-lg text-on-surface mb-2 font-semibold">Security Codes Feed</h1>
												<p className="font-body-md text-outline">Select a connected account to scan and retrieve the latest OTP codes.</p>
											</div>
											<CodesDashboard accounts={state.accounts} />
										</>
									)}
								</div>
							) : null}

							{page === 'preferences' ? (
								<>
									{/* Screen Header */}
									<div className="text-left mb-8 border-b border-outline-variant pb-4">
										<h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold">Application Settings</h1>
										<p className="font-body-md text-outline mt-1">Configure how 2Fast handles your secure tokens and app behavior.</p>
									</div>

									{/* Settings Group: Behavior */}
									<section className="bg-surface-container border border-outline-variant p-space-lg rounded space-y-6">
										<div className="flex items-center gap-3 mb-2">
											<span className="material-symbols-outlined text-primary text-[18px]">dynamic_form</span>
											<h2 className="font-label-md text-label-md text-primary uppercase tracking-widest">Automation &amp; Polling</h2>
										</div>
										<div className="space-y-4">
											{/* Polling */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="font-body-md text-body-md text-on-surface">Background Polling</span>
													<span className="font-body-sm text-body-sm text-outline font-code-block">Refresh OTP data periodically</span>
												</div>
												<select
													value={state.settings.pollIntervalMs}
													onChange={(e) => void updateSettings({ pollIntervalMs: Number(e.target.value) })}
													className="bg-surface-container-high rounded px-3 py-1.5 border border-outline-variant hover:bg-surface-bright cursor-pointer transition-colors text-body-sm text-on-surface font-code-block focus:outline-none"
												>
													{intervals.map((val) => (
														<option key={val} value={val}>{val / 1000}s</option>
													))}
												</select>
											</div>
											{/* Auto-copy */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="font-body-md text-body-md text-on-surface">Smart Auto-copy</span>
													<span className="font-body-sm text-body-sm text-outline font-code-block">Automatically copy new OTP codes to clipboard</span>
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
													<span className="font-body-md text-body-md text-on-surface">Launch on Startup</span>
													<span className="font-body-sm text-body-sm text-outline font-code-block">Open 2Fast when your computer starts</span>
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
									<section className="bg-surface-container border border-outline-variant p-space-lg rounded space-y-6">
										<div className="flex items-center gap-3 mb-2">
											<span className="material-symbols-outlined text-primary text-[18px]">security</span>
											<h2 className="font-label-md text-label-md text-primary uppercase tracking-widest">Security &amp; Privacy</h2>
										</div>
										<div className="space-y-4">
											{/* OTP TTL */}
											<div className="flex items-center justify-between">
												<div className="flex flex-col text-left">
													<span className="font-body-md text-body-md text-on-surface">Token Time-to-Live (TTL)</span>
													<span className="font-body-sm text-body-sm text-outline font-code-block">Clear sensitive data from memory after a set time</span>
												</div>
												<select
													value={state.settings.otpTtlMinutes}
													onChange={(e) => void updateSettings({ otpTtlMinutes: Number(e.target.value) })}
													className="bg-surface-container-high rounded px-3 py-1.5 border border-outline-variant hover:bg-surface-bright cursor-pointer transition-colors text-body-sm text-on-surface font-code-block focus:outline-none"
												>
													{ttlValues.map((val) => (
														<option key={val} value={val}>{val} min</option>
													))}
												</select>
											</div>
											{/* Notifications */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="font-body-md text-body-md text-on-surface">Push Notifications</span>
													<span className="font-body-sm text-body-sm text-outline font-code-block">Show system alerts when a login code is detected</span>
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
												<span className="font-body-md text-body-md text-on-surface">Sender Allowlist</span>
												<span className="font-body-sm text-body-sm text-outline font-code-block">Comma-separated emails to filter scanning (leave empty for all)</span>
												<input
													type="text"
													value={(state.settings.filterSenders ?? []).join(', ')}
													onChange={(e) => void updateSettings({ filterSenders: e.target.value.split(',').map((s) => s.trim()).filter((s) => s.length > 0) })}
													className="w-full bg-surface border border-outline-variant rounded px-4 py-2 font-code-block text-code-block text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
													placeholder="e.g. secure@bank.com, support@github.com"
												/>
											</div>
										</div>
									</section>

									{/* Settings Group: Feedback */}
									<section className="bg-surface-container border border-outline-variant p-space-lg rounded space-y-6">
										<div className="flex items-center gap-3 mb-2">
											<span className="material-symbols-outlined text-primary text-[18px]">volume_up</span>
											<h2 className="font-label-md text-label-md text-primary uppercase tracking-widest">Sound &amp; Feedback</h2>
										</div>
										<div className="space-y-4">
											{/* Sound Alerts */}
											<div className="flex items-center justify-between group">
												<div className="flex flex-col text-left">
													<span className="font-body-md text-body-md text-on-surface">Sound Alerts</span>
													<span className="font-body-sm text-body-sm text-outline font-code-block">Play a subtle chime when an OTP is received</span>
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

									{/* Save / Actions Footer */}
									<div className="pt-8 flex items-center justify-end gap-space-md">
										<button
											type="button"
											className="px-6 py-2 rounded border border-outline-variant text-on-surface font-label-md uppercase tracking-wider hover:bg-surface-container-highest transition-all duration-200 cursor-pointer"
											onClick={() => void updateSettings(DEFAULT_SETTINGS)}
										>
											Reset Defaults
										</button>
									</div>

									{/* Footer Meta */}
									<div className="flex justify-center pt-12 pb-8">
										<p className="font-label-md text-label-md text-outline/60 font-code-block">2Fast Build v4.2.0-stable — Encrypted End-to-End</p>
									</div>
								</>
							) : null}

							{/* Feedback indicators */}
							{status && <p className="text-green-400 font-semibold text-xs text-center mt-2">{status}</p>}
							{error && <p role="alert" className="text-red-400 font-semibold text-xs text-center mt-2">{error}</p>}
							{canCancelConnection && (
								<button type="button" className="px-6 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-all duration-200 mt-2 font-bold cursor-pointer" onClick={() => void cancelConnection()}>
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
const initialSettingsState: SettingsState = {
	accounts: [],
	providers: [],
	settings: DEFAULT_SETTINGS,
	gmailConfigured: false,
}

/**
 * Renders the main App component, switching views based on url query.
 * @returns React element representing the active view (PollView or SettingsView).
 */
export default SettingsView