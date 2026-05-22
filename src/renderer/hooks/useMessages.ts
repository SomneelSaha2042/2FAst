import { useEffect, useMemo, useState } from 'react'
import type { Account, Message } from '../../shared/models'
import type { AccountSelection } from './useAccounts'

interface UseMessagesOptions {
  readonly accounts: readonly Account[]
  readonly activeAccountId: AccountSelection
  readonly selectedMessageId?: string
  readonly activeAccount: Account | null
}

interface AccountPageState {
  readonly accountId: string
  readonly nextPageToken?: string
  readonly hasMore: boolean
}

/**
 * Merges message collections and sorts by descending date.
 * @param batches Message arrays from one or more accounts.
 * @returns Sorted merged message list.
 */
export const mergeMessagesByDate = (batches: readonly (readonly Message[])[]): Message[] => {
  return batches
    .flatMap((batch) => batch)
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/**
 * Loads message lists and message details for the current account selection.
 * @param options Input dependencies for message loading.
 * @returns Message data and list/detail actions.
 */
export const useMessages = ({
  accounts,
  activeAccountId,
}: UseMessagesOptions): {
  readonly messages: readonly Message[]
  readonly selectedMessage: Message | null
  readonly isLoadingList: boolean
  readonly isLoadingMessage: boolean
  readonly hasMore: boolean
  readonly loadMore: () => Promise<void>
  readonly refreshList: (append: boolean) => Promise<void>
  readonly refreshMessage: () => Promise<void>
  readonly listError?: string
  readonly messageError?: string
  readonly setSelectedMessageId: (messageId: string) => void
} => {
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [currentSelectedMessageId, setCurrentSelectedMessageId] = useState<string | undefined>()
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false)
  const [isLoadingMessage, setIsLoadingMessage] = useState<boolean>(false)
  const [listError, setListError] = useState<string>()
  const [messageError, setMessageError] = useState<string>()
  const [paging, setPaging] = useState<readonly AccountPageState[]>([])

  const targetAccountIds = useMemo(
    () =>
      activeAccountId === 'all'
        ? accounts.map((account) => account.id)
        : accounts.filter((account) => account.id === activeAccountId).map((account) => account.id),
    [accounts, activeAccountId],
  )

  const refreshList = async (append: boolean): Promise<void> => {
    if (targetAccountIds.length === 0) {
      setMessages([])
      return
    }

    setIsLoadingList(true)
    setListError(undefined)

    const pagingMap = new Map(paging.map((item) => [item.accountId, item]))
    const results = await Promise.all(
      targetAccountIds.map(async (accountId) => {
        const token = append ? pagingMap.get(accountId)?.nextPageToken : undefined
        const result = await window.api['mail:listMessages'](accountId, {
          maxResults: 20,
          pageToken: token,
        })
        return { accountId, result }
      }),
    )

    setIsLoadingList(false)

    const failures = results.filter(({ result }) => !result.success || !result.data)
    if (failures.length > 0) {
      setListError(failures[0].result.error ?? 'Failed to load messages')
      return
    }

    const successful = results.map(({ accountId, result }) => {
      const data = result.data as { messages: Message[]; nextPageToken?: string }
      return {
        accountId,
        messages: data.messages,
        nextPageToken: data.nextPageToken,
      }
    })

    const merged = mergeMessagesByDate(successful.map((item) => item.messages))
    setMessages((existing) => (append ? mergeMessagesByDate([existing, merged]) : merged))
    setPaging(
      successful.map((item) => ({
        accountId: item.accountId,
        nextPageToken: item.nextPageToken,
        hasMore: Boolean(item.nextPageToken),
      })),
    )
    if (!append && merged.length > 0) {
      setCurrentSelectedMessageId(merged[0].id)
    }
  }

  useEffect(() => {
    setMessages([])
    setPaging([])
    setSelectedMessage(null)
    void refreshList(false)
  }, [activeAccountId, accounts.length])

  useEffect(() => {
    if (!currentSelectedMessageId) {
      setSelectedMessage(null)
      return
    }

    const selected = messages.find((message) => message.id === currentSelectedMessageId)
    if (!selected) {
      setSelectedMessage(null)
      return
    }

    const loadMessage = async (): Promise<void> => {
      setIsLoadingMessage(true)
      setMessageError(undefined)
      const result = await window.api['mail:getMessage'](selected.accountId, selected.id)
      setIsLoadingMessage(false)
      if (!result.success || !result.data) {
        setMessageError(result.error ?? 'Failed to load message')
        return
      }
      setSelectedMessage(result.data)
    }

    void loadMessage()
  }, [currentSelectedMessageId, messages])

  const hasMore = useMemo(() => paging.some((item) => item.hasMore), [paging])

  return {
    messages,
    selectedMessage,
    isLoadingList,
    isLoadingMessage,
    hasMore,
    loadMore: async (): Promise<void> => refreshList(true),
    refreshList,
    refreshMessage: async (): Promise<void> => {
      if (!selectedMessage) {
        return
      }
      setIsLoadingMessage(true)
      setMessageError(undefined)
      const result = await window.api['mail:getMessage'](selectedMessage.accountId, selectedMessage.id)
      setIsLoadingMessage(false)
      if (!result.success || !result.data) {
        setMessageError(result.error ?? 'Failed to refresh message')
        return
      }
      setSelectedMessage(result.data)
    },
    listError,
    messageError,
    setSelectedMessageId: (messageId: string): void => setCurrentSelectedMessageId(messageId),
  }
}
