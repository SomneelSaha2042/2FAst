import { describe, expect, it } from 'vitest'
import { resolveActiveAccountId } from '../../../../src/renderer/hooks/useAccounts'
import type { Account } from '../../../../src/shared/models'

const sampleAccounts: readonly Account[] = [
  {
    id: 'a1',
    provider: 'gmail',
    email: 'one@example.com',
    displayName: 'One',
  },
  {
    id: 'a2',
    provider: 'outlook',
    email: 'two@example.com',
    displayName: 'Two',
  },
]

describe('resolveActiveAccountId', () => {
  it('keeps all selection', () => {
    expect(resolveActiveAccountId(sampleAccounts, 'all')).toBe('all')
  })

  it('keeps valid selected account', () => {
    expect(resolveActiveAccountId(sampleAccounts, 'a2')).toBe('a2')
  })

  it('falls back to first account when selection is missing', () => {
    expect(resolveActiveAccountId(sampleAccounts, 'missing')).toBe('a1')
  })

  it('falls back to all when no accounts exist', () => {
    expect(resolveActiveAccountId([], 'missing')).toBe('all')
  })
})
