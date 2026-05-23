import type {
	Account,
	Label,
	MailFolder,
	Message,
	MessageAddress,
	Provider,
	Thread,
} from './models'

export interface IpcResult<T> {
	success: boolean
	data?: T
	error?: string
}

export interface File {
	readonly name: string
	readonly size: number
	readonly type: string
}

export interface DraftMessage {
	to: MessageAddress[]
	cc?: MessageAddress[]
	bcc?: MessageAddress[]
	subject: string
	bodyHtml?: string
	bodyText?: string
	attachments?: File[]
}

export interface GoogleOAuthConfigInput {
	readonly clientId: string
	readonly clientSecret: string
	readonly projectId?: string
}

export interface OtpSource {
	readonly messageId: string
	readonly accountId: string
	readonly subject: string
	readonly sender: string
	readonly receivedAt: string
}

export interface OtpResult {
	readonly code: string
	readonly type: 'numeric' | 'alphanumeric' | 'url'
	readonly confidence: 'high' | 'medium' | 'low'
	readonly source: OtpSource
}

export interface StoredOtp extends OtpResult {
	readonly id: string
	readonly detectedAt: string
	readonly copiedCount: number
	readonly expired: boolean
}

export interface PollStatus {
	readonly accountId: string
	readonly active: boolean
	readonly lastPollTime?: string
}

export interface OtpSettings {
	readonly pollIntervalMs: number
	readonly otpTtlMinutes: number
	readonly autoCopyToClipboard: boolean
	readonly showNotifications: boolean
	readonly soundEnabled: boolean
	readonly launchOnStartup: boolean
	readonly filterSenders?: readonly string[]
}

export interface IpcApi {
	'oauth:getGoogleConfigStatus': () => Promise<IpcResult<{ configured: boolean }>>
	'oauth:saveGoogleConfig': (
		config: GoogleOAuthConfigInput
	) => Promise<IpcResult<{ path: string }>>
	'oauth:deleteGoogleConfig': () => Promise<IpcResult<{ deleted: boolean }>>
	'oauth:cancelFlow': () => Promise<IpcResult<{ canceled: boolean }>>
	'accounts:list': () => Promise<IpcResult<Account[]>>
	'accounts:add': (provider: Provider) => Promise<IpcResult<Account>>
	'accounts:remove': (accountId: string) => Promise<IpcResult<void>>
	'mail:listMessages': (
		accountId: string,
		options?: {
			labelId?: string
			folderId?: string
			query?: string
			searchText?: string
			receivedAfter?: string
			pageToken?: string
			maxResults?: number
		}
	) => Promise<IpcResult<{ messages: Message[]; nextPageToken?: string }>>
	'mail:getMessage': (accountId: string, messageId: string) => Promise<IpcResult<Message>>
	'mail:getThread': (accountId: string, threadId: string) => Promise<IpcResult<Thread>>
	'mail:listLabels': (accountId: string) => Promise<IpcResult<Label[]>>
	'mail:listFolders': (accountId: string) => Promise<IpcResult<MailFolder[]>>
	'mail:sendMessage': (accountId: string, draft: DraftMessage) => Promise<IpcResult<Message>>
	'mail:replyToMessage': (
		accountId: string,
		messageId: string,
		body: string
	) => Promise<IpcResult<Message>>
	'mail:trashMessage': (accountId: string, messageId: string) => Promise<IpcResult<void>>
	'mail:toggleRead': (
		accountId: string,
		messageId: string,
		isRead: boolean
	) => Promise<IpcResult<void>>
	'mail:toggleStar': (
		accountId: string,
		messageId: string,
		isStarred: boolean
	) => Promise<IpcResult<void>>
	'otp:copy': (otpId: string) => Promise<IpcResult<{ code: string | null }>>
	'otp:getHistory': () => Promise<IpcResult<StoredOtp[]>>
	'otp:clearHistory': () => Promise<IpcResult<void>>
	'poll:pause': () => Promise<IpcResult<void>>
	'poll:resume': () => Promise<IpcResult<void>>
	'poll:setInterval': (ms: number) => Promise<IpcResult<void>>
	'poll:checkAccount': (accountId: string) => Promise<IpcResult<void>>
	'settings:get': () => Promise<IpcResult<OtpSettings>>
	'settings:update': (settings: Partial<OtpSettings>) => Promise<IpcResult<OtpSettings>>
	'window:hide': () => Promise<IpcResult<void>>
	'window:minimize': () => Promise<IpcResult<void>>
}

export const IPC_CHANNELS = [
	'oauth:getGoogleConfigStatus',
	'oauth:saveGoogleConfig',
	'oauth:deleteGoogleConfig',
	'oauth:cancelFlow',
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
	'otp:copy',
	'otp:getHistory',
	'otp:clearHistory',
	'poll:pause',
	'poll:resume',
	'poll:setInterval',
	'poll:checkAccount',
	'settings:get',
	'settings:update',
	'window:hide',
	'window:minimize',
] as const satisfies readonly (keyof IpcApi)[]
