import type { ReactElement } from 'react'
import { useState } from 'react'
import type { Provider } from '../../shared/models'

interface AddAccountDialogProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSelectProvider: (provider: Provider) => Promise<void>
}

/**
 * Renders provider picker modal for adding accounts.
 * @param props Dialog properties.
 * @returns Modal element.
 */
const AddAccountDialog = ({ isOpen, onClose, onSelectProvider }: AddAccountDialogProps): ReactElement | null => {
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

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Add Account</h2>
        <div className="grid gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            disabled={isLoading}
            onClick={() => void connect('gmail')}
          >
            Gmail
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            disabled={isLoading}
            onClick={() => void connect('outlook')}
          >
            Outlook
          </button>
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          onClick={onClose}
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default AddAccountDialog
