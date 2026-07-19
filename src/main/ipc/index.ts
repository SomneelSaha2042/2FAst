import { BrowserWindow, ipcMain } from 'electron'
import type { IpcResult, OtpSettings } from '../../shared/ipc-api.js'
import { accountManager } from '../accounts/account-manager.js'
import type { Account, ProviderDescriptor } from '../../shared/models.js'
import { PROVIDER_REGISTRY } from '../../shared/provider-registry.js'
import { deleteGoogleOAuthConfig, saveGoogleOAuthConfig, loadGoogleOAuthConfig } from '../oauth/google-config.js'
import { cancelActiveOAuthFlow } from '../oauth/oauth-handler.js'
import { cancelActiveMicrosoftOAuthFlow } from '../oauth/microsoft-auth.js'
import type { OtpPollService } from '../otp/poll-service.js'
import { getOtpSettings, updateOtpSettings } from '../otp/settings.js'
import { setAutoLaunch } from '../startup.js'
import { isAccountAddRequest, isImapReconnectRequest } from './validators.js'

const formatError = (error: unknown): IpcResult<never> => {
	console.error('[IPC ERROR]:', error)
	return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
}


const isGoogleOAuthConfigInput = (value: unknown): value is { gmailEmail: string; clientId: string; clientSecret: string; projectId?: string } => {
	if (typeof value !== 'object' || value === null) return false
	const record = value as Record<string, unknown>
	return (
		typeof record.gmailEmail === 'string' && record.gmailEmail.trim().length > 0 &&
		typeof record.clientId === 'string' && record.clientId.trim().length > 0 &&
		typeof record.clientSecret === 'string' && record.clientSecret.trim().length > 0 &&
		(record.projectId === undefined || typeof record.projectId === 'string')
	)
}

let otpPollService: OtpPollService | null = null

/**
 * Injects the OTP poll service for IPC handlers.
 * @param service Poll service instance.
 * @returns Void.
 */
export const setOtpPollService = (service: OtpPollService): void => {
	otpPollService = service
}

let onOpenSettingsCallback: (() => void) | null = null
let onOpenRecentEmailsCallback: ((accountId?: string) => void) | null = null
let onCloseRecentEmailsCallback: (() => void) | null = null

/**
 * Injects the open settings window callback.
 * @param callback Callback function.
 * @returns Void.
 */
export const setOnOpenSettings = (callback: () => void): void => {
	onOpenSettingsCallback = callback
}

/**
 * Injects the open recent emails window callback.
 * @param callback Callback function.
 * @returns Void.
 */
export const setOnOpenRecentEmails = (callback: (accountId?: string) => void): void => {
	onOpenRecentEmailsCallback = callback
}

/**
 * Injects the close recent emails window callback.
 * @param callback Callback function.
 * @returns Void.
 */
export const setOnCloseRecentEmails = (callback: () => void): void => {
	onCloseRecentEmailsCallback = callback
}

