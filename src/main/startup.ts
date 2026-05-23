import { app } from 'electron'

/**
 * Sets OS login-item startup behavior.
 * @param enabled Whether app should launch at login.
 * @returns Void.
 */
export function setAutoLaunch(enabled: boolean): void {
	app.setLoginItemSettings({
		openAtLogin: enabled,
		openAsHidden: true,
	})
}
