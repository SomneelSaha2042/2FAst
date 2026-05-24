import Store from 'electron-store'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { accountManager } from '../accounts/account-manager.js'
import type { Account } from '../../shared/models.js'
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

const DEFAULT_CONFIG: PollServiceConfig = {
	intervalMs: 10_000,
	lookbackMinutes: 5,
	maxEmailsPerPoll: 5,
}
const POLL_LOG_FILE = 'otp-poll.log'

const getPollLogPath = (): string => join(process.cwd(), 'logs', POLL_LOG_FILE)

export class OtpPollService {
	private readonly otpStore: OtpStore
	private config: PollServiceConfig
	private readonly seenIds: Set<string>
	private readonly seenStore: Store<SeenStoreData>
	private readonly seenStoreApi: StoreApi<SeenStoreData>
	private readonly statusByAccountId = new Map<string, PollStatus>()
	private timer: NodeJS.Timeout | null = null
	private paused = false
	private readonly onOtpDetected: (otp: StoredOtp) => void
	private readonly onOtpExpired: (otpId: string) => void
	private readonly onPollStatus: (status: PollStatus) => void

	constructor(options?: {
		readonly config?: Partial<PollServiceConfig>
		readonly onOtpDetected?: (otp: StoredOtp) => void
		readonly onOtpExpired?: (otpId: string) => void
		readonly onPollStatus?: (status: PollStatus) => void
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
		await Promise.all(accounts.map((account) => this.pollAccount(account)))
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
		this.seenIds.clear()
		const account = accountManager.getAccount(accountId)
		if (!account) {
			throw new Error(`Account not found: ${accountId}`)
		}
		await this.pollAccount(account, { includeSeen: true })
		this.persistSeenIds()
	}

	/**
	 * Scans the latest configured messages for OTP-like codes without mutating OTP history.
	 * @param accountId Internal account identifier.
	 * @returns OTP candidates extracted from the latest message window.
	 */
	async scanAccountById(accountId: string): Promise<OtpResult[]> {
		const account = accountManager.getAccount(accountId)
		if (!account) {
			throw new Error(`Account not found: ${accountId}`)
		}
		await this.writePollLog(
			`[${new Date().toISOString()}] scan:start accountId=${account.id} email=${account.email} provider=${account.provider}`
		)
		const provider = await accountManager.getProvider(account.id)
		const listResult = await provider.listMessages({
			maxResults: this.config.maxEmailsPerPoll,
		})
		await this.writePollLog(
			`[${new Date().toISOString()}] scan:list accountId=${account.id} count=${listResult.messages.length} maxResults=${this.config.maxEmailsPerPoll}`
		)

		const results: OtpResult[] = []
		for (const item of listResult.messages) {
			await this.writePollLog(
				`[${new Date().toISOString()}] scan:item accountId=${account.id} messageId=${item.id} date=${item.date} from=${item.from.email} subject="${item.subject}"`
			)
			const message = await provider.getMessage(item.id)
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
	}

	private async pollAccount(account: Account, options?: { readonly includeSeen?: boolean }): Promise<void> {
		await this.writePollLog(
			`[${new Date().toISOString()}] poll:start accountId=${account.id} email=${account.email} provider=${account.provider}`
		)
		const provider = await accountManager.getProvider(account.id)
		const listResult = await provider.listMessages({
			maxResults: this.config.maxEmailsPerPoll,
		})
		await this.writePollLog(
			`[${new Date().toISOString()}] poll:list accountId=${account.id} count=${listResult.messages.length} maxResults=${this.config.maxEmailsPerPoll}`
		)
		for (const item of listResult.messages) {
			await this.writePollLog(
				`[${new Date().toISOString()}] poll:item accountId=${account.id} messageId=${item.id} date=${item.date} from=${item.from.email} subject="${item.subject}"`
			)
			if (!options?.includeSeen && this.seenIds.has(item.id)) {
				await this.writePollLog(
					`[${new Date().toISOString()}] poll:skip-seen accountId=${account.id} messageId=${item.id}`
				)
				continue
			}
			this.seenIds.add(item.id)
			const message = await provider.getMessage(item.id)
			await this.writePollLog(
				`[${new Date().toISOString()}] poll:get accountId=${account.id} messageId=${message.id} receivedAt=${message.date} from=${message.from.email} subject="${message.subject}"`
			)
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
			const settings = getOtpSettings()
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
		this.seenStoreApi.set('seenMessageIds', Array.from(this.seenIds).slice(-500))
	}

	private async writePollLog(line: string): Promise<void> {
		try {
			const path = getPollLogPath()
			await mkdir(dirname(path), { recursive: true })
			await appendFile(path, `${line}\n`, 'utf8')
		} catch {
			// Logging must never break OTP polling flow.
		}
	}
}
