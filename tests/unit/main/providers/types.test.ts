import { describe, expect, it } from 'vitest'
import type { MailProvider } from '../../../../src/main/providers/types'

describe('mail provider types', () => {
	it('defines a provider-agnostic contract', () => {
		const providerName: MailProvider['provider'] = 'gmail'
		expect(providerName).toBe('gmail')
	})
})
