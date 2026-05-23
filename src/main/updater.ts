/**
 * Initializes auto-update checks.
 * @returns Promise that resolves when updater is initialized.
 */
export async function initAutoUpdater(): Promise<void> {
	try {
		const module = await import('electron-updater')
		const autoUpdater = module.autoUpdater
		autoUpdater.autoDownload = true
		autoUpdater.autoInstallOnAppQuit = true
		void autoUpdater.checkForUpdatesAndNotify()
	} catch {
		// Updater package may be unavailable in dev/local environments.
	}
}
