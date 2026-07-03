import { describe, expect, it } from 'vitest'
import { PROVIDER_REGISTRY, getProviderDescriptor, isProvider } from '../../../src/shared/provider-registry'

describe('provider registry', () => {
	it('contains unique provider ids and safe metadata', () => {
		const ids = PROVIDER_REGISTRY.map((descriptor) => descriptor.id)
		expect(new Set(ids).size).toBe(ids.length)
		expect(PROVIDER_REGISTRY.every((descriptor) => !('password' in descriptor))).toBe(true)
	})

	it('maps branded IMAP providers to shared capabilities', () => {
		const zoho = getProviderDescriptor('zoho')
		expect(zoho?.transport).toBe('imap')
		expect(zoho?.capabilities.folders).toBe(true)
		expect(zoho?.capabilities.threads).toBe(false)
		expect(isProvider('zoho')).toBe(true)
		expect(isProvider('unknown')).toBe(false)
	})
})
