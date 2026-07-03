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
		id: 'zoho',
		displayName: 'Zoho Mail',
		transport: 'imap',
		authentication: 'app-password',
		mailboxStyle: 'folders',
		capabilities: IMAP_CAPABILITIES,
		setupInstructions: 'Enable IMAP access and generate an application-specific password when two-factor authentication is enabled.',
		imapPreset: { host: 'imap.zoho.com', port: 993, security: 'tls' },
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
