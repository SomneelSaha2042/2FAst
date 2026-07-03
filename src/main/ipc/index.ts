import { BrowserWindow, ipcMain } from 'electron'
import type { IpcApi, IpcResult, OtpSettings } from '../../shared/ipc-api.js'
import { accountManager } from '../accounts/account-manager.js'
import type { Account, ProviderCapabilities, ProviderDescriptor } from '../../shared/models.js'
import { PROVIDER_REGISTRY, getProviderDescriptor } from '../../shared/provider-registry.js'
import { deleteGoogleOAuthConfig, saveGoogleOAuthConfig, loadGoogleOAuthConfig } from '../oauth/google-config.js'
import { cancelActiveOAuthFlow } from '../oauth/oauth-handler.js'
import { cancelActiveMicrosoftOAuthFlow } from '../oauth/microsoft-auth.js'
import type { OtpPollService } from '../otp/poll-service.js'
import { getOtpSettings, updateOtpSettings } from '../otp/settings.js'
import { setAutoLaunch } from '../startup.js'
import { isAccountAddRequest, isImapReconnectRequest } from './validators.js'

const notImplemented = (): IpcResult<never> => ({ success: false, error: 'Not implemented' })
const formatError = (error: unknown): IpcResult<never> => {
	console.error('[IPC ERROR]:', error)
	return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
}
const unsupportedOrNotImplemented = (accountId: unknown, capability: keyof ProviderCapabilities): IpcResult<never> => {
	if (typeof accountId !== 'string' || accountId.length === 0) return formatError(new Error('Invalid accountId for mail operation'))
	const account = accountManager.getAccount(accountId)
	if (!account) return formatError(new Error(`Account not found: ${accountId}`))
	const descriptor = getProviderDescriptor(account.provider)
	if (!descriptor?.capabilities[capability]) return formatError(new Error(`Provider ${account.provider} does not support ${capability}`))
	return notImplemented()
}

const isListMessagesOptions = (value: unknown): value is { labelId?: string; folderId?: string; query?: string; searchText?: string; receivedAfter?: string; pageToken?: string; maxResults?: number } => {
	if (value === undefined) return true
	if (typeof value !== 'object' || value === null) return false
	const record = value as Record<string, unknown>
	return (
		(record.labelId === undefined || typeof record.labelId === 'string') &&
		(record.folderId === undefined || typeof record.folderId === 'string') &&
		(record.query === undefined || typeof record.query === 'string') &&
		(record.searchText === undefined || typeof record.searchText === 'string') &&
		(record.receivedAfter === undefined || typeof record.receivedAfter === 'string') &&
		(record.pageToken === undefined || typeof record.pageToken === 'string') &&
		(record.maxResults === undefined || (typeof record.maxResults === 'number' && Number.isInteger(record.maxResults) && record.maxResults > 0))
	)
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
let mainWindow: BrowserWindow | null = null

/**
 * Injects the OTP poll service for IPC handlers.
 * @param service Poll service instance.
 * @returns Void.
 */
export const setOtpPollService = (service: OtpPollService): void => {
	otpPollService = service
}

/**
 * Injects the main window for window control handlers.
 * @param window Browser window instance.
 * @returns Void.
 */
export const setMainWindowForIpc = (window: BrowserWindow): void => {
	mainWindow = window
}

let onOpenSettingsCallback: (() => void) | null = null

/**
 * Injects the open settings window callback.
 * @param callback Callback function.
 * @returns Void.
 */
export const setOnOpenSettings = (callback: () => void): void => {
	onOpenSettingsCallback = callback
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

	ipcMain.handle('mail:listMessages', async (_event, accountId: unknown, options: unknown): Promise<IpcResult<unknown>> => {
		try {
			if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for mail:listMessages')
			if (!isListMessagesOptions(options)) throw new Error('Invalid options for mail:listMessages')
			const provider = await accountManager.getProvider(accountId)
			return { success: true, data: await provider.listMessages(options) }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('mail:getMessage', async (_event, accountId: unknown, messageId: unknown): Promise<IpcResult<unknown>> => {
		try {
			if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for mail:getMessage')
			if (typeof messageId !== 'string' || messageId.length === 0) throw new Error('Invalid messageId for mail:getMessage')
			const provider = await accountManager.getProvider(accountId)
			return { success: true, data: await provider.getMessage(messageId) }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('mail:getThread', async (_event, accountId: unknown, threadId: unknown): Promise<IpcResult<unknown>> => {
		try {
			if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for mail:getThread')
			if (typeof threadId !== 'string' || threadId.length === 0) throw new Error('Invalid threadId for mail:getThread')
			const provider = await accountManager.getProvider(accountId)
			if (!provider.getThread) throw new Error(`Provider ${provider.provider} does not support threads`)
			return { success: true, data: await provider.getThread(threadId) }
		} catch (error) { return formatError(error) }
	})
	ipcMain.handle('mail:listLabels', async (_event, accountId: unknown): Promise<IpcResult<unknown>> => {
		try { if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for mail:listLabels'); const provider = await accountManager.getProvider(accountId); return { success: true, data: await provider.listLabels() } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('mail:listFolders', async (_event, accountId: unknown): Promise<IpcResult<unknown>> => {
		try { if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Invalid accountId for mail:listFolders'); const provider = await accountManager.getProvider(accountId); return { success: true, data: await provider.listFolders() } } catch (error) { return formatError(error) }
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
		try { (BrowserWindow.fromWebContents(event.sender) ?? mainWindow)?.hide(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('window:minimize', async (event): Promise<IpcResult<void>> => {
		try { (BrowserWindow.fromWebContents(event.sender) ?? mainWindow)?.minimize(); return { success: true } } catch (error) { return formatError(error) }
	})
	ipcMain.handle('window:openSettings', async (): Promise<IpcResult<void>> => {
		try {
			if (onOpenSettingsCallback) {
				onOpenSettingsCallback()
			}
			return { success: true }
		} catch (error) { return formatError(error) }
	})

	const unimplementedChannels: readonly { readonly channel: keyof IpcApi; readonly capability: keyof ProviderCapabilities }[] = [
		{ channel: 'mail:sendMessage', capability: 'send' },
		{ channel: 'mail:replyToMessage', capability: 'send' },
		{ channel: 'mail:trashMessage', capability: 'mutations' },
		{ channel: 'mail:toggleRead', capability: 'mutations' },
		{ channel: 'mail:toggleStar', capability: 'mutations' },
	]
	unimplementedChannels.forEach(({ channel, capability }) => {
		ipcMain.handle(channel, async (_event, accountId: unknown) => {
			try { return unsupportedOrNotImplemented(accountId, capability) } catch (error) { return formatError(error) }
		})
	})
}

registerIpcHandlers()
