import { useEffect, useMemo, useState } from 'react'
import type { Account } from '../../shared/models'

export type AccountSelection = 'all' | string

/**
 * Chooses a safe active account selection when the account list changes.
 * @param accounts Latest account list.
 * @param current Current active selection.
 * @returns Updated active selection.
 */
export const resolveActiveAccountId = (
  accounts: readonly Account[],
  current: AccountSelection,
): AccountSelection => {
  if (current === 'all') {
    return 'all'
  }
  return accounts.some((account) => account.id === current)
    ? current
    : accounts.length > 0
      ? accounts[0].id
      : 'all'
}

/**
 * Loads and manages connected accounts for the renderer.
 * @returns Accounts state and account actions.
 */
export const useAccounts = (): {
  readonly accounts: readonly Account[]
  readonly activeAccountId: AccountSelection
  readonly setActiveAccount: (accountId: AccountSelection) => void
  readonly refetchAccounts: () => Promise<void>
  readonly removeAccount: (accountId: string) => Promise<void>
} => {
  const [accounts, setAccounts] = useState<readonly Account[]>([])
  const [activeAccountId, setActiveAccountId] = useState<AccountSelection>('all')

  const refetchAccounts = async (): Promise<void> => {
    const result = await window.api['accounts:list']()
    const accountList = result.success ? (result.data ?? []) : []
    if (result.success) {
      setAccounts(accountList)
      setActiveAccountId((current) => resolveActiveAccountId(accountList, current))
    }
  }

  useEffect(() => {
    void refetchAccounts()
  }, [])

  const value = useMemo(
    () => ({
      accounts,
      activeAccountId,
      setActiveAccount: (accountId: AccountSelection): void => setActiveAccountId(accountId),
      refetchAccounts,
      removeAccount: async (accountId: string): Promise<void> => {
        const result = await window.api['accounts:remove'](accountId)
        if (!result.success) {
          throw new Error(result.error ?? 'Failed to remove account')
        }
        await refetchAccounts()
      },
    }),
    [accounts, activeAccountId],
  )

  return value
}
