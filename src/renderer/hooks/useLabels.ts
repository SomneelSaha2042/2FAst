import { useEffect, useState } from 'react'
import type { Account, Label, MailFolder } from '../../shared/models'
import type { AccountSelection } from './useAccounts'

interface UseLabelsOptions {
  readonly activeAccountId: AccountSelection
  readonly activeAccount: Account | null
}

/**
 * Loads provider-specific mailbox filters for the active account.
 * @param options Active account details.
 * @returns Labels and folders for sidebar rendering.
 */
export const useLabels = ({ activeAccountId, activeAccount }: UseLabelsOptions): {
  readonly labels: readonly Label[]
  readonly folders: readonly MailFolder[]
} => {
  const [labels, setLabels] = useState<readonly Label[]>([])
  const [folders, setFolders] = useState<readonly MailFolder[]>([])

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (activeAccountId === 'all' || !activeAccount) {
        setLabels([])
        setFolders([])
        return
      }

      if (activeAccount.provider === 'gmail') {
        const result = await window.api['mail:listLabels'](activeAccount.id)
        if (result.success && result.data) {
          setLabels(result.data)
          setFolders([])
        }
        return
      }

      const result = await window.api['mail:listFolders'](activeAccount.id)
      if (result.success && result.data) {
        setFolders(result.data)
        setLabels([])
      }
    }

    void load()
  }, [activeAccountId, activeAccount])

  return { labels, folders }
}
