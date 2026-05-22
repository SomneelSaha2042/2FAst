import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthTokens } from '../../../../src/main/oauth/oauth-handler'

const safeStorageMock = {
	isEncryptionAvailable: vi.fn(() => true),
	encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf8')),
	decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^enc:/, '')),
}

vi.mock('electron', () => ({
	safeStorage: safeStorageMock,
}))

let testHome: string

vi.mock('node:os', async () => {
	const actual = await vi.importActual<typeof import('node:os')>('node:os')
	return {
		...actual,
		homedir: () => testHome,
	}
})

describe('token store', () => {
	beforeEach(() => {
		testHome = mkdtempSync(join(tmpdir(), 'twofast-token-test-'))
		vi.resetModules()
	})

	afterEach(() => {
		rmSync(testHome, { recursive: true, force: true })
		vi.clearAllMocks()
	})

	it('encrypts and decrypts tokens round-trip', async () => {
		const { saveTokens, loadTokens } = await import('../../../../src/main/accounts/token-store')
		const tokens: OAuthTokens = {
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: 123456,
			scope: 'scope',
		}

		await saveTokens('acc-1', tokens)
		const loaded = await loadTokens('acc-1')

		expect(safeStorageMock.encryptString).toHaveBeenCalledTimes(1)
		expect(safeStorageMock.decryptString).toHaveBeenCalledTimes(1)
		expect(loaded).toEqual(tokens)
	})
})
