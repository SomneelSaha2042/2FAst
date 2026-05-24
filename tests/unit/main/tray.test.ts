import { describe, expect, it, vi } from 'vitest'
import type { Account } from '../../../src/shared/models'
import type { StoredOtp } from '../../../src/main/otp/otp-store'

vi.mock('electron', () => ({
	Menu: { buildFromTemplate: vi.fn((template) => template) },
	Notification: vi.fn(),
	Tray: vi.fn(),
	app: { getAppPath: () => '' },
	clipboard: { writeText: vi.fn() },
	nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })), createEmpty: vi.fn() },
}))

const accounts: readonly Account[] = [
	{ id: 'gmail-1', provider: 'gmail', email: 'one@gmail.com', displayName: 'One' },
	{ id: 'outlook-1', provider: 'outlook', email: 'two@outlook.com', displayName: 'Two' },
]

const otps: readonly StoredOtp[] = [
	{
		id: 'otp-1',
		code: '123456',
		type: 'numeric',
		confidence: 'high',
		detectedAt: new Date().toISOString(),
		copiedCount: 0,
		expired: false,
		source: {
			accountId: 'gmail-1',
			messageId: 'm1',
			subject: 'Security code',
			sender: 'security@example.com',
			receivedAt: new Date().toISOString(),
		},
	},
]

describe('tray menu template', () => {
	it('groups accounts by provider', async () => {
		const { buildTrayMenuTemplate } = await import('../../../src/main/tray')
		const template = buildTrayMenuTemplate({
			getAccounts: () => accounts,
			getRecentOtps: () => [],
			copyOtp: () => null,
			onOpenSettings: vi.fn(),
			onPollAccount: vi.fn(),
			onQuit: vi.fn(),
		})
		const labels = template.map((item) => item.label)
		expect(labels).toContain('Gmail')
		expect(labels).toContain('one@gmail.com')
		expect(labels).toContain('Outlook')
		expect(labels).toContain('two@outlook.com')
		expect(labels).toContain('Settings...')
		expect(labels).toContain('Quit 2Fast')
	})

	it('clicking an account dispatches polling for that account', async () => {
		const onPollAccount = vi.fn()
		const { buildTrayMenuTemplate } = await import('../../../src/main/tray')
		const template = buildTrayMenuTemplate({
			getAccounts: () => accounts,
			getRecentOtps: () => otps,
			copyOtp: () => null,
			onOpenSettings: vi.fn(),
			onPollAccount,
			onQuit: vi.fn(),
		})
		const gmailItem = template.find((item) => item.label === 'one@gmail.com')
		expect(gmailItem?.click).toBeTypeOf('function')
		gmailItem?.click?.(undefined, undefined)
		expect(onPollAccount).toHaveBeenCalledWith(accounts[0])
	})
})
