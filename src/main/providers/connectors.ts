import type { AccountAddRequest, ImapReconnectRequest } from '../../shared/ipc-api.js'
import type { Account, Provider } from '../../shared/models.js'
import type { MailProvider } from './types.js'

export interface AccountConnector {
	readonly providers: readonly Provider[]
	add(request: AccountAddRequest): Promise<Account>
	reconnect(account: Account, request?: ImapReconnectRequest): Promise<Account>
	getProvider(account: Account): Promise<MailProvider>
}
