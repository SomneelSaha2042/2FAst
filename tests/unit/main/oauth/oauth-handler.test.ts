import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generatePkcePair } from '../../../../src/main/oauth/oauth-handler'

const toBase64Url = (value: Buffer): string =>
	value
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '')

describe('oauth handler', () => {
	it('generates a PKCE verifier in valid length range', () => {
		const { codeVerifier } = generatePkcePair()
		expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
		expect(codeVerifier.length).toBeLessThanOrEqual(128)
	})

	it('generates a challenge matching S256 hash', () => {
		const { codeVerifier, codeChallenge } = generatePkcePair()
		const expected = toBase64Url(createHash('sha256').update(codeVerifier).digest())
		expect(codeChallenge).toBe(expected)
	})
})
