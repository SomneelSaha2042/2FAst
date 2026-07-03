import type { AccountAddRequest, ImapReconnectRequest } from '../../shared/ipc-api.js'
import { getProviderDescriptor, isProvider } from '../../shared/provider-registry.js'

const hasValidOptionalImapSettings = (record: Record<string, unknown>): boolean =>
	(record.host === undefined || (typeof record.host === 'string' && record.host.trim().length > 0 && !record.host.includes('://'))) &&
	(record.port === undefined || (typeof record.port === 'number' && Number.isInteger(record.port) && record.port >= 1 && record.port <= 65_535)) &&
	(record.security === undefined || record.security === 'tls' || record.security === 'starttls')

/**
 * Validates an account-add IPC payload.
 * @param value Renderer-supplied payload.
 * @returns True when the payload matches a supported account-add request.
 */
export const isAccountAddRequest = (value: unknown): value is AccountAddRequest => {
	if (typeof value !== 'object' || value === null) return false
	const record = value as Record<string, unknown>
	if (!isProvider(record.provider)) return false
	if (record.authentication === 'oauth') return record.provider === 'gmail' || record.provider === 'outlook'
	if (record.authentication !== 'app-password') return false
	const descriptor = getProviderDescriptor(record.provider)
	return descriptor?.transport === 'imap' &&
		typeof record.email === 'string' && record.email.trim().length > 0 &&
		typeof record.username === 'string' && record.username.trim().length > 0 &&
		typeof record.password === 'string' && record.password.length > 0 &&
		hasValidOptionalImapSettings(record)
}

/**
 * Validates an IMAP reconnect IPC payload.
 * @param value Renderer-supplied payload.
 * @returns True when the payload contains replacement IMAP credentials.
 */
export const isImapReconnectRequest = (value: unknown): value is ImapReconnectRequest => {
	if (typeof value !== 'object' || value === null) return false
	const record = value as Record<string, unknown>
	return record.authentication === 'app-password' &&
		typeof record.username === 'string' && record.username.trim().length > 0 &&
		typeof record.password === 'string' && record.password.length > 0 &&
		hasValidOptionalImapSettings(record)
}
