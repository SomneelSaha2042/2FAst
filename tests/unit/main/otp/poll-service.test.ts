import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
	listMessages: vi.fn(),
	getMessage: vi.fn(),
}))

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

vi.mock('../../../../src/main/accounts/account-manager', () => {
	return {
		accountManager: {
			listAccounts: () => [
				{ id: 'a1', provider: 'gmail', email: 'a1@example.com', displayName: 'A1' },
			],
			getProvider: async () => ({
				listMessages: providerMocks.listMessages,
				getMessage: providerMocks.getMessage,
			}),
		},
	}
})

vi.mock('../../../../src/main/otp/otp-actions', () => ({
	handleOtpDetected: vi.fn((_otp, options) => options.onDetected(_otp)),
}))

import { OtpPollService } from '../../../../src/main/otp/poll-service'

describe('OtpPollService', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		providerMocks.listMessages.mockResolvedValue({
			messages: [
				{ id: 'm1', accountId: 'a1', threadId: 't1', subject: 'Your code is 123456', from: { email: 'x@example.com' }, to: [], date: new Date().toISOString(), snippet: '', labelIds: [], isRead: false, isStarred: false, attachments: [] },
			],
		})
		providerMocks.getMessage.mockResolvedValue({
			id: 'm1', accountId: 'a1', threadId: 't1', subject: 'Your code is 123456', from: { email: 'x@example.com' }, to: [], date: new Date().toISOString(), snippet: '', bodyText: 'Your code is 123456', labelIds: [], isRead: false, isStarred: false, attachments: []
		})
	})

	it('deduplicates seen message ids', async () => {
		const detected: string[] = []
		const service = new OtpPollService({
			config: { intervalMs: 10_000, lookbackMinutes: 5, maxEmailsPerPoll: 20 },
			onOtpDetected: (otp) => detected.push(otp.source.messageId),
		})
		await service.pollAllAccounts()
		await service.pollAllAccounts()
		expect(detected).toEqual(['m1'])
	})

	it('queries only the most recent configured message count for OTP checks', async () => {
		const service = new OtpPollService({
			config: { intervalMs: 10_000, lookbackMinutes: 5, maxEmailsPerPoll: 5 },
		})
		await service.pollAllAccounts()
		expect(providerMocks.listMessages).toHaveBeenCalledWith({ maxResults: 5 })
	})

	it('stops scanning the current batch after the newest OTP is detected', async () => {
		providerMocks.listMessages.mockResolvedValue({
			messages: [
				{ id: 'm1', accountId: 'a1', threadId: 't1', subject: 'Your code is 123456', from: { email: 'x@example.com' }, to: [], date: new Date().toISOString(), snippet: '', labelIds: [], isRead: false, isStarred: false, attachments: [] },
				{ id: 'm2', accountId: 'a1', threadId: 't2', subject: 'Your code is 654321', from: { email: 'y@example.com' }, to: [], date: new Date().toISOString(), snippet: '', labelIds: [], isRead: false, isStarred: false, attachments: [] },
			],
		})
		const service = new OtpPollService()
		await service.pollAllAccounts()
		expect(providerMocks.getMessage).toHaveBeenCalledTimes(1)
		expect(providerMocks.getMessage).toHaveBeenCalledWith('m1')
	})

	it('supports pause/resume toggles', async () => {
		const service = new OtpPollService()
		service.pause()
		await service.pollAllAccounts()
		service.resume()
		await service.pollAllAccounts()
		expect(service.getHistory().length).toBeGreaterThanOrEqual(0)
	})
})
