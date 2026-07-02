import { Menu, Notification, Tray, clipboard, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { app } from 'electron'
import type { Account } from '../shared/models.js'
import { getProviderDescriptor } from '../shared/provider-registry.js'
import type { StoredOtp } from './otp/otp-store.js'

export interface TrayContext {
	readonly getRecentOtps: () => StoredOtp[]
	readonly copyOtp: (id: string) => string | null
	readonly getAccounts: () => readonly Account[]
	readonly onOpenSettings: () => void
	readonly onPollAccount: (account: Account) => void
	readonly onQuit: () => void
}

const copyOtpFromMenu = (otp: StoredOtp, context: TrayContext): void => {
	const code = context.copyOtp(otp.id)
	if (!code) {
		return
	}
	clipboard.writeText(code)
	new Notification({ title: 'OTP copied', body: `${code} copied to clipboard.` }).show()
}

const accountItems = (
	accounts: readonly Account[],
	provider: Account['provider'],
	context: TrayContext
): MenuItemConstructorOptions[] => {
	const providerAccounts = accounts.filter((account) => account.provider === provider)
	const title = getProviderDescriptor(provider)?.displayName ?? provider
	if (providerAccounts.length === 0) {
		return [
			{ label: title, enabled: false },
			{ label: 'No accounts connected', enabled: false },
		]
	}
	return [
		{ label: title, enabled: false },
		...providerAccounts.map((account) => ({
			label: account.email,
			click: () => context.onPollAccount(account),
		})),
	]
}

/**
 * Builds the tray context menu template from current app state.
 * @param context Tray actions and state readers.
 * @returns Electron menu template.
 */
export function buildTrayMenuTemplate(context: TrayContext): MenuItemConstructorOptions[] {
	const otps = context.getRecentOtps().slice(0, 5)
	const accounts = context.getAccounts()
	const providers = [...new Set(accounts.map((account) => account.provider))]
	return [
		{ label: '2Fast', enabled: false },
		{ type: 'separator' },
		...(providers.length > 0
			? providers.flatMap((provider, index) => [
				...(index > 0 ? [{ type: 'separator' as const }] : []),
				...accountItems(accounts, provider, context),
			])
			: [{ label: 'No accounts connected', enabled: false }]),
		{ type: 'separator' },
		{ label: 'Recent OTPs', enabled: false },
		...otps.map((otp) => ({
			label: `${otp.code} (${otp.source.sender} - ${relativeTime(otp.detectedAt)})`,
			click: () => copyOtpFromMenu(otp, context),
		})),
		...(otps.length === 0 ? [{ label: 'No recent OTPs', enabled: false }] : []),
		{ type: 'separator' },
		{ label: 'Settings...', click: () => context.onOpenSettings() },
		{ type: 'separator' },
		{ label: 'Quit 2Fast', click: () => context.onQuit() },
	]
}

const relativeTime = (iso: string): string => {
	const deltaMs = Date.now() - new Date(iso).getTime()
	const minutes = Math.max(1, Math.floor(deltaMs / 60_000))
	return `${minutes}m ago`
}

const assetsPath = (): string => app.isPackaged ? join(process.resourcesPath, 'assets') : join(app.getAppPath(), 'assets')

export class TrayController {
	private readonly tray: Tray
	private readonly context: TrayContext
	private highlightTimer: NodeJS.Timeout | null = null
	private readonly normalIcon
	private readonly activeIcon
	private scanCount = 0

	constructor(context: TrayContext) {
		this.context = context
		this.normalIcon = this.loadIcon('2FAst.png')
		this.activeIcon = this.loadIcon('2FAst.png')
		this.tray = new Tray(this.normalIcon)
		this.tray.setToolTip('2Fast')
		this.tray.on('click', () => {
			this.refreshMenu()
			this.tray.popUpContextMenu()
		})
		this.refreshMenu()
	}

	onScanStarted(): void {
		this.scanCount++
		this.tray.setImage(this.activeIcon)
	}

	onScanFinished(): void {
		this.scanCount = Math.max(0, this.scanCount - 1)
		if (this.scanCount === 0 && !this.highlightTimer) {
			this.tray.setImage(this.normalIcon)
		}
	}

	onOtpDetected(): void {
		this.tray.setImage(this.activeIcon)
		if (this.highlightTimer) {
			clearTimeout(this.highlightTimer)
		}
		this.highlightTimer = setTimeout(() => {
			this.highlightTimer = null
			if (this.scanCount === 0) {
				this.tray.setImage(this.normalIcon)
			}
		}, 5_000)
		this.refreshMenu()
	}

	refreshMenu(): void {
		const menu = Menu.buildFromTemplate(buildTrayMenuTemplate(this.context))
		this.tray.setContextMenu(menu)
	}

	private loadIcon(file: string) {
		const image = nativeImage.createFromPath(join(assetsPath(), file))
		if (process.platform === 'darwin' && file.includes('Template')) {
			image.setTemplateImage(true)
		}
		return image.isEmpty() ? nativeImage.createEmpty() : image
	}
}
