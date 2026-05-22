import { describe, expect, it } from 'vitest'
import type {
  Account,
  Attachment,
  Label,
  MailFolder,
  Message,
  MessageAddress,
  Provider,
  Thread,
} from '../../../src/shared/models'

describe('shared models', () => {
  it('supports account and mail types', () => {
    const provider: Provider = 'gmail'

    const account: Account = {
      id: 'account-1',
      provider,
      email: 'user@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    }

    const address: MessageAddress = {
      name: 'Sender',
      email: 'sender@example.com',
    }

    const attachment: Attachment = {
      id: 'att-1',
      filename: 'file.txt',
      mimeType: 'text/plain',
      size: 512,
    }

    const message: Message = {
      id: 'msg-1',
      accountId: account.id,
      threadId: 'thread-1',
      subject: 'Hello',
      from: address,
      to: [address],
      date: '2026-05-22T12:00:00.000Z',
      snippet: 'Hello world',
      labelIds: ['INBOX'],
      isRead: false,
      isStarred: false,
      attachments: [attachment],
    }

    const thread: Thread = {
      id: 'thread-1',
      accountId: account.id,
      subject: 'Hello',
      snippet: 'Hello world',
      lastMessageDate: '2026-05-22T12:00:00.000Z',
      messageCount: 1,
      messages: [message],
      labelIds: ['INBOX'],
      isRead: false,
    }

    const label: Label = {
      id: 'label-1',
      accountId: account.id,
      name: 'Important',
      type: 'user',
      messageCount: 5,
      unreadCount: 2,
    }

    const folder: MailFolder = {
      id: 'folder-1',
      accountId: account.id,
      displayName: 'Inbox',
      parentFolderId: 'root',
      totalItemCount: 10,
      unreadItemCount: 3,
    }

    expect(message.from.email).toBe('sender@example.com')
    expect(thread.messages[0].id).toBe('msg-1')
    expect(label.type).toBe('user')
    expect(folder.displayName).toBe('Inbox')
  })
})
