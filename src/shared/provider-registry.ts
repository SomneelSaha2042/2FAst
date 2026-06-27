import type { Provider, ProviderDescriptor } from './models.js'

const API_READ_CAPABILITIES = {
	folders: false,
	labels: true,
	threads: true,
	send: false,
	mutations: true,
} as const

const IMAP_CAPABILITIES = {
	folders: true,
	labels: false,
	threads: false,
	send: false,
	mutations: false,
} as const

export const PROVIDER_REGISTRY: readonly ProviderDescriptor[] = [
	{
		id: 'gmail',
		displayName: 'Gmail',
		transport: 'gmail-api',
		authentication: 'oauth',
		mailboxStyle: 'labels',
		capabilities: API_READ_CAPABILITIES,
		setupInstructions: 'Configure Gmail BYOC credentials, then sign in with Google.',
	},
	{
		id: 'outlook',
		displayName: 'Outlook',
		transport: 'microsoft-graph',
		authentication: 'oauth',
		mailboxStyle: 'folders',
		capabilities: { ...API_READ_CAPABILITIES, folders: true, labels: false, mutations: false },
		setupInstructions: 'Sign in with a personal or organizational Microsoft account.',
	},
	{
		id: 'yahoo',
		displayName: 'Yahoo Mail',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Generate a Yahoo app password and use your full Yahoo email address as the username.',
		imapPreset: { host: 'imap.mail.yahoo.com', port: 993, security: 'tls' },
	},
	{
		id: 'icloud',
		displayName: 'iCloud Mail',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Generate an Apple app-specific password. The username is usually the part before @icloud.com.',
		imapPreset: { host: 'imap.mail.me.com', port: 993, security: 'tls' },
	},
	{
		id: 'fastmail',
		displayName: 'Fastmail',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Generate a Fastmail app password with mail access and use your full login address.',
		imapPreset: { host: 'imap.fastmail.com', port: 993, security: 'tls' },
	},
	{
		id: 'zoho',
		displayName: 'Zoho Mail',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Enable IMAP access and generate an application-specific password when two-factor authentication is enabled.',
		imapPreset: { host: 'imappro.zoho.com', port: 993, security: 'tls' },
	},
	{
		id: 'proton',
		displayName: 'Proton Mail Bridge',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Install and run Proton Mail Bridge, then enter the IMAP username and password shown by Bridge.',
		imapPreset: { host: '127.0.0.1', port: 1143, security: 'starttls' },
	},
	{
		id: 'imap',
		displayName: 'Custom IMAP',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Enter the secure IMAP settings supplied by your email host.',
	},
] as const

const providerMap = new Map<Provider, ProviderDescriptor>()
for (const descriptor of PROVIDER_REGISTRY) {
	if (providerMap.has(descriptor.id)) {
		throw new Error(`Duplicate provider id: ${descriptor.id}`)
	}
	providerMap.set(descriptor.id, descriptor)
}

/**
 * Finds safe provider metadata by identifier.
 * @param provider Provider identifier.
 * @returns Matching provider descriptor, or null when unsupported.
 */
export const getProviderDescriptor = (provider: Provider): ProviderDescriptor | null =>
	providerMap.get(provider) ?? null

/**
 * Determines whether an unknown value is a registered provider identifier.
 * @param value Value to validate.
 * @returns True when the value is a registered provider identifier.
 */
export const isProvider = (value: unknown): value is Provider =>
	typeof value === 'string' && providerMap.has(value as Provider)