const registerIpcHandlers = (): void => {
	ipcMain.handle('oauth:getGoogleConfigStatus', async (): Promise<IpcResult<{ configured: boolean; email?: string }>> => {
		try {
			const config = await loadGoogleOAuthConfig()
			return { success: true, data: { configured: config !== null, email: config?.email } }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('oauth:saveGoogleConfig', async (_event, config: unknown): Promise<IpcResult<{ path: string }>> => {
		try {
			if (!isGoogleOAuthConfigInput(config)) throw new Error('Invalid Google OAuth config payload')
			const result = await saveGoogleOAuthConfig({
				email: config.gmailEmail.trim().toLowerCase(),
				client_id: config.clientId.trim(),
				client_secret: config.clientSecret.trim(),
				project_id: config.projectId?.trim() || undefined,
			})
			return { success: true, data: result }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('oauth:deleteGoogleConfig', async (): Promise<IpcResult<{ deleted: boolean }>> => {
		try { return { success: true, data: { deleted: await deleteGoogleOAuthConfig() } } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('oauth:cancelFlow', async (): Promise<IpcResult<{ canceled: boolean }>> => {
		try {
			const canceledGoogle = await cancelActiveOAuthFlow()
			const canceledMicrosoft = await cancelActiveMicrosoftOAuthFlow()
			return { success: true, data: { canceled: canceledGoogle || canceledMicrosoft } }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('providers:list', async (): Promise<IpcResult<readonly ProviderDescriptor[]>> => {
		try { return { success: true, data: PROVIDER_REGISTRY } } catch (error) { return formatError(error) }
	})

	ipcMain.handle('accounts:add', async (_event, request: unknown): Promise<IpcResult<Account>> => {
		try { if (!isAccountAddRequest(request)) throw new Error('Invalid request for accounts:add'); return { success: true, data: await accountManager.addAccount(request) } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('accounts:list', async (): Promise<IpcResult<Account[]>> => {
		try { return { success: true, data: [...accountManager.listAccounts()] } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('accounts:reconnect', async (_event, accountId: unknown, request: unknown): Promise<IpcResult<Account>> => {
		try {
			if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for accounts:reconnect')
			if (request !== undefined && !isImapReconnectRequest(request)) throw new Error('Invalid credentials for accounts:reconnect')
			return { success: true, data: await accountManager.reconnectAccount(accountId, request) }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('accounts:remove', async (_event, accountId: unknown): Promise<IpcResult<void>> => {
		try { if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for accounts:remove'); await accountManager.removeAccount(accountId); return { success: true } } catch (error) { return formatError(error) }
	})



	ipcMain.handle('otp:getHistory', async (): Promise<IpcResult<unknown>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); return { success: true, data: otpPollService.getHistory() } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('otp:copy', async (_event, otpId: unknown): Promise<IpcResult<{ code: string | null }>> => {
		try {
			if (!otpPollService) throw new Error('OTP polling service is not initialized')
			if (typeof otpId !== 'string' || otpId.length === 0) throw new Error('Invalid otpId for otp:copy')
			return { success: true, data: { code: otpPollService.copyOtp(otpId) } }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('otp:clearHistory', async (): Promise<IpcResult<void>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); otpPollService.clearHistory(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('otp:getRecentParsedMessages', async (_event, accountId: unknown): Promise<IpcResult<unknown>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); return { success: true, data: otpPollService.getRecentParsedMessages(typeof accountId === 'string' ? accountId : undefined) } } catch (error) { return formatError(error) }
	})

	ipcMain.handle('poll:pause', async (): Promise<IpcResult<void>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); otpPollService.pause(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('poll:resume', async (): Promise<IpcResult<void>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); otpPollService.resume(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('poll:setInterval', async (_event, ms: unknown): Promise<IpcResult<void>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 1000) throw new Error('Invalid ms for poll:setInterval'); otpPollService.setInterval(ms); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('poll:checkAccount', async (_event, accountId: unknown): Promise<IpcResult<void>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for poll:checkAccount'); await otpPollService.pollAccountById(accountId); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('poll:scanAccount', async (_event, accountId: unknown): Promise<IpcResult<unknown>> => {
		try { if (!otpPollService) throw new Error('OTP polling service is not initialized'); if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for poll:scanAccount'); return { success: true, data: await otpPollService.scanAccountById(accountId) } } catch (error) { return formatError(error) }
	})

	ipcMain.handle('settings:get', async (): Promise<IpcResult<OtpSettings>> => {
		try { return { success: true, data: getOtpSettings() } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('settings:update', async (_event, partial: unknown): Promise<IpcResult<OtpSettings>> => {
		try {
			if (typeof partial !== 'object' || partial === null) throw new Error('Invalid settings payload')
			const updated = updateOtpSettings(partial as Partial<OtpSettings>)
			setAutoLaunch(updated.launchOnStartup)
			if (otpPollService) otpPollService.setInterval(updated.pollIntervalMs)
			return { success: true, data: updated }
		} catch (error) { return formatError(error) }
	})

	ipcMain.handle('window:hide', async (event): Promise<IpcResult<void>> => {
		try { BrowserWindow.fromWebContents(event.sender)?.hide(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('window:minimize', async (event): Promise<IpcResult<void>> => {
		try { BrowserWindow.fromWebContents(event.sender)?.minimize(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('window:openSettings', async (): Promise<IpcResult<void>> => {
		try {
			if (onOpenSettingsCallback) {
				onOpenSettingsCallback()
			}
			return { success: true }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('window:openRecentEmails', async (_event, accountId: unknown): Promise<IpcResult<void>> => {
		try {
			if (onOpenRecentEmailsCallback) {
				onOpenRecentEmailsCallback(typeof accountId === 'string' ? accountId : undefined)
			}
			return { success: true }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('window:closeRecentEmails', async (): Promise<IpcResult<void>> => {
		try {
			if (onCloseRecentEmailsCallback) {
				onCloseRecentEmailsCallback()
			}
			return { success: true }
		} catch (error) { return formatError(error) }
	})

}

registerIpcHandlers()
