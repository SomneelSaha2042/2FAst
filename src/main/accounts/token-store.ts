import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { OAuthTokens } from '../oauth/oauth-handler.js'

const TOKENS_DIR = join(homedir(), '.2fast', 'tokens')

const tokenFilePath = (accountId: string): string => join(TOKENS_DIR, `${accountId}.enc`)

const ensureSafeStorageAvailable = (): void => {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error('System keychain encryption is unavailable on this device')
	}
}

/**
 * Saves encrypted OAuth tokens for an account.
 * @param accountId Internal account identifier.
 * @param tokens OAuth token bundle to encrypt and persist.
 * @returns Promise that resolves when write completes.
 */
export const saveTokens = async (accountId: string, tokens: OAuthTokens): Promise<void> => {
	ensureSafeStorageAvailable()
	mkdirSync(TOKENS_DIR, { recursive: true })
	const serialized = JSON.stringify(tokens)
	const encrypted = safeStorage.encryptString(serialized)
	writeFileSync(tokenFilePath(accountId), encrypted)
}

/**
 * Loads and decrypts OAuth tokens for an account.
 * @param accountId Internal account identifier.
 * @returns Decrypted token bundle, or null if no tokens are stored.
 */
export const loadTokens = async (accountId: string): Promise<OAuthTokens | null> => {
	ensureSafeStorageAvailable()
	const filePath = tokenFilePath(accountId)
	if (!existsSync(filePath)) {
		return null
	}

	const encrypted = readFileSync(filePath)
	const decrypted = safeStorage.decryptString(encrypted)
	const parsed = JSON.parse(decrypted) as OAuthTokens
	return parsed
}

/**
 * Deletes stored encrypted tokens for an account.
 * @param accountId Internal account identifier.
 * @returns Promise that resolves when delete completes.
 */
export const deleteTokens = async (accountId: string): Promise<void> => {
	const filePath = tokenFilePath(accountId)
	if (existsSync(filePath)) {
		rmSync(filePath, { force: true })
	}
}
