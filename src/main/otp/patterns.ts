import type { Message } from '../../shared/models.js'

import type { OtpSource } from '../../shared/ipc-api.js'

export interface OtpMatch {
	readonly code: string
	readonly type: 'numeric' | 'alphanumeric' | 'url'
	readonly confidence: 'high' | 'medium' | 'low'
}

interface CodeCandidate {
	readonly code: string
	readonly type: 'numeric' | 'alphanumeric'
	readonly score: number
}

const TRIGGER_WORDS = [
	'2fa',
	'authenticate',
	'authentication',
	'code',
	'login',
	'mfa',
	'one time',
	'one-time',
	'otp',
	'passcode',
	'password',
	'pin',
	'security',
	'sign in',
	'sign-in',
	'verification',
	'verify',
] as const

const STRONG_TRIGGER_PATTERNS: readonly RegExp[] = [
	/\b(?:verification|security|login|sign[-\s]?in|authentication|2fa|mfa|email)\s+(?:code|pin|passcode)\b/i,
	/\b(?:otp|one[-\s]?time\s+(?:password|passcode|code)|temporary\s+password)\b/i,
	/\b(?:verify|confirm)\s+(?:your\s+)?email\b/i,
]

const PROMO_WORDS = ['unsubscribe', 'newsletter', 'promotion'] as const
const MAX_BODY_LENGTH = 5000

const EXPLICIT_PATTERNS: readonly RegExp[] = [
	/\b(?:your\s+)?(?:verification|security|login|sign[-\s]?in|authentication|2fa|mfa)\s*(?:code|pin|passcode)\s*(?:is\s*:|is|:|=|-)\s*([A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9])\b/i,
	/\b(?:otp|pin|passcode)\s*(?:is\s*:|is|:|=|-)\s*([A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9])\b/i,
	/\b(?:one[-\s]?time\s+(?:password|passcode|code)|temporary\s+password|single[-\s]?use\s+code)\s*(?:is\s*:|is|:|=|-)\s*([A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9])\b/i,
	/\byour\s+(?:code|pin|passcode)\s*(?:is\s*:|is|:|=|-)\s*([A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9])\b/i,
	/\b([A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9])\s+is\s+your\s+(?:verification|security|login|sign[-\s]?in|authentication|2fa|mfa|otp)\s*(?:code|pin|passcode)?\b/i,
]

