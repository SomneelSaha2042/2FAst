import { describe, expect, it } from 'vitest'
import { APP_NAME } from '../../../src/shared/constants'

describe('APP_NAME', () => {
  it('matches the app name', () => {
    expect(APP_NAME).toBe('2fast')
  })
})
