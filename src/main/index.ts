import { app, BrowserWindow, Menu } from 'electron'
import Store from 'electron-store'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { setOtpPollService, setOnOpenSettings, setOnOpenRecentEmails } from './ipc/index.js'
import { loadGoogleOAuthConfig } from './oauth/google-config.js'
import { OtpPollService } from './otp/poll-service.js'
import { TrayController } from './tray.js'
import { buildAppMenu } from './menu.js'
import { getOtpSettings } from './otp/settings.js'
import { setAutoLaunch } from './startup.js'
import { accountManager } from './accounts/account-manager.js'
import type { Account } from '../shared/models.js'
import type { PollStartPayload } from '../shared/ipc-api.js'

const APP_ID = 'com.2fast.app'

interface WindowState {
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
}
interface WindowStoreShape {
	readonly settingsWindowState: WindowState
}
interface StoreApi<T> {
	get: <K extends keyof T>(key: K) => T[K]
	set: <K extends keyof T>(key: K, value: T[K]) => void
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const windowStore = new Store<WindowStoreShape>({
	name: 'window-state',
	defaults: { settingsWindowState: { x: 120, y: 120, width: 840, height: 720 } },
})
const windowStoreApi = windowStore as unknown as StoreApi<WindowStoreShape>

let settingsWindow: BrowserWindow | null = null
let pollWindow: BrowserWindow | null = null
let recentEmailsWindow: BrowserWindow | null = null
let tray: TrayController | null = null
let isQuitting = false

if (process.platform === 'win32') {
	app.setAppUserModelId(APP_ID)
}

const otpPollService = new OtpPollService({
	logDirectory: () => app.getPath('logs'),
	onOtpDetected: (otp) => {
		settingsWindow?.webContents.send('otp:detected', otp)
		pollWindow?.webContents.send('otp:detected', otp)
		tray?.onOtpDetected()
	},
	onOtpExpired: (otpId) => {
		settingsWindow?.webContents.send('otp:expired', otpId)
		pollWindow?.webContents.send('otp:expired', otpId)
		tray?.refreshMenu()
	},
	onPollStatus: (status) => {
		settingsWindow?.webContents.send('poll:status', status)
		pollWindow?.webContents.send('poll:status', status)
		tray?.refreshMenu()
	},
	onScanStarted: () => {
		tray?.onScanStarted()
	},
	onScanFinished: () => {
		tray?.onScanFinished()
	},
})

setOtpPollService(otpPollService)

const rendererPath = (): string => join(app.getAppPath(), 'dist/renderer/index.html')
const assetsPath = (): string => app.isPackaged ? join(process.resourcesPath, 'assets') : join(app.getAppPath(), 'assets')
const appIconPath = (): string => join(assetsPath(), '2FAst.png')

const loadRendererView = async (
	window: BrowserWindow,
	view: 'settings' | 'poll' | 'recent-emails',
	payload?: PollStartPayload
): Promise<void> => {
	const devServerUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://localhost:5173' : undefined)
	const params = new URLSearchParams({ view })
	if (payload) {
		params.set('accountId', payload.accountId)
		params.set('email', payload.email)
		params.set('provider', payload.provider)
	}
	if (devServerUrl) {
		await window.loadURL(`${devServerUrl}?${params.toString()}`)
		return
	}
	await window.loadFile(rendererPath(), { query: Object.fromEntries(params.entries()) })
}

const rememberSettingsBounds = (window: BrowserWindow): void => {
	const bounds = window.getBounds()
	windowStoreApi.set('settingsWindowState', {
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
	})
}

const createSettingsWindow = (): BrowserWindow => {
	const state = windowStoreApi.get('settingsWindowState')
	const window = new BrowserWindow({
		x: state.x,
		y: state.y,
		width: state.width,
		height: state.height,
		minWidth: 760,
		minHeight: 620,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: '#00000000',
		titleBarStyle: 'hidden',
		icon: appIconPath(),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: join(currentDir, '../preload/index.cjs'),
		},
	})
	window.on('close', (event) => {
		if (!isQuitting) {
			event.preventDefault()
			window.hide()
		}
	})
	window.on('moved', () => rememberSettingsBounds(window))
	window.on('resized', () => rememberSettingsBounds(window))
	window.on('closed', () => {
		if (settingsWindow === window) {
			settingsWindow = null
		}
	})
	return window
}

