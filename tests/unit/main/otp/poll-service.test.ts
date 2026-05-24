import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
	listMessages: vi.fn(),
	getMessage: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
	appendFile: vi.fn().mockResolvedValue(undefined),
	mkdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs/promises', () => ({
	appendFile: fsMocks.appendFile,
	mkdir: fsMocks.mkdir,
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
			getAccount: (accountId: string) => (
				accountId === 'a1'
					? { id: 'a1', provider: 'gmail', email: 'a1@example.com', displayName: 'A1' }
					: undefined
			),
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
		vi.unstubAllEnvs()
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

	it('returns every OTP candidate found in the latest configured message window', async () => {
		const firstDate = '2026-05-23T10:00:00.000Z'
		const secondDate = '2026-05-23T10:01:00.000Z'
		const thirdDate = '2026-05-23T10:02:00.000Z'
		providerMocks.listMessages.mockResolvedValue({
			messages: [
				{ id: 'm1', accountId: 'a1', threadId: 't1', subject: 'Security code', from: { email: 'first@example.com' }, to: [], date: firstDate, snippet: '', labelIds: [], isRead: false, isStarred: false, attachments: [] },
				{ id: 'm2', accountId: 'a1', threadId: 't2', subject: 'Receipt 2026', from: { email: 'shop@example.com' }, to: [], date: secondDate, snippet: '', labelIds: [], isRead: false, isStarred: false, attachments: [] },
				{ id: 'm3', accountId: 'a1', threadId: 't3', subject: 'One-time password', from: { email: 'second@example.com' }, to: [], date: thirdDate, snippet: '', labelIds: [], isRead: false, isStarred: false, attachments: [] },
			],
		})
		providerMocks.getMessage.mockImplementation(async (messageId: string) => {
			if (messageId === 'm1') {
				return { id: 'm1', accountId: 'a1', threadId: 't1', subject: 'Security code', from: { email: 'first@example.com' }, to: [], date: firstDate, snippet: '', bodyText: 'Your security code is 123456', labelIds: [], isRead: false, isStarred: false, attachments: [] }
			}
			if (messageId === 'm3') {
				return { id: 'm3', accountId: 'a1', threadId: 't3', subject: 'One-time password', from: { email: 'second@example.com' }, to: [], date: thirdDate, snippet: '', bodyText: 'Your one-time password is 654321', labelIds: [], isRead: false, isStarred: false, attachments: [] }
			}
			return { id: 'm2', accountId: 'a1', threadId: 't2', subject: 'Receipt 2026', from: { email: 'shop@example.com' }, to: [], date: secondDate, snippet: '', bodyText: 'Order number 2026', labelIds: [], isRead: false, isStarred: false, attachments: [] }
		})

		const service = new OtpPollService({
			config: { intervalMs: 10_000, lookbackMinutes: 5, maxEmailsPerPoll: 5 },
		})
		const results = await service.scanAccountById('a1')

		expect(providerMocks.listMessages).toHaveBeenCalledWith({ maxResults: 5 })
		expect(providerMocks.getMessage).toHaveBeenCalledTimes(3)
		expect(results.map((result) => result.code)).toEqual(['123456', '654321'])
		expect(results.map((result) => result.source.receivedAt)).toEqual([firstDate, thirdDate])
		expect(service.getHistory()).toHaveLength(0)
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

	it('re-evaluates seen messages during on-demand account checks', async () => {
		const detected: string[] = []
		const service = new OtpPollService({
			onOtpDetected: (otp) => detected.push(otp.source.messageId),
		})
		await service.pollAccountById('a1')
		await service.pollAccountById('a1')
		expect(detected).toEqual(['m1', 'm1'])
		expect(service.getHistory()).toHaveLength(1)
	})

	it('supports pause/resume toggles', async () => {
		const service = new OtpPollService()
		service.pause()
		await service.pollAllAccounts()
		service.resume()
		await service.pollAllAccounts()
		expect(service.getHistory().length).toBeGreaterThanOrEqual(0)
	})

	it('does not write debug poll logs by default', async () => {
		const service = new OtpPollService({
			config: { intervalMs: 10_000, lookbackMinutes: 5, maxEmailsPerPoll: 5 },
			logDirectory: 'app-logs',
		})

		await service.scanAccountById('a1')

		expect(fsMocks.mkdir).not.toHaveBeenCalled()
		expect(fsMocks.appendFile).not.toHaveBeenCalled()
	})

	it('writes redacted debug poll logs when explicitly enabled', async () => {
		const service = new OtpPollService({
			config: { intervalMs: 10_000, lookbackMinutes: 5, maxEmailsPerPoll: 5 },
			debugLoggingEnabled: true,
			logDirectory: 'app-logs',
		})

		await service.scanAccountById('a1')

		const loggedText = fsMocks.appendFile.mock.calls
			.map((call) => String(call[1]))
			.join('')
		expect(fsMocks.mkdir).toHaveBeenCalledWith('app-logs', { recursive: true })
		expect(loggedText).toContain('code=[redacted]')
		expect(loggedText).not.toContain('123456')
		expect(loggedText).not.toContain('Your code is')
	})

	it('enables debug poll logs from TWOFAST_DEBUG_POLL', async () => {
		vi.stubEnv('TWOFAST_DEBUG_POLL', '1')
		const service = new OtpPollService({
			config: { intervalMs: 10_000, lookbackMinutes: 5, maxEmailsPerPoll: 5 },
			logDirectory: 'app-logs',
		})

		await service.scanAccountById('a1')

		expect(fsMocks.appendFile).toHaveBeenCalled()
	})
})
