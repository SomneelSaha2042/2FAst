import Store from 'electron-store'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { accountManager } from '../accounts/account-manager.js'
import type { Account, Message } from '../../shared/models.js'
import { buildOtpSource, extractOtp } from './patterns.js'
import { handleOtpDetected } from './otp-actions.js'
import { OtpStore, type OtpResult, type StoredOtp } from './otp-store.js'
import { getOtpSettings } from './settings.js'

export interface PollServiceConfig {
	readonly intervalMs: number
	readonly lookbackMinutes: number
	readonly maxEmailsPerPoll: number
}

export interface PollStatus {
	readonly accountId: string
	readonly active: boolean
	readonly lastPollTime?: string
}

interface SeenStoreData {
	readonly seenMessageIds: readonly string[]
}
interface StoreApi<T> {
	get: <K extends keyof T>(key: K) => T[K]
	set: <K extends keyof T>(key: K, value: T[K]) => void
}
type LogDirectoryProvider = string | (() => string | undefined)

const DEFAULT_CONFIG: PollServiceConfig = {
	intervalMs: 10_000,
	lookbackMinutes: 5,
	maxEmailsPerPoll: 5,
}
const POLL_LOG_FILE = 'otp-poll.log'

const isPollDebugLoggingEnabled = (): boolean => process.env.TWOFAST_DEBUG_POLL === '1'

const redactPollLogLine = (line: string): string => line.replace(/\bcode=\S+/g, 'code=[redacted]')

export class OtpPollService {
	private readonly otpStore: OtpStore
	private config: PollServiceConfig
	private readonly seenIds: Set<string>
	private seenIdsDirty = false
	private readonly folderCache = new Map<string, string[]>()
	private readonly seenStore: Store<SeenStoreData>
	private readonly seenStoreApi: StoreApi<SeenStoreData>
	private readonly statusByAccountId = new Map<string, PollStatus>()
	private timer: NodeJS.Timeout | null = null
	private paused = false
	private recentParsedMessages: Message[] = []
	private readonly onOtpDetected: (otp: StoredOtp) => void
	private readonly onOtpExpired: (otpId: string) => void
	private readonly onPollStatus: (status: PollStatus) => void
	private readonly onScanStarted: () => void
	private readonly onScanFinished: () => void
	private readonly debugLoggingEnabled: boolean
	private readonly logDirectory?: LogDirectoryProvider

	constructor(options?: {
		readonly config?: Partial<PollServiceConfig>
		readonly onOtpDetected?: (otp: StoredOtp) => void
		readonly onOtpExpired?: (otpId: string) => void
		readonly onPollStatus?: (status: PollStatus) => void
		readonly onScanStarted?: () => void
		readonly onScanFinished?: () => void
		readonly debugLoggingEnabled?: boolean
		readonly logDirectory?: LogDirectoryProvider
	}) {
		const settings = getOtpSettings()
		this.config = {
			...DEFAULT_CONFIG,
			...options?.config,
			intervalMs: options?.config?.intervalMs ?? settings.pollIntervalMs,
		}
		this.otpStore = new OtpStore(settings.otpTtlMinutes)
		this.seenStore = new Store<SeenStoreData>({ name: 'otp-seen', defaults: { seenMessageIds: [] } })
		this.seenStoreApi = this.seenStore as unknown as StoreApi<SeenStoreData>
		this.seenIds = new Set(this.seenStoreApi.get('seenMessageIds'))
		this.onOtpDetected = options?.onOtpDetected ?? (() => {})
		this.onOtpExpired = options?.onOtpExpired ?? (() => {})
		this.onPollStatus = options?.onPollStatus ?? (() => {})
		this.onScanStarted = options?.onScanStarted ?? (() => {})
		this.onScanFinished = options?.onScanFinished ?? (() => {})
		this.debugLoggingEnabled = options?.debugLoggingEnabled ?? isPollDebugLoggingEnabled()
		this.logDirectory = options?.logDirectory
	}

	/**
	 * Starts background polling.
	 * @returns Void.
	 */
	start(): void {
		if (this.timer) {
			return
		}
		void this.pollAllAccounts()
		this.timer = setInterval(() => {
			void this.pollAllAccounts()
		}, this.config.intervalMs)
	}

	/**
	 * Stops background polling.
	 * @returns Void.
	 */
	stop(): void {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
	}

	/**
	 * Pauses polling checks without losing state.
	 * @returns Void.
	 */
	pause(): void {
		this.paused = true
	}

	/**
	 * Resumes polling checks.
	 * @returns Void.
	 */
	resume(): void {
		this.paused = false
	}

