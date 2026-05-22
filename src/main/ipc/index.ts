import { ipcMain } from 'electron'
import type { IpcApi, IpcResult } from '../../shared/ipc-api.js'

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

const registerHandler = <T extends keyof IpcApi>(channel: T): void => {
  ipcMain.handle(channel, async () => {
    try {
      return notImplemented()
    } catch (error) {
      return formatError(error)
    }
  })
}

const IPC_CHANNELS = [
  'accounts:list',
  'accounts:add',
  'accounts:remove',
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
] as const satisfies readonly (keyof IpcApi)[]

const registerIpcHandlers = (): void => {
  IPC_CHANNELS.forEach((channel) => {
    registerHandler(channel)
  })
}

registerIpcHandlers()