const createPollWindow = (): BrowserWindow => {
	const window = new BrowserWindow({
		width: 380,
		height: 520,
		minWidth: 320,
		minHeight: 480,
		resizable: false,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: '#00000000',
		alwaysOnTop: true,
		skipTaskbar: true,
		icon: appIconPath(),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: join(currentDir, '../preload/index.cjs'),
		},
	})
	window.on('close', (event) => {
		if (!isQuitting) {
			event.preventDefault()
			window.hide()
		}
	})
	window.on('closed', () => {
		if (pollWindow === window) {
			pollWindow = null
		}
	})
	return window
}

const createRecentEmailsWindow = (): BrowserWindow => {
	const window = new BrowserWindow({
		width: 800,
		height: 800,
		minWidth: 600,
		minHeight: 500,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: '#00000000',
		titleBarStyle: 'hidden',
		icon: appIconPath(),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: join(currentDir, '../preload/index.cjs'),
		},
	})
	window.on('close', (event) => {
		if (!isQuitting) {
			event.preventDefault()
			window.hide()
		}
	})
	window.on('closed', () => {
		if (recentEmailsWindow === window) {
			recentEmailsWindow = null
		}
	})
	return window
}

const openSettingsWindow = (): void => {
	if (!settingsWindow) {
		settingsWindow = createSettingsWindow()
		void loadRendererView(settingsWindow, 'settings')
	}
	settingsWindow.show()
	settingsWindow.focus()
}

const toPollStartPayload = (account: Account): PollStartPayload => ({
	accountId: account.id,
	email: account.email,
	provider: account.provider,
})

const openPollWindow = (account: Account): void => {
	if (!pollWindow) {
		pollWindow = createPollWindow()
	}
	const payload = toPollStartPayload(account)
	void loadRendererView(pollWindow, 'poll', payload).then(() => {
		pollWindow?.show()
		pollWindow?.focus()
		pollWindow?.webContents.send('poll:startAccount', payload)
	})
}

app.whenReady().then(() => {
	process.on('uncaughtException', (error: Error) => {
		console.error('Uncaught exception in main process:', error.message)
	})

	void loadGoogleOAuthConfig().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : 'Unknown Google config error'
		console.error('Failed to validate Google OAuth config at startup:', message)
	})

	Menu.setApplicationMenu(buildAppMenu())

	tray = new TrayController({
		getRecentOtps: () => otpPollService.getHistory(),
		copyOtp: (id) => otpPollService.copyOtp(id),
		getAccounts: () => accountManager.listAccounts(),
		onOpenSettings: openSettingsWindow,
		onPollAccount: openPollWindow,
		onQuit: () => {
			isQuitting = true
			app.quit()
		},
	})

	settingsWindow = createSettingsWindow()
	void loadRendererView(settingsWindow, 'settings')

	setOnOpenSettings(openSettingsWindow)
	
	const openRecentEmailsWindow = (): void => {
		if (!recentEmailsWindow) {
			recentEmailsWindow = createRecentEmailsWindow()
			void loadRendererView(recentEmailsWindow, 'recent-emails')
		}
		recentEmailsWindow.show()
		recentEmailsWindow.focus()
	}
	setOnOpenRecentEmails(openRecentEmailsWindow)

	const settings = getOtpSettings()
	setAutoLaunch(settings.launchOnStartup)

	app.on('activate', () => {
		openSettingsWindow()
	})
})

app.on('before-quit', () => {
	isQuitting = true
})

app.on('window-all-closed', () => {})
