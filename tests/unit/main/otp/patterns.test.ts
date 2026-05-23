import { describe, expect, it } from 'vitest'
import { extractOtp } from '../../../../src/main/otp/patterns'

describe('extractOtp', () => {
	it('detects explicit numeric OTP', () => {
		expect(extractOtp('Your code is 123456', '', '')?.code).toBe('123456')
	})

	it('detects explicit alphanumeric OTP', () => {
		const result = extractOtp('Verification code: A8B3C1', '', '')
		expect(result?.code).toBe('A8B3C1')
		expect(result?.type).toBe('alphanumeric')
	})

	it('detects contextual numeric OTP in body', () => {
		const result = extractOtp('Sign-in alert', 'Use security code 778899 to continue.', '')
		expect(result?.code).toBe('778899')
		expect(result?.confidence).toBe('medium')
	})

	it('extracts verification URL', () => {
		const result = extractOtp('Confirm your email', 'Verify your email: https://example.com/verify/abc', '')
		expect(result?.type).toBe('url')
		expect(result?.code).toContain('https://example.com/verify/abc')
	})

	it('skips newsletter subjects', () => {
		expect(extractOtp('Weekly newsletter with code 123456', 'OTP 123456', '')).toBeNull()
	})

	it('uses HTML body fallback when text is empty', () => {
		const result = extractOtp('Authenticate device', '', '<p>OTP: 483920</p>')
		expect(result?.code).toBe('483920')
	})

	it('skips bare numbers without OTP triggers', () => {
		const result = extractOtp('Your order 998877', 'Tracking number 11223344 shipped', '')
		expect(result).toBeNull()
	})

	it('uses strong subject trigger to extract a bare body code', () => {
		const result = extractOtp(
			'Personal Microsoft account security code',
			'Microsoft account\n847216\nThis request expires in 10 minutes.\nThanks.',
			''
		)
		expect(result?.code).toBe('847216')
		expect(result?.confidence).toBe('medium')
	})

	it('prefers the OTP over years and footer numbers', () => {
		const result = extractOtp(
			'Personal Microsoft account security code',
			'(c) 2026 Microsoft Corporation\nYour single-use code is: 847216\nPrivacy ID 99887766',
			''
		)
		expect(result?.code).toBe('847216')
	})

	it('handles 20 representative OTP samples', () => {
		const cases: Array<{ subject: string; body: string; expected: string }> = [
			{ subject: 'Google verification code', body: 'Your code is 123456', expected: '123456' },
			{ subject: 'GitHub login code', body: 'OTP: 991122', expected: '991122' },
			{ subject: 'AWS sign in', body: 'Security code 556677', expected: '556677' },
			{ subject: 'Bank OTP', body: 'one-time password is 414141', expected: '414141' },
			{ subject: 'Microsoft account', body: 'Verification code: A1B2C3', expected: 'A1B2C3' },
			{ subject: 'Slack sign in', body: 'Login code: 714254', expected: '714254' },
			{ subject: 'Dropbox sign-in', body: 'Use code 333444', expected: '333444' },
			{ subject: 'Zoom authentication', body: 'Authenticate with 313233', expected: '313233' },
			{ subject: 'PayPal OTP', body: 'Your code is 850122', expected: '850122' },
			{ subject: 'Stripe confirm', body: 'Confirm with PIN 9911', expected: '9911' },
			{ subject: 'Notion login', body: 'temporary password: AB12CD', expected: 'AB12CD' },
			{ subject: 'Atlassian verify', body: 'verification code 121212', expected: '121212' },
			{ subject: 'DigitalOcean sign in', body: 'sign in code: 202404', expected: '202404' },
			{ subject: 'OpenAI security code', body: 'security code is 515253', expected: '515253' },
			{ subject: 'Microsoft Teams', body: 'Your code is H7K9L2', expected: 'H7K9L2' },
			{ subject: 'GitLab 2FA', body: '2FA code: 765432', expected: '765432' },
			{ subject: 'Cloudflare access', body: 'OTP is 908172', expected: '908172' },
			{ subject: 'Xero verify account', body: 'Verification code: Z9X8C7', expected: 'Z9X8C7' },
			{ subject: 'Coinbase login', body: 'passcode 449900', expected: '449900' },
			{ subject: 'Linear authenticate', body: 'authenticate with code 612345', expected: '612345' },
		]
		for (const item of cases) {
			expect(extractOtp(item.subject, item.body, '')?.code).toBe(item.expected)
		}
	})
})
