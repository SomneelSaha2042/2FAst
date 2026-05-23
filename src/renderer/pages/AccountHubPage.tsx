import type { CSSProperties, ReactElement } from 'react'
import type { Account } from '../../shared/models'

export interface OtpResult {
  readonly code: string
  readonly source: string
  readonly detectedAt: string
}

interface AccountHubPageProps {
  readonly accounts: readonly Account[]
  readonly runningByAccountId: Readonly<Record<string, boolean>>
  readonly otpByAccountId: Readonly<Record<string, OtpResult>>
  readonly onQueryOtp: (account: Account) => Promise<void>
  readonly onCopyOtp: (code: string) => Promise<void>
  readonly onOpenLinkAccounts: () => void
  readonly cardStyle: CSSProperties
  readonly buttonStyle: CSSProperties
  readonly primaryButtonStyle: CSSProperties
  readonly timeoutSeconds: number
}

const getProviderColor = (provider: Account['provider']): string =>
  provider === 'gmail' ? '#ef4444' : '#2563eb'

/**
 * Renders the account hub with per-account OTP query tiles.
 * @param props View model and event handlers.
 * @returns Account hub page content.
 */
const AccountHubPage = ({
  accounts,
  runningByAccountId,
  otpByAccountId,
  onQueryOtp,
  onCopyOtp,
  onOpenLinkAccounts,
  cardStyle,
  buttonStyle,
  primaryButtonStyle,
  timeoutSeconds,
}: AccountHubPageProps): ReactElement => {
  if (accounts.length === 0) {
    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 8px' }}>No linked accounts</h2>
          <p style={{ margin: '0 0 12px', color: '#64748b' }}>
            Add a Gmail or Outlook account first, then run OTP checks on demand.
          </p>
          <button type="button" style={primaryButtonStyle} onClick={onOpenLinkAccounts}>
            Go to Link Accounts
          </button>
        </div>
      </section>
    )
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {accounts.map((account) => {
          const providerColor = getProviderColor(account.provider)
          const otp = otpByAccountId[account.id]
          const isRunning = Boolean(runningByAccountId[account.id])
          return (
            <article
              key={account.id}
              style={{
                ...cardStyle,
                borderLeft: `5px solid ${providerColor}`,
                cursor: isRunning ? 'wait' : 'pointer',
                transition: 'transform 120ms ease-out, box-shadow 120ms ease-out',
              }}
              onClick={() => {
                if (!isRunning) {
                  void onQueryOtp(account)
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong>{account.displayName}</strong>
                <span style={{ fontSize: 11, color: providerColor, fontWeight: 700, textTransform: 'uppercase' }}>
                  {account.provider}
                </span>
              </div>
              <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: 13 }}>{account.email}</p>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={(event) => {
                  event.stopPropagation()
                  if (!isRunning) {
                    void onQueryOtp(account)
                  }
                }}
                disabled={isRunning}
              >
                {isRunning ? 'Checking recent 5 emails...' : 'Check OTP'}
              </button>
              {otp ? (
                <div
                  style={{
                    marginTop: 10,
                    border: '1px solid #bfdbfe',
                    borderRadius: 10,
                    padding: 10,
                    background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)',
                  }}
                >
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#475569' }}>Detected OTP</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <code style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{otp.code}</code>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={(event) => {
                        event.stopPropagation()
                        void onCopyOtp(otp.code)
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: '#64748b' }}>
                    From {otp.source} · {new Date(otp.detectedAt).toLocaleString()}
                  </p>
                </div>
              ) : (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#64748b' }}>
                  Click to scan recent messages. Timeout after {timeoutSeconds}s.
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default AccountHubPage

