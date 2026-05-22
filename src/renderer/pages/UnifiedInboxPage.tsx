import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import MessageView from '../components/MessageView'
import Sidebar from '../components/Sidebar'
import AccountSwitcher from '../components/AccountSwitcher'
import AddAccountDialog from '../components/AddAccountDialog'
import AccountSettings from '../components/AccountSettings'
import { useAccounts } from '../hooks/useAccounts'
import { useLabels } from '../hooks/useLabels'
import { useMessages } from '../hooks/useMessages'

const UnifiedInboxPage = (): ReactElement => {
  const {
    accounts,
    activeAccountId,
    setActiveAccount,
    refetchAccounts,
    removeAccount,
  } = useAccounts()
  const [selectedMessageId, setSelectedMessageId] = useState<string>()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState<boolean>(false)

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  )

  const { labels, folders } = useLabels({ activeAccountId, activeAccount })
  const {
    messages,
    selectedMessage,
    isLoadingList,
    isLoadingMessage,
    hasMore,
    loadMore,
    refreshList,
    refreshMessage,
    listError,
    messageError,
    setSelectedMessageId: setHookSelectedMessageId,
  } = useMessages({
    accounts,
    activeAccountId,
    selectedMessageId,
    activeAccount,
  })

  const onSelectMessage = (messageId: string): void => {
    setSelectedMessageId(messageId)
    setHookSelectedMessageId(messageId)
  }

  const addAccount = async (provider: 'gmail' | 'outlook'): Promise<void> => {
    const result = await window.api['accounts:add'](provider)
    if (result.success && result.data) {
      await refetchAccounts()
      setActiveAccount(result.data.id)
      setIsAddDialogOpen(false)
      return
    }
    throw new Error(result.error ?? 'Failed to add account')
  }

  return (
    <main className="h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          onClick={() => void refreshList(false)}
        >
          Refresh Inbox
        </button>
      </div>
      <div className="grid h-[calc(100vh-6.5rem)] grid-cols-[48px_240px_1fr_1fr] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <AccountSwitcher
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSelectAccount={setActiveAccount}
          onAddAccount={() => setIsAddDialogOpen(true)}
          onRemoveAccount={async (accountId) => {
            await removeAccount(accountId)
            if (activeAccountId === accountId) {
              setActiveAccount('all')
            }
          }}
        />
        <Sidebar
          account={activeAccount}
          labels={labels}
          folders={folders}
          activeFilterId={undefined}
          onSelectFilter={() => {
            return
          }}
        />
        <section className="h-full overflow-y-auto border-r border-slate-200 bg-white">
          <div className="sticky top-0 border-b border-slate-200 bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {activeAccountId === 'all' ? 'All Inboxes' : 'Messages'}
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {messages.map((message) => {
              const account = accounts.find((item) => item.id === message.accountId)
              const providerGlyph = account?.provider === 'gmail' ? 'G' : 'O'
              const providerColor = account?.provider === 'gmail' ? 'bg-red-500' : 'bg-blue-500'
              return (
                <button
                  key={`${message.accountId}:${message.id}`}
                  type="button"
                  className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${
                    selectedMessageId === message.id ? 'bg-slate-100' : ''
                  }`}
                  onClick={() => onSelectMessage(message.id)}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${providerColor}`} />
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {providerGlyph}
                    </span>
                    <span className="truncate text-xs text-slate-500">{account?.displayName ?? message.accountId}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm ${message.isRead ? 'font-medium' : 'font-bold'}`}>
                      {message.subject || '(No subject)'}
                    </p>
                    <p className="shrink-0 text-xs text-slate-500">{new Date(message.date).toLocaleString()}</p>
                  </div>
                  <p className="truncate text-xs text-slate-600">{message.from.email}</p>
                  <p className="truncate text-xs text-slate-500">{message.snippet}</p>
                </button>
              )
            })}
            {messages.length === 0 && !isLoadingList ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No messages found.</p>
            ) : null}
          </div>
          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void loadMore()}
              disabled={!hasMore || isLoadingList}
            >
              {isLoadingList ? 'Loading...' : hasMore ? 'Load more' : 'No more messages'}
            </button>
          </div>
          {listError ? <p className="px-4 pb-2 text-sm text-amber-700">Inbox: {listError}</p> : null}
        </section>
        <div className="flex h-full flex-col">
          <AccountSettings
            account={activeAccount}
            onRemove={async (accountId) => {
              await removeAccount(accountId)
              await refetchAccounts()
            }}
          />
          <MessageView
            message={selectedMessage}
            isLoading={isLoadingMessage}
            onRefresh={() => void refreshMessage()}
          />
          {messageError ? <p className="px-4 pb-2 text-sm text-amber-700">Message: {messageError}</p> : null}
        </div>
      </div>
      <AddAccountDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSelectProvider={(provider) => addAccount(provider)}
      />
    </main>
  )
}

export default UnifiedInboxPage
