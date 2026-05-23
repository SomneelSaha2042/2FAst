import { Menu, Notification, Tray, clipboard, nativeImage } from 'electron'
import { join } from 'node:path'
import { app } from 'electron'
import type { Account } from '../shared/models.js'
import type { StoredOtp } from './otp/otp-store.js'

interface TrayContext {
	readonly getRecentOtps: () => StoredOtp[]
	readonly copyOtp: (id: string) => string | null
	readonly getAccounts: () => readonly Account[]
	readonly getLastPollLabel: () => string
	readonly isPaused: () => boolean
	readonly onTogglePause: () => void
	readonly onOpenSettings: () => void
	readonly onQuit: () => void
	readonly onToggleWindow: () => void
}

export class TrayController {
	private readonly tray: Tray
	private readonly context: TrayContext
	private highlightTimer: NodeJS.Timeout | null = null
	private readonly normalIcon
	private readonly activeIcon

	constructor(context: TrayContext) {
		this.context = context
		this.normalIcon = this.loadIcon('tray-icon.png')
		this.activeIcon = this.loadIcon('tray-icon-active.png')
		this.tray = new Tray(this.normalIcon)
		this.tray.setToolTip('2Fast - OTP Monitor')
		this.tray.on('click', () => this.context.onToggleWindow())
		this.refreshMenu()
	}

	onOtpDetected(): void {
		this.tray.setImage(this.activeIcon)
		if (this.highlightTimer) {
			clearTimeout(this.highlightTimer)
		}
		this.highlightTimer = setTimeout(() => {
			this.tray.setImage(this.normalIcon)
			this.highlightTimer = null
		}, 5_000)
		this.refreshMenu()
	}

	refreshMenu(): void {
		const otps = this.context.getRecentOtps().slice(0, 5)
		const accounts = this.context.getAccounts()
		const gmailCount = accounts.filter((account) => account.provider === 'gmail').length
		const outlookCount = accounts.filter((account) => account.provider === 'outlook').length
		const menu = Menu.buildFromTemplate([
			{ label: '2Fast - OTP Monitor', enabled: false },
			{ type: 'separator' },
			...otps.map((otp) => ({
				label: `* ${otp.code} (${otp.source.sender} - ${this.relativeTime(otp.detectedAt)})`,
				click: () => {
					const code = this.context.copyOtp(otp.id)
					if (!code) {
						return
					}
					clipboard.writeText(code)
					new Notification({ title: 'OTP copied', body: `${code} copied to clipboard.` }).show()
					this.refreshMenu()
				},
			})),
			...(otps.length === 0 ? [{ label: 'No recent OTPs', enabled: false }] : []),
			{ type: 'separator' },
			{ label: `Accounts: ${gmailCount} Gmail, ${outlookCount} Outlook`, enabled: false },
			{ label: `Last poll: ${this.context.getLastPollLabel()}`, enabled: false },
			{ type: 'separator' },
			{
				label: this.context.isPaused() ? 'Resume polling' : 'Pause polling',
				click: () => {
					this.context.onTogglePause()
					this.refreshMenu()
				},
			},
			{ label: 'Settings...', click: () => this.context.onOpenSettings() },
			{ type: 'separator' },
			{ label: 'Quit 2Fast', click: () => this.context.onQuit() },
		])
		this.tray.setContextMenu(menu)
	}

	private loadIcon(file: string) {
		const image = nativeImage.createFromPath(join(app.getAppPath(), 'resources', file))
		return image.isEmpty() ? nativeImage.createEmpty() : image
	}

	private relativeTime(iso: string): string {
		const deltaMs = Date.now() - new Date(iso).getTime()
		const minutes = Math.max(1, Math.floor(deltaMs / 60_000))
		return `${minutes}m ago`
	}
}