const NUMERIC_CODE_PATTERN = /\b\d{4,8}\b/g
const ALPHANUMERIC_TOKEN_PATTERN = /\b[A-Z0-9]{6,10}\b/g
const URL_PATTERN = /(https?:\/\/[^\s"'<>]+)(?=[\s"'<>]|$)/gi
const VERIFICATION_URL_CONTEXT_PATTERN = /\b(?:verify|verification|confirm|activate|authenticate|authentication|sign[-\s]?in|login|magic\s+link|reset\s+password|secure\s+link)\b/i
const VERIFICATION_URL_PATH_PATTERN = /(?:^|[/-])(?:verify|verification|confirm|activate|authenticate|authentication|signin|sign-in|login|magic-link|reset-password|otp|2fa|mfa)(?:[/?#-]|$)/i

const stripHtml = (value: string): string =>
	value
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()

export const hasTriggerWord = (text: string): boolean => {
	const normalized = text.toLowerCase()
	return TRIGGER_WORDS.some((word) => normalized.includes(word))
}

export const hasStrongTrigger = (text: string): boolean => {
	const normalized = text.toLowerCase()
	if (!TRIGGER_WORDS.some(w => normalized.includes(w)) && !normalized.includes('confirm') && !normalized.includes('temporary')) {
		return false
	}
	return STRONG_TRIGGER_PATTERNS.some((pattern) => pattern.test(text))
}

const isPromoLike = (subject: string, body: string): boolean => {
	const normalizedSubject = subject.toLowerCase()
	if (PROMO_WORDS.some((word) => normalizedSubject.includes(word))) {
		return true
	}
	return body.length > MAX_BODY_LENGTH && !hasStrongTrigger(subject)
}

const isNearTriggerWord = (text: string, code: string): boolean => {
	const normalized = text.toLowerCase()
	const index = normalized.indexOf(code.toLowerCase())
	if (index < 0) {
		return false
	}
	const windowStart = Math.max(0, index - 60)
	const windowEnd = Math.min(normalized.length, index + code.length + 60)
	const surrounding = normalized.slice(windowStart, windowEnd)
	return hasTriggerWord(surrounding)
}

const normalizeCode = (value: string): string | null => {
	const code = value.replace(/[\s-]/g, '').toUpperCase()
	if (code.length < 4 || code.length > 10) {
		return null
	}
	if (!/\d/.test(code)) {
		return null
	}
	if (!/^[A-Z0-9]+$/.test(code)) {
		return null
	}
	return code
}

const getCodeType = (code: string): 'numeric' | 'alphanumeric' =>
	/^\d+$/.test(code) ? 'numeric' : 'alphanumeric'

const isLikelyYear = (code: string): boolean => {
	if (!/^\d{4}$/.test(code)) {
		return false
	}
	const year = Number(code)
	return year >= 1900 && year <= 2099
}

const isLikelyDate = (code: string): boolean => {
	if (!/^\d{8}$/.test(code)) {
		return false
	}
	const year = Number(code.slice(0, 4))
	const month = Number(code.slice(4, 6))
	const day = Number(code.slice(6, 8))
	return year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31
}

const scoreCandidate = (
	text: string,
	code: string,
	baseScore: number,
	strongContext: boolean
): CodeCandidate | null => {
	if (isLikelyDate(code)) {
		return null
	}
	let score = baseScore
	if (code.length === 6) {
		score += 12
	}
	if (code.length === 5 || code.length === 7) {
		score += 6
	}
	if (getCodeType(code) === 'alphanumeric') {
		score += 4
	}
	if (isNearTriggerWord(text, code)) {
		score += 25
	}
	if (isLikelyYear(code)) {
		score -= strongContext && isNearTriggerWord(text, code) ? 10 : 40
	}
	if (score < 45) {
		return null
	}
	return {
		code,
		type: getCodeType(code),
		score,
	}
}

const chooseBestCandidate = (candidates: readonly CodeCandidate[]): CodeCandidate | null => {
	const [best] = [...candidates].sort((left, right) => right.score - left.score)
	return best ?? null
}

const findExplicitMatch = (text: string): OtpMatch | null => {
	for (const pattern of EXPLICIT_PATTERNS) {
		const match = text.match(pattern)
		const code = match?.[1] ? normalizeCode(match[1]) : null
		if (!code) {
			continue
		}
		return {
			code,
			type: getCodeType(code),
			confidence: 'high',
		}
	}
	return null
}

const findUrlVerification = (text: string): OtpMatch | null => {
	if (!hasTriggerWord(text)) {
		return null
	}
	for (const match of text.matchAll(URL_PATTERN)) {
		const url = match[1]
		if (!url) {
			continue
		}
		const urlIndex = match.index ?? 0
		const contextStart = Math.max(0, urlIndex - 80)
		const contextEnd = Math.min(text.length, urlIndex + url.length + 80)
		const surrounding = text.slice(contextStart, contextEnd)
		const normalizedUrl = url.toLowerCase()
		if (!VERIFICATION_URL_CONTEXT_PATTERN.test(surrounding) && !VERIFICATION_URL_PATH_PATTERN.test(normalizedUrl)) {
			continue
		}
		return {
			code: url,
			type: 'url',
			confidence: 'medium',
		}
	}
	return null
}

const findContextualCode = (text: string, strongContext: boolean): OtpMatch | null => {
	const candidates: CodeCandidate[] = []
	for (const numeric of text.matchAll(NUMERIC_CODE_PATTERN)) {
		const code = normalizeCode(numeric[0])
		if (!code) {
			continue
		}
		const nearTrigger = isNearTriggerWord(text, code)
		if (nearTrigger || strongContext) {
			const candidate = scoreCandidate(text, code, nearTrigger ? 60 : 48, strongContext)
			if (candidate) {
				candidates.push(candidate)
			}
		}
	}

	for (const alpha of text.toUpperCase().matchAll(ALPHANUMERIC_TOKEN_PATTERN)) {
		const code = normalizeCode(alpha[0])
		if (!code) {
			continue
		}
		if (!/[A-Z]/.test(code) || !/\d/.test(code)) {
			continue
		}
		const nearTrigger = isNearTriggerWord(text, code)
		if (nearTrigger || strongContext) {
			const candidate = scoreCandidate(text, code, nearTrigger ? 60 : 48, strongContext)
			if (candidate) {
				candidates.push(candidate)
			}
		}
	}

	const best = chooseBestCandidate(candidates)
	if (!best) {
		return null
	}
	return {
		code: best.code,
		type: best.type,
		confidence: 'medium',
	}
}

/**
 * Extracts OTP/verification candidate from a message.
 * @param subject Message subject line.
 * @param bodyText Plain-text message body.
 * @param bodyHtml Raw HTML body used as fallback when text is empty.
 * @returns Matched OTP candidate with confidence, or null when no match is found.
 */
export function extractOtp(subject: string, bodyText: string, bodyHtml: string): OtpMatch | null {
	const safeSubject = subject.trim()
	const normalizedBodyText = bodyText.trim()
	const normalizedBody = normalizedBodyText.length > 0 ? normalizedBodyText : stripHtml(bodyHtml)

	if (isPromoLike(safeSubject, normalizedBody)) {
		return null
	}

	// Require explicit OTP context in either header or body, but only extract from body.
	const hasOtpContext = hasTriggerWord(safeSubject) || hasTriggerWord(normalizedBody)
	if (!hasOtpContext) {
		return null
	}
	const strongContext = hasStrongTrigger(safeSubject) || hasStrongTrigger(normalizedBody)

	const extractionText = normalizedBody.length > 0 ? normalizedBody : safeSubject

	const urlMatch = findUrlVerification(extractionText)
	if (urlMatch) {
		return urlMatch
	}

	const explicit = findExplicitMatch(extractionText)
	if (explicit) {
		return explicit
	}

	const contextual = findContextualCode(extractionText, strongContext)
	if (contextual) {
		return contextual
	}

	return null
}

const getPrimaryFolder = (labelIds?: readonly string[]): string | undefined => {
	if (!labelIds || labelIds.length === 0) return undefined
	const exclude = new Set(['UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'SENT'])
	const primary = labelIds.find(l => !exclude.has(l.toUpperCase()))
	if (!primary) return labelIds[0]
	
	// Clean up Gmail internal label names (e.g. INBOX, SPAM, TRASH) to be more readable if needed, 
	// but the UI will uppercase it anyway. We can just return it.
	return primary
}

/**
 * Creates OTP extraction source metadata from a message.
 * @param message Full provider message payload.
 * @returns Source metadata used in OTP history and notifications.
 */
export function buildOtpSource(message: Message): OtpSource {
	return {
		messageId: message.id,
		accountId: message.accountId,
		subject: message.subject,
		sender: message.from.email,
		receivedAt: message.date,
		folder: getPrimaryFolder(message.labelIds)
	}
}
