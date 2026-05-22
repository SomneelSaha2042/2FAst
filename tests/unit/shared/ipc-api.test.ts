import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../../../src/shared/ipc-api'

describe('IPC channel list', () => {
  it('matches expected channel names', () => {
    const expected = [
      'oauth:getGoogleConfigStatus',
      'oauth:saveGoogleConfig',
      'oauth:deleteGoogleConfig',
      'oauth:cancelFlow',
      'accounts:list',
      'accounts:add',
      'accounts:remove',
      'mail:listMessages',
      'mail:getMessage',
      'mail:getThread',
      'mail:listLabels',
      'mail:listFolders',
      'mail:sendMessage',
      'mail:replyToMessage',
      'mail:trashMessage',
      'mail:toggleRead',
      'mail:toggleStar',
    ]

    expect(IPC_CHANNELS).toEqual(expected)
  })

  it('uses provider:action naming', () => {
    const pattern = /^[a-z]+:[a-zA-Z]+$/

    const allMatch = IPC_CHANNELS.every((channel) => pattern.test(channel))

    expect(allMatch).toBe(true)
  })
})
