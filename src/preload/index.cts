import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, PollStartPayload, PollStatus, StoredOtp } from '../shared/ipc-api'

interface EventApi {
	onOtpDetected: (listener: (otp: StoredOtp) => void) => () => void
	onOtpExpired: (listener: (otpId: string) => void) => () => void
	onPollStatus: (listener: (status: PollStatus) => void) => () => void
	onStartAccountPoll: (listener: (payload: PollStartPayload) => void) => () => void
}

const api: { [K in keyof IpcApi]: IpcApi[K] } = {
	'oauth:getGoogleConfigStatus': () => ipcRenderer.invoke('oauth:getGoogleConfigStatus'),
	'oauth:saveGoogleConfig': (config) => ipcRenderer.invoke('oauth:saveGoogleConfig', config),
	'oauth:deleteGoogleConfig': () => ipcRenderer.invoke('oauth:deleteGoogleConfig'),
	'oauth:cancelFlow': () => ipcRenderer.invoke('oauth:cancelFlow'),
	'providers:list': () => ipcRenderer.invoke('providers:list'),
	'accounts:list': () => ipcRenderer.invoke('accounts:list'),
	'accounts:add': (request) => ipcRenderer.invoke('accounts:add', request),
	'accounts:reconnect': (accountId, request) => ipcRenderer.invoke('accounts:reconnect', accountId, request),
	'accounts:remove': (accountId) => ipcRenderer.invoke('accounts:remove', accountId),
	'mail:listMessages': (accountId, options) => ipcRenderer.invoke('mail:listMessages', accountId, options),
	'mail:getMessage': (accountId, messageId) => ipcRenderer.invoke('mail:getMessage', accountId, messageId),
	'mail:getThread': (accountId, threadId) => ipcRenderer.invoke('mail:getThread', accountId, threadId),
	'mail:listLabels': (accountId) => ipcRenderer.invoke('mail:listLabels', accountId),
	'mail:listFolders': (accountId) => ipcRenderer.invoke('mail:listFolders', accountId),
	'mail:sendMessage': (accountId, draft) => ipcRenderer.invoke('mail:sendMessage', accountId, draft),
	'mail:replyToMessage': (accountId, messageId, body) => ipcRenderer.invoke('mail:replyToMessage', accountId, messageId, body),
	'mail:trashMessage': (accountId, messageId) => ipcRenderer.invoke('mail:trashMessage', accountId, messageId),
	'mail:toggleRead': (accountId, messageId, isRead) => ipcRenderer.invoke('mail:toggleRead', accountId, messageId, isRead),
	'mail:toggleStar': (accountId, messageId, isStarred) => ipcRenderer.invoke('mail:toggleStar', accountId, messageId, isStarred),
	'otp:copy': (otpId) => ipcRenderer.invoke('otp:copy', otpId),
	'otp:getHistory': () => ipcRenderer.invoke('otp:getHistory'),
	'otp:clearHistory': () => ipcRenderer.invoke('otp:clearHistory'),
	'otp:getRecentParsedMessages': () => ipcRenderer.invoke('otp:getRecentParsedMessages'),
	'poll:pause': () => ipcRenderer.invoke('poll:pause'),
	'poll:resume': () => ipcRenderer.invoke('poll:resume'),
	'poll:setInterval': (ms) => ipcRenderer.invoke('poll:setInterval', ms),
	'poll:checkAccount': (accountId) => ipcRenderer.invoke('poll:checkAccount', accountId),
	'poll:scanAccount': (accountId) => ipcRenderer.invoke('poll:scanAccount', accountId),
	'settings:get': () => ipcRenderer.invoke('settings:get'),
	'settings:update': (settings) => ipcRenderer.invoke('settings:update', settings),
	'window:hide': () => ipcRenderer.invoke('window:hide'),
	'window:minimize': () => ipcRenderer.invoke('window:minimize'),
	'window:openSettings': () => ipcRenderer.invoke('window:openSettings'),
	'window:openRecentEmails': () => ipcRenderer.invoke('window:openRecentEmails'),
}

const events: EventApi = {
	onOtpDetected: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, otp: StoredOtp) => listener(otp)
		ipcRenderer.on('otp:detected', wrapped)
		return () => ipcRenderer.removeListener('otp:detected', wrapped)
	},
	onOtpExpired: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, otpId: string) => listener(otpId)
		ipcRenderer.on('otp:expired', wrapped)
		return () => ipcRenderer.removeListener('otp:expired', wrapped)
	},
	onPollStatus: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, status: PollStatus) => listener(status)
		ipcRenderer.on('poll:status', wrapped)
		return () => ipcRenderer.removeListener('poll:status', wrapped)
	},
	onStartAccountPoll: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, payload: PollStartPayload) => listener(payload)
		ipcRenderer.on('poll:startAccount', wrapped)
		return () => ipcRenderer.removeListener('poll:startAccount', wrapped)
	},
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('events', events)
