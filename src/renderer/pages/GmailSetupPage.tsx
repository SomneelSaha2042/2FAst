import type { CSSProperties, ReactElement } from 'react'

interface GmailSetupPageProps {
  readonly byocGuideUrl: string
  readonly googleConsoleUrl: string
  readonly googleCredentialsUrl: string
  readonly clientId: string
  readonly clientSecret: string
  readonly projectId: string
  readonly isWorking: boolean
  readonly gmailConfigured: boolean
  readonly onClientIdChange: (value: string) => void
  readonly onClientSecretChange: (value: string) => void
  readonly onProjectIdChange: (value: string) => void
  readonly onSave: () => Promise<void>
  readonly onBack: () => void
  readonly onCopyLink: (value: string, successMessage: string) => Promise<void>
  readonly cardStyle: CSSProperties
  readonly buttonStyle: CSSProperties
  readonly primaryButtonStyle: CSSProperties
}

/**
 * Renders the Gmail BYOC guide and config form.
 * @param props Guide content and form handlers.
 * @returns Gmail setup page content.
 */
const GmailSetupPage = ({
  byocGuideUrl,
  googleConsoleUrl,
  googleCredentialsUrl,
  clientId,
  clientSecret,
  projectId,
  isWorking,
  gmailConfigured,
  onClientIdChange,
  onClientSecretChange,
  onProjectIdChange,
  onSave,
  onBack,
  onCopyLink,
  cardStyle,
  buttonStyle,
  primaryButtonStyle,
}: GmailSetupPageProps): ReactElement => {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Gmail BYOC Setup Guide</h2>
        <p style={{ color: '#475569', lineHeight: 1.5 }}>
          Tip: copy each link and open it in a browser profile already logged into the Google account you want to connect.
        </p>
        <ol style={{ lineHeight: 1.6, marginBottom: 0 }}>
          <li>Log in with the Google account you want to link in 2Fast.</li>
          <li>
            Open Google Cloud Console for that account.{' '}
            <a href={googleConsoleUrl} target="_blank" rel="noreferrer">
              Open Console
            </a>{' '}
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void onCopyLink(googleConsoleUrl, 'Google Console link copied.')}
            >
              Copy Link
            </button>
          </li>
          <li>Create a project named Personal, or use an existing project.</li>
          <li>
            Switch to the selected project and go to APIs and Services to Credentials.{' '}
            <a href={googleCredentialsUrl} target="_blank" rel="noreferrer">
              Open Credentials
            </a>{' '}
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void onCopyLink(googleCredentialsUrl, 'Credentials link copied.')}
            >
              Copy Link
            </button>
          </li>
          <li>
            Configure consent screen: app name `2FAst`, support email = your Gmail, audience = External, contact email = your email, then finish and create.
          </li>
          <li>
            Go to Data Access, add scope `https://www.googleapis.com/auth/gmail.readonly` and update.
          </li>
          <li>
            Go to Enabled APIs and Services, search for Gmail API, and click Enable.
          </li>
          <li>Go to Audience and add your email as a test user.</li>
          <li>
            Go to Clients, Create, Application type = Desktop app, then copy client ID and client secret.
          </li>
        </ol>
        <p style={{ marginTop: 10 }}>
          Reference:{' '}
          <a href={byocGuideUrl} target="_blank" rel="noreferrer">
            Google OAuth for Desktop Apps
          </a>{' '}
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void onCopyLink(byocGuideUrl, 'OAuth guide link copied.')}
          >
            Copy Link
          </button>
        </p>
      </div>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Save Gmail Credentials</h3>
        <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          <label>
            Client ID
            <input
              value={clientId}
              onChange={(event) => onClientIdChange(event.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, marginTop: 4 }}
            />
          </label>
          <label>
            Client Secret
            <input
              value={clientSecret}
              onChange={(event) => onClientSecretChange(event.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, marginTop: 4 }}
            />
          </label>
          <label>
            Project ID (optional)
            <input
              value={projectId}
              onChange={(event) => onProjectIdChange(event.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, marginTop: 4 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={() => void onSave()}
              disabled={isWorking || !clientId.trim() || !clientSecret.trim()}
            >
              Save Credentials
            </button>
            <button type="button" style={buttonStyle} onClick={onBack}>
              Back to Link Accounts
            </button>
          </div>
        </div>
        <p style={{ marginTop: 10, marginBottom: 0, color: '#64748b' }}>
          Gmail BYOC status: {gmailConfigured ? 'configured' : 'not configured'}
        </p>
      </div>
    </section>
  )
}

export default GmailSetupPage

