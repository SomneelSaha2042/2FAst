import Store from 'electron-store'
import { randomUUID } from 'node:crypto'

import type { StoredOtp, OtpResult } from '../../shared/ipc-api.js'

export type { OtpResult, StoredOtp }
interface OtpStoreData { readonly otpHistory: readonly StoredOtp[] }
interface StoreApi<T> { get: <K extends keyof T>(key: K) => T[K]; set: <K extends keyof T>(key: K, value: T[K]) => void }

const MAX_HISTORY = 50

export class OtpStore {
	private readonly store: Store<OtpStoreData>
	private readonly storeApi: StoreApi<OtpStoreData>
	private readonly ttlMinutes: number
	private history: StoredOtp[]

	constructor(ttlMinutes = 10) {
		this.ttlMinutes = ttlMinutes
		this.store = new Store<OtpStoreData>({ name: 'otp-history', defaults: { otpHistory: [] } })
		this.storeApi = this.store as unknown as StoreApi<OtpStoreData>
		this.history = [...this.storeApi.get('otpHistory')]
		this.expireOtps()
	}

	/** Appends OTP detection to local/persisted history. @param result OTP extraction result. @returns Stored OTP entity. */
	addOtp(result: OtpResult): StoredOtp {
		const existing = this.history.find((item) =>
			item.source.accountId === result.source.accountId &&
			item.source.messageId === result.source.messageId &&
			item.code === result.code
		)
		if (existing) {
			const refreshed: StoredOtp = {
				...existing,
				...result,
				detectedAt: new Date().toISOString(),
				copiedCount: existing.copiedCount + 1,
				expired: false,
			}
			this.history = [refreshed, ...this.history.filter((item) => item.id !== existing.id)].slice(0, MAX_HISTORY)
			this.persist()
			return refreshed
		}
		const stored: StoredOtp = { ...result, id: randomUUID(), detectedAt: new Date().toISOString(), copiedCount: 1, expired: false }
		this.history = [stored, ...this.history].slice(0, MAX_HISTORY)
		this.persist()
		return stored
	}

	/** Returns most recent non-expired OTPs. @returns OTP history sorted by detection time descending. */
	getRecentOtps(): StoredOtp[] { this.expireOtps(); return this.history.filter((item) => !item.expired) }

	/** Marks an OTP as copied again and returns the code. @param id Stored OTP identifier. @returns Copied OTP code, or null when not found. */
	copyOtp(id: string): string | null {
		const index = this.history.findIndex((item) => item.id === id)
		if (index < 0) return null
		const target = this.history[index]
		this.history[index] = { ...target, copiedCount: target.copiedCount + 1 }
		this.persist()
		return target.code
	}

	/** Clears OTP history from memory and disk. @returns Void. */
	clearHistory(): void { this.history = []; this.persist() }

	/** Expires stale OTPs by configured TTL. @returns List of OTP ids that were just marked expired. */
	expireOtps(): string[] {
		const now = Date.now()
		const ttlMs = this.ttlMinutes * 60_000
		const expiredIds: string[] = []
		this.history = this.history.map((item) => {
			if (item.expired) return item
			if (now - new Date(item.detectedAt).getTime() >= ttlMs) { expiredIds.push(item.id); return { ...item, expired: true } }
			return item
		})
		if (expiredIds.length > 0) this.persist()
		return expiredIds
	}

	private persist(): void { this.storeApi.set('otpHistory', this.history.slice(0, MAX_HISTORY)) }
}
