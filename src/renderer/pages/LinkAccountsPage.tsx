import type { CSSProperties, ReactElement } from 'react'
import type { Account } from '../../shared/models'

interface LinkAccountsPageProps {
  readonly accounts: readonly Account[]
  readonly isWorking: boolean
  readonly onOpenAddAccount: () => void
  readonly onOpenGmailSetup: () => void
  readonly onRemoveAccount: (account: Account) => Promise<void>
  readonly cardStyle: CSSProperties
  readonly buttonStyle: CSSProperties
  readonly primaryButtonStyle: CSSProperties
}

/**
 * Renders account linking and account list management.
 * @param props View model and event handlers.
 * @returns Link accounts page content.
 */
const LinkAccountsPage = ({
  accounts,
  isWorking,
  onOpenAddAccount,
  onOpenGmailSetup,
  onRemoveAccount,
  cardStyle,
  buttonStyle,
  primaryButtonStyle,
}: LinkAccountsPageProps): ReactElement => {
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Link Accounts</h2>
        <p style={{ marginTop: 0, color: '#64748b' }}>
          Connect accounts once, then run OTP checks manually from Account Hub.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={onOpenAddAccount}
            disabled={isWorking}
          >
            Add Gmail or Outlook Account
          </button>
          <button type="button" style={buttonStyle} onClick={onOpenGmailSetup}>
            Gmail Setup Guide
          </button>
        </div>
      </div>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Connected Accounts</h3>
        {accounts.length === 0 ? (
          <p style={{ marginBottom: 0, color: '#64748b' }}>No accounts linked yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {accounts.map((account) => (
              <div
                key={account.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{account.displayName}</p>
                  <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 13 }}>
                    {account.email} · {account.provider}
                  </p>
                </div>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => void onRemoveAccount(account)}
                  disabled={isWorking}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default LinkAccountsPage