	/**
	 * Updates polling interval and resets timer.
	 * @param intervalMs Interval in milliseconds.
	 * @returns Void.
	 */
	setInterval(intervalMs: number): void {
		this.config = { ...this.config, intervalMs }
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = setInterval(() => {
				void this.pollAllAccounts()
			}, this.config.intervalMs)
		}
	}

	/**
	 * Returns recent OTP history.
	 * @returns List of non-expired OTPs.
	 */
	getHistory(): StoredOtp[] {
		return this.otpStore.getRecentOtps()
	}

	/**
	 * Re-copies OTP by history id.
	 * @param id Stored OTP id.
	 * @returns Copied code, or null when not found.
	 */
	copyOtp(id: string): string | null {
		return this.otpStore.copyOtp(id)
	}

	/**
	 * Clears OTP history.
	 * @returns Void.
	 */
	clearHistory(): void {
		this.otpStore.clearHistory()
	}

	/**
	 * Retrieves the last 5 parsed messages.
	 * @returns The recent messages.
	 */
	getRecentParsedMessages(): Message[] {
		return [...this.recentParsedMessages]
	}

	private addRecentParsedMessage(message: Message): void {
		this.recentParsedMessages = this.recentParsedMessages.filter((m) => m.id !== message.id)
		this.recentParsedMessages.push(message)
		this.recentParsedMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		if (this.recentParsedMessages.length > 5) {
			this.recentParsedMessages = this.recentParsedMessages.slice(0, 5)
		}
	}

	/**
	 * Executes one polling cycle for all accounts.
	 * @returns Promise that resolves after cycle completion.
	 */
	async pollAllAccounts(): Promise<void> {
		const expiredIds = this.otpStore.expireOtps()
		for (const otpId of expiredIds) {
			this.onOtpExpired(otpId)
		}
		if (this.paused) {
			return
		}
		const accounts = accountManager.listAccounts()
		if (accounts.length > 0) {
			this.onScanStarted()
			try {
				await Promise.all(accounts.map((account) => this.pollAccount(account)))
			} finally {
				this.onScanFinished()
			}
		}
		this.persistSeenIds()
	}

	/**
	 * Executes one on-demand polling cycle for a specific account.
	 * @param accountId Internal account identifier.
	 * @returns Promise that resolves after polling the account.
	 */
	async pollAccountById(accountId: string): Promise<void> {
		const expiredIds = this.otpStore.expireOtps()
		for (const otpId of expiredIds) {
			this.onOtpExpired(otpId)
		}
		// On-demand checks should re-evaluate the current recent window.
		for (const id of this.seenIds) {
			if (id.startsWith(`${accountId}:`)) {
				this.seenIds.delete(id)
			}
		}
		this.seenIdsDirty = true
		const account = accountManager.getAccount(accountId)
		if (!account) {
			throw new Error(`Account not found: ${accountId}`)
		}
		this.onScanStarted()
		try {
			await this.pollAccount(account, { includeSeen: true })
		} finally {
			this.onScanFinished()
		}
		this.persistSeenIds()
	}

	private async fetchRecentMessages(account: Account, provider: Awaited<ReturnType<typeof accountManager.getProvider>>): Promise<Message[]> {
		let folders: string[] | undefined = undefined
		if (account.provider === 'outlook') {
			folders = ['inbox', 'junkemail', 'deleteditems']
		} else if (account.provider !== 'gmail') {
			let cached = this.folderCache.get(account.id)
			if (!cached) {
				const all = await provider.listFolders()
				cached = all.filter((f) => f.type === 'inbox' || f.type === 'junk' || f.type === 'trash').map((f) => f.id)
				this.folderCache.set(account.id, cached)
			}
			folders = cached.length > 0 ? cached : undefined
		}

		if (!folders) {
			const res = await provider.listMessages({ maxResults: this.config.maxEmailsPerPoll })
			return res.messages
		}

		const combined: Message[] = []
		for (const folderId of folders) {
			try {
				const res = await provider.listMessages({ maxResults: this.config.maxEmailsPerPoll, folderId })
				combined.push(...res.messages)
			} catch (e) {
				console.error(`[POLL ERROR] Folder retrieve failed for ${account.email} folder ${folderId}:`, e)
				await this.writePollLog(`[${new Date().toISOString()}] poll:folder-error accountId=${account.id} folderId=${folderId} error=${e instanceof Error ? e.message : String(e)}`)
			}
		}
		
		combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		const sliced = combined.slice(0, this.config.maxEmailsPerPoll)
		return sliced
	}

	/**
	 * Manually triggers a one-off deep scan of an account to find OTPs.
	 * Bypasses the seen tracking completely.
	 * @param accountId Target account ID.
	 * @returns Array of valid OTPs found.
	 */
	async scanAccountById(accountId: string): Promise<OtpResult[]> {
		const account = accountManager.getAccount(accountId)
		if (!account) throw new Error('Account not found')

		this.onScanStarted()
		try {
			await this.writePollLog(
				`[${new Date().toISOString()}] scan:start accountId=${account.id} email=${account.email} provider=${account.provider}`
			)
			const provider = await accountManager.getProvider(account.id)
			const messages = await this.fetchRecentMessages(account, provider)
			await this.writePollLog(
				`[${new Date().toISOString()}] scan:list accountId=${account.id} count=${messages.length} maxResults=${this.config.maxEmailsPerPoll}`
			)

			const results: OtpResult[] = []
			for (const item of messages) {
				await this.writePollLog(
					`[${new Date().toISOString()}] scan:item accountId=${account.id} messageId=${item.id} date=${item.date} from=${item.from.email} subjectLength=${item.subject.length}`
				)
				let message = await provider.getMessage(item.id)
				if (item.labelIds.length > 0 && message.labelIds.length === 0) {
					message = { ...message, labelIds: item.labelIds }
				}
				const isSent = message.labelIds.includes('SENT') || message.from.email.toLowerCase() === account.email.toLowerCase()
				if (isSent) {
					await this.writePollLog(`[${new Date().toISOString()}] scan:skip-sent accountId=${account.id} messageId=${message.id}`)
					continue
				}
				this.addRecentParsedMessage(message)
				const extracted = extractOtp(message.subject, message.bodyText ?? '', message.bodyHtml ?? '')
				if (!extracted) {
					await this.writePollLog(
						`[${new Date().toISOString()}] scan:no-otp accountId=${account.id} messageId=${message.id}`
					)
					continue
				}
				const result: OtpResult = {
					...extracted,
					source: buildOtpSource(message),
				}
				results.push(result)
				await this.writePollLog(
					`[${new Date().toISOString()}] scan:otp-candidate accountId=${account.id} messageId=${message.id} code=${result.code} type=${result.type} confidence=${result.confidence}`
				)
			}
			return results
		} finally {
			this.onScanFinished()
		}
	}

	private async pollAccount(account: Account, options?: { readonly includeSeen?: boolean }): Promise<void> {
		const settings = getOtpSettings()
		await this.writePollLog(
			`[${new Date().toISOString()}] poll:start accountId=${account.id} email=${account.email} provider=${account.provider}`
		)
		const provider = await accountManager.getProvider(account.id)
		const messages = await this.fetchRecentMessages(account, provider)
		await this.writePollLog(
			`[${new Date().toISOString()}] poll:list accountId=${account.id} count=${messages.length} maxResults=${this.config.maxEmailsPerPoll}`
		)
		for (const item of messages) {
			await this.writePollLog(
				`[${new Date().toISOString()}] poll:item accountId=${account.id} messageId=${item.id} date=${item.date} from=${item.from.email} subjectLength=${item.subject.length}`
			)
			const seenKey = `${account.id}:${item.id}`
			if (!options?.includeSeen && (this.seenIds.has(seenKey) || this.seenIds.has(item.id))) {
				await this.writePollLog(
					`[${new Date().toISOString()}] poll:skip-seen accountId=${account.id} messageId=${item.id}`
				)
				continue
			}

			this.seenIds.add(seenKey)
			this.seenIdsDirty = true
			let message = await provider.getMessage(item.id)
			if (item.labelIds.length > 0 && message.labelIds.length === 0) {
				message = { ...message, labelIds: item.labelIds }
			}
			await this.writePollLog(
				`[${new Date().toISOString()}] poll:get accountId=${account.id} messageId=${message.id} receivedAt=${message.date} from=${message.from.email} subjectLength=${message.subject.length}`
			)

			const isSent = message.labelIds.includes('SENT') || message.from.email.toLowerCase() === account.email.toLowerCase()
			if (isSent) {
				await this.writePollLog(`[${new Date().toISOString()}] poll:skip-sent accountId=${account.id} messageId=${message.id}`)
				continue
			}

			this.addRecentParsedMessage(message)

			const extracted = extractOtp(message.subject, message.bodyText ?? '', message.bodyHtml ?? '')
			if (!extracted) {
				await this.writePollLog(
					`[${new Date().toISOString()}] poll:no-otp accountId=${account.id} messageId=${message.id}`
				)
				continue
			}
			const result: OtpResult = {
				...extracted,
				source: buildOtpSource(message),
			}
			const stored = this.otpStore.addOtp(result)
			await this.writePollLog(
				`[${new Date().toISOString()}] poll:otp-detected accountId=${account.id} messageId=${message.id} code=${stored.code} type=${stored.type} confidence=${stored.confidence}`
			)
			handleOtpDetected(stored, {
				autoCopyToClipboard: settings.autoCopyToClipboard,
				showNotifications: settings.showNotifications,
				soundEnabled: settings.soundEnabled,
				onDetected: this.onOtpDetected,
			})
			break
		}
		const status: PollStatus = {
			accountId: account.id,
			active: !this.paused,
			lastPollTime: new Date().toISOString(),
		}
		this.statusByAccountId.set(account.id, status)
		this.onPollStatus(status)
	}

	private persistSeenIds(): void {
		if (this.seenIdsDirty) {
			this.seenStoreApi.set('seenMessageIds', Array.from(this.seenIds).slice(-1000))
			this.seenIdsDirty = false
		}
	}

	private async writePollLog(line: string): Promise<void> {
		if (!this.debugLoggingEnabled || !this.logDirectory) {
			return
		}
		try {
			const directory = typeof this.logDirectory === 'function' ? this.logDirectory() : this.logDirectory
			if (!directory) {
				return
			}
			const path = join(directory, POLL_LOG_FILE)
			await mkdir(directory, { recursive: true })
			await appendFile(path, `${redactPollLogLine(line)}\n`, 'utf8')
		} catch {
			// Logging must never break OTP polling flow.
		}
	}
}
