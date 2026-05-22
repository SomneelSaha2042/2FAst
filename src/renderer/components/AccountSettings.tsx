import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { Account } from '../../shared/models'

interface AccountSettingsProps {
  readonly account: Account | null
  readonly onRemove: (accountId: string) => Promise<void>
}

/**
 * Renders per-account settings controls.
 * @param props Settings panel properties.
 * @returns Account settings element.
 */
const AccountSettings = ({ account, onRemove }: AccountSettingsProps): ReactElement => {
  const [displayNameOverride, setDisplayNameOverride] = useState<string>('')

  useEffect(() => {
    setDisplayNameOverride(account?.displayName ?? '')
  }, [account?.id])

  if (!account) {
    return (
      <section className="border-b border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Select an account to open settings.</p>
      </section>
    )
  }

  return (
    <section className="border-b border-slate-200 bg-slate-50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Account Settings</h3>
      <label className="mt-2 block text-xs text-slate-600">
        Display Name Override
        <input
          value={displayNameOverride}
          onChange={(event) => setDisplayNameOverride(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
        />
      </label>
      <button
        type="button"
        className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        onClick={() => void onRemove(account.id)}
      >
        Remove Account
      </button>
    </section>
  )
}

export default AccountSettings
