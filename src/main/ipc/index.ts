import { ipcMain } from 'electron'
import type { IpcApi, IpcResult } from '../../shared/ipc-api.js'
import { accountManager } from '../accounts/account-manager.js'
import type { Account, Provider } from '../../shared/models.js'
import {
	deleteGoogleOAuthConfig,
	hasValidGoogleOAuthConfig,
	saveGoogleOAuthConfig,
} from '../oauth/google-config.js'
import { cancelActiveOAuthFlow } from '../oauth/oauth-handler.js'

const notImplemented = (): IpcResult<never> => ({
	success: false,
	error: 'Not implemented',
})

const formatError = (error: unknown): IpcResult<never> => {
	const message = error instanceof Error ? error.message : 'Unknown error'
	return {
		success: false,
		error: message,
	}
}

const isProvider = (value: unknown): value is Provider => value === 'gmail' || value === 'outlook'

const isGoogleOAuthConfigInput = (
	value: unknown
): value is { clientId: string; clientSecret: string; projectId?: string } => {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const record = value as Record<string, unknown>
	return (
		typeof record.clientId === 'string' &&
		record.clientId.trim().length > 0 &&
		typeof record.clientSecret === 'string' &&
		record.clientSecret.trim().length > 0 &&
		(record.projectId === undefined || typeof record.projectId === 'string')
	)
}

const registerIpcHandlers = (): void => {
	ipcMain.handle(
		'oauth:getGoogleConfigStatus',
		async (): Promise<IpcResult<{ configured: boolean }>> => {
			try {
				return {
					success: true,
					data: {
						configured: hasValidGoogleOAuthConfig(),
					},
				}
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'oauth:saveGoogleConfig',
		async (
			_event,
			config: unknown
		): Promise<IpcResult<{ path: string }>> => {
			try {
				if (!isGoogleOAuthConfigInput(config)) {
					throw new Error('Invalid Google OAuth config payload')
				}
				const result = await saveGoogleOAuthConfig({
					client_id: config.clientId.trim(),
					client_secret: config.clientSecret.trim(),
					project_id: config.projectId?.trim() || undefined,
				})
				return {
					success: true,
					data: result,
				}
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'oauth:deleteGoogleConfig',
		async (): Promise<IpcResult<{ deleted: boolean }>> => {
			try {
				return {
					success: true,
					data: {
						deleted: await deleteGoogleOAuthConfig(),
					},
				}
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'oauth:cancelFlow',
		async (): Promise<IpcResult<{ canceled: boolean }>> => {
			try {
				return {
					success: true,
					data: {
						canceled: await cancelActiveOAuthFlow(),
					},
				}
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle('accounts:add', async (_event, provider: unknown): Promise<IpcResult<Account>> => {
		try {
			if (!isProvider(provider)) {
				throw new Error('Invalid provider for accounts:add')
			}
			const account = await accountManager.addAccount(provider)
			return {
				success: true,
				data: account,
			}
		} catch (error) {
			return formatError(error)
		}
	})

	ipcMain.handle('accounts:list', async (): Promise<IpcResult<Account[]>> => {
		try {
			return {
				success: true,
				data: [...accountManager.listAccounts()],
			}
		} catch (error) {
			return formatError(error)
		}
	})

	ipcMain.handle(
		'accounts:remove',
		async (_event, accountId: unknown): Promise<IpcResult<void>> => {
			try {
				if (typeof accountId !== 'string' || accountId.length === 0) {
					throw new Error('Invalid accountId for accounts:remove')
				}
				await accountManager.removeAccount(accountId)
				return { success: true }
			} catch (error) {
				return formatError(error)
			}
		}
	)

	const unimplementedChannels: readonly (keyof IpcApi)[] = [
		'mail:listMessages',
		'mail:getMessage',
		'mail:getThread',
		'mail:listLabels',
		'mail:listFolders',
		'mail:sendMessage',
		'mail:replyToMessage',
		'mail:trashMessage',
		'mail:toggleRead',
		'mail:toggleStar',
	]

	unimplementedChannels.forEach((channel) => {
		ipcMain.handle(channel, async () => {
			try {
				return notImplemented()
			} catch (error) {
				return formatError(error)
			}
		})
	})
}

registerIpcHandlers()
