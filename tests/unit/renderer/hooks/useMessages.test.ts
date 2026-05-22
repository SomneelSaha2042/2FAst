import { describe, expect, it } from 'vitest'
import { mergeMessagesByDate } from '../../../../src/renderer/hooks/useMessages'
import type { Message } from '../../../../src/shared/models'

const baseMessage = {
  threadId: 't1',
  subject: 'subject',
  from: { email: 'from@example.com' },
  to: [{ email: 'to@example.com' }],
  snippet: 'snippet',
  labelIds: [],
  isRead: false,
  isStarred: false,
  attachments: [],
} as const

const messageA: Message = {
  ...baseMessage,
  id: 'm1',
  accountId: 'a1',
  date: '2026-05-20T10:00:00.000Z',
}

const messageB: Message = {
  ...baseMessage,
  id: 'm2',
  accountId: 'a2',
  date: '2026-05-22T10:00:00.000Z',
}

const messageC: Message = {
  ...baseMessage,
  id: 'm3',
  accountId: 'a1',
  date: '2026-05-21T10:00:00.000Z',
}

describe('mergeMessagesByDate', () => {
  it('merges account batches and sorts descending by date', () => {
    const merged = mergeMessagesByDate([[messageA, messageC], [messageB]])
    expect(merged.map((item) => item.id)).toEqual(['m2', 'm3', 'm1'])
  })

  it('returns empty list when no batches provided', () => {
    expect(mergeMessagesByDate([])).toEqual([])
  })
})
