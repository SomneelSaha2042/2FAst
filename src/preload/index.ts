import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '../shared/ipc-api'

const api: { [K in keyof IpcApi]: IpcApi[K] } = {
	'accounts:list': () => ipcRenderer.invoke('accounts:list'),
	'accounts:add': (provider) => ipcRenderer.invoke('accounts:add', provider),
	'accounts:remove': (accountId) => ipcRenderer.invoke('accounts:remove', accountId),
	'mail:listMessages': (accountId, options) =>
		ipcRenderer.invoke('mail:listMessages', accountId, options),
	'mail:getMessage': (accountId, messageId) =>
		ipcRenderer.invoke('mail:getMessage', accountId, messageId),
	'mail:getThread': (accountId, threadId) => ipcRenderer.invoke('mail:getThread', accountId, threadId),
	'mail:listLabels': (accountId) => ipcRenderer.invoke('mail:listLabels', accountId),
	'mail:listFolders': (accountId) => ipcRenderer.invoke('mail:listFolders', accountId),
	'mail:sendMessage': (accountId, draft) =>
		ipcRenderer.invoke('mail:sendMessage', accountId, draft),
	'mail:replyToMessage': (accountId, messageId, body) =>
		ipcRenderer.invoke('mail:replyToMessage', accountId, messageId, body),
	'mail:trashMessage': (accountId, messageId) =>
		ipcRenderer.invoke('mail:trashMessage', accountId, messageId),
	'mail:toggleRead': (accountId, messageId, isRead) =>
		ipcRenderer.invoke('mail:toggleRead', accountId, messageId, isRead),
	'mail:toggleStar': (accountId, messageId, isStarred) =>
		ipcRenderer.invoke('mail:toggleStar', accountId, messageId, isStarred),
}

contextBridge.exposeInMainWorld('api', api)
