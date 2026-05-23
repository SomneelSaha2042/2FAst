import { app, BrowserWindow, Menu } from 'electron'
import Store from 'electron-store'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { setMainWindowForIpc, setOtpPollService } from './ipc/index.js'
import { loadGoogleOAuthConfig } from './oauth/google-config.js'
import { OtpPollService } from './otp/poll-service.js'
import { TrayController } from './tray.js'
import { buildAppMenu } from './menu.js'
import { initAutoUpdater } from './updater.js'
import { getOtpSettings } from './otp/settings.js'
import { setAutoLaunch } from './startup.js'
import { accountManager } from './accounts/account-manager.js'

interface WindowState {
	x: number
	y: number
	width: number
	height: number
}
interface WindowStoreShape {
	windowState: WindowState
}
interface StoreApi<T> {
	get: <K extends keyof T>(key: K) => T[K]
	set: <K extends keyof T>(key: K, value: T[K]) => void
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const windowStore = new Store<WindowStoreShape>({ name: 'window-state', defaults: { windowState: { x: 120, y: 120, width: 360, height: 480 } } })
const windowStoreApi = windowStore as unknown as StoreApi<WindowStoreShape>

let mainWindow: BrowserWindow | null = null
let tray: TrayController | null = null
let isQuitting = false
let isPollPaused = false
let lastPollAt: string | null = null

const otpPollService = new OtpPollService({
	onOtpDetected: (otp) => {
		mainWindow?.webContents.send('otp:detected', otp)
		tray?.onOtpDetected()
	},
	onOtpExpired: (otpId) => {
		mainWindow?.webContents.send('otp:expired', otpId)
		tray?.refreshMenu()
	},
	onPollStatus: (status) => {
		lastPollAt = status.lastPollTime ?? null
		mainWindow?.webContents.send('poll:status', status)
		tray?.refreshMenu()
	},
})

setOtpPollService(otpPollService)

const createMainWindow = (): BrowserWindow => {
	const state = windowStoreApi.get('windowState')
	const window = new BrowserWindow({
		x: state.x,
		y: state.y,
		width: state.width,
		height: state.height,
		minWidth: 360,
		minHeight: 480,
		show: false,
		frame: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: join(currentDir, '../preload/index.js'),
		},
	})

	setMainWindowForIpc(window)

	window.on('close', (event) => {
		if (!isQuitting) {
			event.preventDefault()
			window.hide()
		}
	})
	window.on('blur', () => {
		if (window.isVisible()) {
			window.hide()
		}
	})
	window.on('moved', () => {
		const bounds = window.getBounds()
		windowStoreApi.set('windowState', { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
	})
	window.on('resized', () => {
		const bounds = window.getBounds()
		windowStoreApi.set('windowState', { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
	})

	const devServerUrl = process.env.VITE_DEV_SERVER_URL
	if (devServerUrl) void window.loadURL(devServerUrl)
	else void window.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'))

	return window
}

const toggleMainWindow = (): void => {
	if (!mainWindow) return
	if (mainWindow.isVisible()) {
		mainWindow.hide()
		return
	}
	mainWindow.show()
	mainWindow.focus()
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
	mainWindow = createMainWindow()

	tray = new TrayController({
		getRecentOtps: () => otpPollService.getHistory(),
		copyOtp: (id) => otpPollService.copyOtp(id),
		getAccounts: () => accountManager.listAccounts(),
		getLastPollLabel: () => (lastPollAt ? `${Math.max(1, Math.floor((Date.now() - new Date(lastPollAt).getTime()) / 1000))}s ago` : 'never'),
		isPaused: () => isPollPaused,
		onTogglePause: () => {
			if (isPollPaused) {
				otpPollService.resume()
				isPollPaused = false
			} else {
				otpPollService.pause()
				isPollPaused = true
			}
		},
		onOpenSettings: () => {
			mainWindow?.show(); mainWindow?.focus(); mainWindow?.webContents.send('poll:status', { accountId: 'settings', active: !isPollPaused, lastPollTime: new Date().toISOString() })
		},
		onQuit: () => {
			isQuitting = true
			app.quit()
		},
		onToggleWindow: toggleMainWindow,
	})

	const settings = getOtpSettings()
	setAutoLaunch(settings.launchOnStartup)
	void initAutoUpdater()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			mainWindow = createMainWindow()
		}
	})
})

app.on('before-quit', () => {
	isQuitting = true
})

app.on('window-all-closed', () => {})
