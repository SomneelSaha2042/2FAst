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
import { cancelActiveMicrosoftOAuthFlow } from '../oauth/microsoft-auth.js'

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

const isListMessagesOptions = (
	value: unknown
): value is {
	labelId?: string
	folderId?: string
	query?: string
	pageToken?: string
	maxResults?: number
} => {
	if (value === undefined) {
		return true
	}
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const record = value as Record<string, unknown>
	return (
		(record.labelId === undefined || typeof record.labelId === 'string') &&
		(record.folderId === undefined || typeof record.folderId === 'string') &&
		(record.query === undefined || typeof record.query === 'string') &&
		(record.pageToken === undefined || typeof record.pageToken === 'string') &&
		(record.maxResults === undefined ||
			(typeof record.maxResults === 'number' &&
				Number.isInteger(record.maxResults) &&
				record.maxResults > 0))
	)
}

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
				const canceledGoogle = await cancelActiveOAuthFlow()
				const canceledMicrosoft = await cancelActiveMicrosoftOAuthFlow()
				return {
					success: true,
					data: {
						canceled: canceledGoogle || canceledMicrosoft,
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

	ipcMain.handle(
		'mail:listMessages',
		async (_event, accountId: unknown, options: unknown): Promise<IpcResult<unknown>> => {
			try {
				if (typeof accountId !== 'string' || accountId.length === 0) {
					throw new Error('Invalid accountId for mail:listMessages')
				}
				if (!isListMessagesOptions(options)) {
					throw new Error('Invalid options for mail:listMessages')
				}
				const provider = await accountManager.getProvider(accountId)
				const data = await provider.listMessages(options)
				return { success: true, data }
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'mail:getMessage',
		async (_event, accountId: unknown, messageId: unknown): Promise<IpcResult<unknown>> => {
			try {
				if (typeof accountId !== 'string' || accountId.length === 0) {
					throw new Error('Invalid accountId for mail:getMessage')
				}
				if (typeof messageId !== 'string' || messageId.length === 0) {
					throw new Error('Invalid messageId for mail:getMessage')
				}
				const provider = await accountManager.getProvider(accountId)
				const data = await provider.getMessage(messageId)
				return { success: true, data }
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'mail:getThread',
		async (_event, accountId: unknown, threadId: unknown): Promise<IpcResult<unknown>> => {
			try {
				if (typeof accountId !== 'string' || accountId.length === 0) {
					throw new Error('Invalid accountId for mail:getThread')
				}
				if (typeof threadId !== 'string' || threadId.length === 0) {
					throw new Error('Invalid threadId for mail:getThread')
				}
				const provider = await accountManager.getProvider(accountId)
				const data = await provider.getThread(threadId)
				return { success: true, data }
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'mail:listLabels',
		async (_event, accountId: unknown): Promise<IpcResult<unknown>> => {
			try {
				if (typeof accountId !== 'string' || accountId.length === 0) {
					throw new Error('Invalid accountId for mail:listLabels')
				}
				const provider = await accountManager.getProvider(accountId)
				const data = await provider.listLabels()
				return { success: true, data }
			} catch (error) {
				return formatError(error)
			}
		}
	)

	ipcMain.handle(
		'mail:listFolders',
		async (_event, accountId: unknown): Promise<IpcResult<unknown>> => {
			try {
				if (typeof accountId !== 'string' || accountId.length === 0) {
					throw new Error('Invalid accountId for mail:listFolders')
				}
				const provider = await accountManager.getProvider(accountId)
				const data = await provider.listFolders()
				return { success: true, data }
			} catch (error) {
				return formatError(error)
			}
		}
	)

	const unimplementedChannels: readonly (keyof IpcApi)[] = [
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
