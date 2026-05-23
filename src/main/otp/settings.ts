import Store from 'electron-store'

export interface OtpSettings {
	readonly pollIntervalMs: number
	readonly otpTtlMinutes: number
	readonly autoCopyToClipboard: boolean
	readonly showNotifications: boolean
	readonly soundEnabled: boolean
	readonly launchOnStartup: boolean
	readonly filterSenders?: readonly string[]
}

interface SettingsStoreShape { readonly otpSettings: OtpSettings }
interface StoreApi<T> { get: <K extends keyof T>(key: K) => T[K]; set: <K extends keyof T>(key: K, value: T[K]) => void }

const DEFAULT_SETTINGS: OtpSettings = { pollIntervalMs: 10_000, otpTtlMinutes: 10, autoCopyToClipboard: true, showNotifications: true, soundEnabled: false, launchOnStartup: false, filterSenders: undefined }

const store = new Store<SettingsStoreShape>({ name: 'otp-settings', defaults: { otpSettings: DEFAULT_SETTINGS } })
const storeApi = store as unknown as StoreApi<SettingsStoreShape>

/** Reads persisted OTP settings. @returns Current OTP settings with defaults applied. */
export function getOtpSettings(): OtpSettings { return storeApi.get('otpSettings') }

/** Persists OTP settings merge. @param partial Partial settings update payload. @returns Updated persisted settings. */
export function updateOtpSettings(partial: Partial<OtpSettings>): OtpSettings {
	const current = getOtpSettings()
	const next: OtpSettings = { ...current, ...partial, filterSenders: partial.filterSenders ? [...partial.filterSenders] : current.filterSenders }
	storeApi.set('otpSettings', next)
	return next
}
