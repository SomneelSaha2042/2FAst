import { describe, expect, it } from 'vitest'
import { isAccountAddRequest, isImapReconnectRequest } from '../../../../src/main/ipc/validators'

describe('IPC account validators', () => {
	it('accepts supported OAuth and secure IMAP requests', () => {
		expect(isAccountAddRequest({ authentication: 'oauth', provider: 'gmail' })).toBe(true)
		expect(isAccountAddRequest({
			authentication: 'app-password',
			provider: 'imap',
			email: 'user@example.com',
			username: 'user@example.com',
			password: 'secret',
			host: 'imap.example.com',
			port: 993,
			security: 'tls',
		})).toBe(true)
	})

	it('rejects malformed providers, credentials, hosts, ports, and encryption', () => {
		expect(isAccountAddRequest({ authentication: 'oauth', provider: 'unknown' })).toBe(false)
		expect(isAccountAddRequest({ authentication: 'app-password', provider: 'yahoo', email: '', username: '', password: '' })).toBe(false)
		expect(isAccountAddRequest({ authentication: 'app-password', provider: 'imap', email: 'user@example.com', username: 'user', password: 'secret', host: 'https://imap.example.com', port: 0, security: 'none' })).toBe(false)
	})

	it('validates replacement IMAP credentials', () => {
		expect(isImapReconnectRequest({ authentication: 'app-password', username: 'user', password: 'secret' })).toBe(true)
		expect(isImapReconnectRequest({ authentication: 'app-password', username: 'user', password: '', port: 70_000 })).toBe(false)
	})
})
