import type { ReactElement } from 'react'
import { useState } from 'react'
import type { Provider } from '../../shared/models'

interface AddAccountDialogProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onCancelConnection?: () => Promise<void>
  readonly onSelectProvider: (provider: Provider) => Promise<void>
}

/**
 * Renders provider picker modal for adding accounts.
 * @param props Dialog properties.
 * @returns Modal element.
 */
const AddAccountDialog = ({ isOpen, onClose, onCancelConnection, onSelectProvider }: AddAccountDialogProps): ReactElement | null => {
  const [isLoading, setIsLoading] = useState<boolean>(false)

  if (!isOpen) {
    return null
  }

  const connect = async (provider: Provider): Promise<void> => {
    setIsLoading(true)
    try {
      await onSelectProvider(provider)
    } finally {
      setIsLoading(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (isLoading && onCancelConnection) {
      await onCancelConnection()
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur">
      <div className="w-full max-w-sm rounded-lg border border-slate-700/70 bg-slate-900/95 p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-slate-100">Add Account</h2>
        <div className="grid gap-2">
          <button
            type="button"
            className="rounded-md border border-sky-400/50 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-500/25"
            disabled={isLoading}
            onClick={() => void connect('gmail')}
          >
            Gmail
          </button>
          <button
            type="button"
            className="rounded-md border border-sky-400/50 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-500/25"
            disabled={isLoading}
            onClick={() => void connect('outlook')}
          >
            Outlook
          </button>
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => void cancel()}
        >
          {isLoading ? 'Cancel connection' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}

export default AddAccountDialog
