import type { ReactElement } from 'react'
import { useState } from 'react'
import type { OtpSettings, PollStartPayload } from '../shared/ipc-api'
import type { Account, Provider, ProviderDescriptor } from '../shared/models'
import { getProviderDescriptor, isProvider } from '../shared/provider-registry'
import logoUrl from '../../assets/2FAst.png'

export const BYOC_GUIDE_URL = 'https://developers.google.com/identity/protocols/oauth2/native-app'
export const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/'
export const GOOGLE_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials'

export const DEFAULT_SETTINGS: OtpSettings = {
	pollIntervalMs: 10_000,
	otpTtlMinutes: 10,
	autoCopyToClipboard: true,
	showNotifications: true,
	soundEnabled: false,
	launchOnStartup: false,
	filterSenders: undefined,
}

export const getApi = (): Window['api'] | null =>
	(window as Window & { api?: Window['api'] }).api ?? null

export const getEvents = (): Window['events'] | null =>
	(window as Window & { events?: Window['events'] }).events ?? null

export type AppView = 'settings' | 'add-account' | 'gmail-setup' | 'preferences' | 'codes' | 'poll'
export type SettingsPage = 'settings' | 'add-account' | 'gmail-setup' | 'preferences' | 'codes'

export const viewFromLocation = (): AppView => {
	const params = new URLSearchParams(window.location.search)
	const view = params.get('view')
	if (view === 'poll' || view === 'gmail-setup' || view === 'add-account' || view === 'preferences' || view === 'codes') {
		return view
	}
	return 'settings'
}

export const settingsPageFromLocation = (): SettingsPage => {
	const view = viewFromLocation()
	return view === 'poll' ? 'settings' : view
}

export const pollPayloadFromLocation = (): PollStartPayload | null => {
	const params = new URLSearchParams(window.location.search)
	const accountId = params.get('accountId')
	const email = params.get('email')
	const provider = params.get('provider')
	if (!accountId || !email || !isProvider(provider)) {
		return null
	}
	return { accountId, email, provider }
}

export const pollPayloadKey = (payload: PollStartPayload): string => `${payload.provider}:${payload.accountId}:${payload.email}`

export const automaticPollScans = {
	activeKeys: new Set<string>(),
	completedKeys: new Set<string>(),
}

export interface WindowChromeProps {
	readonly title: string
	readonly subtitle?: string
	readonly children: ReactElement
	readonly view: AppView
}

export interface SettingsState {
	readonly accounts: readonly Account[]
	readonly providers: readonly ProviderDescriptor[]
	readonly settings: OtpSettings
	readonly gmailConfigured: boolean
	readonly gmailConfigEmail?: string
}

export type PollState = 'idle' | 'scanning' | 'complete' | 'error'
export type GmailSaveState = 'idle' | 'saving' | 'saved' | 'error'

export const providerLabel = (provider: Provider): string => getProviderDescriptor(provider)?.displayName ?? provider

export const shortClientId = (clientId: string): string => {
	const [prefix] = clientId.split('.')
	return prefix.length > 12 ? `${prefix.slice(0, 6)}...${prefix.slice(-4)}` : prefix
}

export const formatTimestamp = (iso: string): string =>
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
export function WindowChrome(props: WindowChromeProps): ReactElement {
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
		<div className={`${isPollWindow ? 'w-[380px] h-[520px]' : 'w-[840px] h-[720px]'} bg-background text-on-surface flex flex-col relative overflow-hidden border border-outline-variant rounded-xl shadow-2xl`}>
			{/* TopAppBar (Custom Title Bar) */}
			<header className="fixed top-0 w-full h-8 flex items-center justify-between px-4 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant z-50 select-none font-body-sm" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
				<div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
					<img src={logoUrl} alt="2Fast Logo" className="w-5 h-5 object-contain" />
					<span className="font-bold text-primary font-headline-md text-sm">2Fast</span>
					<span className="text-outline text-[10px] uppercase tracking-widest ml-2 opacity-70">
						{isPollWindow ? `~/2fast/feed` : `~/2fast/${props.view}`}
					</span>
				</div>
				<div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
					<button type="button" aria-label="Minimize" className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-variant transition-colors text-outline cursor-pointer" onClick={handleMinimize}>
						<span className="material-symbols-outlined text-[16px]">remove</span>
					</button>
					<button type="button" aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded hover:bg-error-container hover:text-on-error-container transition-colors text-outline cursor-pointer" onClick={handleClose}>
						<span className="material-symbols-outlined text-[16px]">close</span>
					</button>
				</div>
			</header>

			{/* Main Layout Area */}
			{props.children}
		</div>
	)
}

export function CopyLinkButton({ url, label, icon }: { readonly url: string; readonly label: string; readonly icon: string }): ReactElement {
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
			className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-outline-variant/50 text-on-surface hover:bg-surface-variant transition-all text-body-sm font-medium cursor-pointer"
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
 * @param props Component properties.
 * @returns Dashboard element.
 */