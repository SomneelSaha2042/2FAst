import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ImapSecurity } from '../../shared/models.js'

export interface ImapCredentials {
	readonly host: string
	readonly port: number
	readonly security: ImapSecurity
	readonly username: string
	readonly password: string
	readonly allowSelfSigned: boolean
}

const CREDENTIALS_DIR = join(homedir(), '.2fast', 'imap-credentials')
const credentialFilePath = (accountId: string): string => join(CREDENTIALS_DIR, `${accountId}.enc`)

const ensureSafeStorageAvailable = (): void => {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error('System keychain encryption is unavailable on this device')
	}
}

/**
 * Saves encrypted IMAP credentials for an account.
 * @param accountId Internal account identifier.
 * @param credentials IMAP connection credentials.
 * @returns Promise that resolves when credentials are written.
 */
export const saveImapCredentials = async (accountId: string, credentials: ImapCredentials): Promise<void> => {
	ensureSafeStorageAvailable()
	mkdirSync(CREDENTIALS_DIR, { recursive: true })
	writeFileSync(credentialFilePath(accountId), safeStorage.encryptString(JSON.stringify(credentials)))
}

/**
 * Loads encrypted IMAP credentials for an account.
 * @param accountId Internal account identifier.
 * @returns Decrypted credentials, or null when none exist.
 */
export const loadImapCredentials = async (accountId: string): Promise<ImapCredentials | null> => {
	ensureSafeStorageAvailable()
	const path = credentialFilePath(accountId)
	if (!existsSync(path)) return null
	return JSON.parse(safeStorage.decryptString(readFileSync(path))) as ImapCredentials
}

/**
 * Deletes encrypted IMAP credentials for an account.
 * @param accountId Internal account identifier.
 * @returns Promise that resolves when credentials are deleted.
 */
export const deleteImapCredentials = async (accountId: string): Promise<void> => {
	const path = credentialFilePath(accountId)
	if (existsSync(path)) rmSync(path, { force: true })
}
