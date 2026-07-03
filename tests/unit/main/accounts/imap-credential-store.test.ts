import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = {
	isEncryptionAvailable: vi.fn(() => true),
	encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf8')),
	decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^enc:/, '')),
}

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

let testHome: string

vi.mock('node:os', async () => {
	const actual = await vi.importActual<typeof import('node:os')>('node:os')
	return { ...actual, homedir: () => testHome }
})

describe('IMAP credential store', () => {
	beforeEach(() => {
		testHome = mkdtempSync(join(tmpdir(), 'twofast-imap-credential-test-'))
		vi.resetModules()
	})

	afterEach(() => {
		rmSync(testHome, { recursive: true, force: true })
		vi.clearAllMocks()
	})

	it('encrypts, replaces, loads, and deletes credentials', async () => {
		const { deleteImapCredentials, loadImapCredentials, saveImapCredentials } = await import('../../../../src/main/accounts/imap-credential-store')
		const credentials = {
			host: 'imap.example.com',
			port: 993,
			security: 'tls' as const,
			username: 'user@example.com',
			password: 'app-password',
			allowSelfSigned: false,
		}
		await saveImapCredentials('account-1', credentials)
		await saveImapCredentials('account-1', { ...credentials, password: 'replacement' })
		expect(await loadImapCredentials('account-1')).toEqual({ ...credentials, password: 'replacement' })
		await deleteImapCredentials('account-1')
		expect(await loadImapCredentials('account-1')).toBeNull()
		expect(safeStorageMock.encryptString).toHaveBeenCalledTimes(2)
	})
})
