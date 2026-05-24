import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-store', () => {
	class MockStore<T extends Record<string, unknown>> {
		private readonly data: Record<string, unknown>
		constructor(options?: { defaults?: T }) {
			this.data = { ...(options?.defaults ?? {}) }
		}
		get<K extends keyof T>(key: K): T[K] {
			return this.data[String(key)] as T[K]
		}
		set<K extends keyof T>(key: K, value: T[K]): void {
			this.data[String(key)] = value
		}
	}
	return { default: MockStore }
})

import { OtpStore } from '../../../../src/main/otp/otp-store'

describe('OtpStore', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
	})

	it('keeps max 50 OTPs', () => {
		const store = new OtpStore(10)
		for (let index = 0; index < 55; index += 1) {
			store.addOtp({
				code: `${index}`,
				type: 'numeric',
				confidence: 'high',
				source: {
					messageId: `${index}`,
					accountId: 'acc',
					subject: 'OTP',
					sender: 'test@example.com',
					receivedAt: new Date().toISOString(),
				},
			})
		}
		expect(store.getRecentOtps()).toHaveLength(50)
	})

	it('expires OTPs based on ttl', () => {
		const store = new OtpStore(1)
		const otp = store.addOtp({
			code: '123456',
			type: 'numeric',
			confidence: 'high',
			source: {
				messageId: 'm1',
				accountId: 'a1',
				subject: 'Your code',
				sender: 'sender@example.com',
				receivedAt: new Date().toISOString(),
			},
		})
		vi.advanceTimersByTime(61_000)
		expect(store.expireOtps()).toContain(otp.id)
		expect(store.getRecentOtps()).toHaveLength(0)
	})

	it('increments copied count on copy', () => {
		const store = new OtpStore(10)
		const otp = store.addOtp({
			code: '654321',
			type: 'numeric',
			confidence: 'high',
			source: {
				messageId: 'm2',
				accountId: 'a2',
				subject: 'OTP',
				sender: 'sender@example.com',
				receivedAt: new Date().toISOString(),
			},
		})
		expect(store.copyOtp(otp.id)).toBe('654321')
	})

	it('refreshes repeated detections from the same message without duplicating history', () => {
		const store = new OtpStore(10)
		const first = store.addOtp({
			code: '112233',
			type: 'numeric',
			confidence: 'high',
			source: {
				messageId: 'm3',
				accountId: 'a3',
				subject: 'OTP',
				sender: 'sender@example.com',
				receivedAt: new Date().toISOString(),
			},
		})
		vi.advanceTimersByTime(5000)
		const refreshed = store.addOtp({
			code: '112233',
			type: 'numeric',
			confidence: 'high',
			source: {
				messageId: 'm3',
				accountId: 'a3',
				subject: 'OTP',
				sender: 'sender@example.com',
				receivedAt: new Date().toISOString(),
			},
		})
		expect(refreshed.id).toBe(first.id)
		expect(refreshed.detectedAt).not.toBe(first.detectedAt)
		expect(store.getRecentOtps()).toHaveLength(1)
	})
})
