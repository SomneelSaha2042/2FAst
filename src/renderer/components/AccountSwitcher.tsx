import type { ReactElement, MouseEvent } from 'react'
import { useMemo, useState } from 'react'
import type { Account } from '../../shared/models'
import type { AccountSelection } from '../hooks/useAccounts'

interface AccountSwitcherProps {
  readonly accounts: readonly Account[]
  readonly activeAccountId: AccountSelection
  readonly onSelectAccount: (accountId: AccountSelection) => void
  readonly onAddAccount: () => void
  readonly onRemoveAccount: (accountId: string) => Promise<void>
}

interface ContextMenuState {
  readonly x: number
  readonly y: number
  readonly accountId: string
}

/**
 * Renders the compact account switcher strip.
 * @param props Account switcher properties.
 * @returns Account switcher element.
 */
const AccountSwitcher = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onAddAccount,
  onRemoveAccount,
}: AccountSwitcherProps): ReactElement => {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const accountColors = useMemo(
    () =>
      new Map(
        accounts.map((account, index) => [
          account.id,
          ['#ef4444', '#3b82f6', '#059669', '#7c3aed', '#ea580c'][index % 5],
        ]),
      ),
    [accounts],
  )

  const onAccountContext = (event: MouseEvent<HTMLButtonElement>, accountId: string): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, accountId })
  }

  return (
    <aside className="relative border-r border-slate-200 bg-slate-950 py-2" onClick={() => setMenu(null)}>
      <div className="mb-2 flex justify-center">
        <button
          type="button"
          title="All Inboxes"
          className={`h-8 w-8 rounded-full text-xs font-bold ${
            activeAccountId === 'all' ? 'bg-white text-slate-900' : 'bg-slate-700 text-slate-100'
          }`}
          onClick={() => onSelectAccount('all')}
        >
          All
        </button>
      </div>
      <div className="flex flex-col items-center gap-2">
        {accounts.map((account) => {
          const initial = account.displayName.trim().charAt(0).toUpperCase() || account.email.charAt(0).toUpperCase()
          const isActive = activeAccountId === account.id
          const background = account.avatarUrl ? 'bg-slate-700' : undefined
          return (
            <button
              key={account.id}
              type="button"
              title={`${account.displayName} (${account.provider})`}
              onClick={() => onSelectAccount(account.id)}
              onContextMenu={(event) => onAccountContext(event, account.id)}
              className={`relative h-8 w-8 overflow-hidden rounded-full border-2 ${
                isActive ? 'border-white' : 'border-transparent'
              } ${background ?? ''}`}
              style={{ backgroundColor: background ? undefined : accountColors.get(account.id) }}
            >
              {account.avatarUrl ? (
                <img src={account.avatarUrl} alt={account.displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-white">{initial}</span>
              )}
            </button>
          )
        })}
      </div>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center">
        <button
          type="button"
          title="Add account"
          className="h-8 w-8 rounded-full bg-slate-700 text-lg font-medium text-slate-100 hover:bg-slate-600"
          onClick={onAddAccount}
        >
          +
        </button>
      </div>
      {menu ? (
        <div
          className="fixed z-20 min-w-32 rounded-md border border-slate-300 bg-white p-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={async () => {
              const approved = window.confirm('Remove this account? This will clear stored tokens.')
              if (!approved) {
                setMenu(null)
                return
              }
              await onRemoveAccount(menu.accountId)
              setMenu(null)
            }}
          >
            Remove account
          </button>
        </div>
      ) : null}
    </aside>
  )
}

export default AccountSwitcher
