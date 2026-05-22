import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import AddAccountDialog from './components/AddAccountDialog'
import AccountHubPage, { type OtpResult } from './pages/AccountHubPage'
import GmailSetupPage from './pages/GmailSetupPage'
import LinkAccountsPage from './pages/LinkAccountsPage'
import type { Account, Message } from '../shared/models'

const BYOC_GUIDE_URL = 'https://developers.google.com/identity/protocols/oauth2/native-app'
const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/'
const GOOGLE_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 20000

type Page = 'hub' | 'link' | 'gmailSetup'

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
  color: '#0f172a',
  fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 16,
}

const buttonStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#0f172a',
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: '1px solid #0f172a',
  background: '#0f172a',
  color: '#ffffff',
}

const wait = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const extractOtpCandidate = (
  messages: readonly Message[]
): { code: string; source: string } | null => {
  const pattern = /\b(\d{4,8})\b/g
  const triggerWords = ['otp', 'code', 'verification', 'passcode', 'security']
  for (const message of messages) {
    const haystack = `${message.subject} ${message.snippet}`.toLowerCase()
    const hasTrigger = triggerWords.some((word) => haystack.includes(word))
    if (!hasTrigger) {
      continue
    }
    const matches = Array.from(haystack.matchAll(pattern))
    if (matches.length > 0 && matches[0][1]) {
      return { code: matches[0][1], source: message.from.email }
    }
  }
  return null
}

const App = (): ReactElement => {
  const [page, setPage] = useState<Page>('hub')
  const [accounts, setAccounts] = useState<readonly Account[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState<boolean>(false)
  const [isWorking, setIsWorking] = useState<boolean>(false)
  const [isCheckingConfig, setIsCheckingConfig] = useState<boolean>(true)
  const [gmailConfigured, setGmailConfigured] = useState<boolean>(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string>('')
  const [clientSecret, setClientSecret] = useState<string>('')
  const [projectId, setProjectId] = useState<string>('')
  const [runningByAccountId, setRunningByAccountId] = useState<Record<string, boolean>>({})
  const [otpByAccountId, setOtpByAccountId] = useState<Record<string, OtpResult>>({})

  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort((a, b) =>
        `${a.provider}:${a.displayName}:${a.email}`.localeCompare(
          `${b.provider}:${b.displayName}:${b.email}`
        )
      ),
    [accounts]
  )

  const refreshAccounts = async (): Promise<void> => {
    setIsLoadingAccounts(true)
    const result = await window.api['accounts:list']()
    if (result.success) {
      setAccounts(result.data ?? [])
    } else {
      setError(result.error ?? 'Failed to load accounts')
    }
    setIsLoadingAccounts(false)
  }

  const refreshGmailConfig = async (): Promise<void> => {
    setIsCheckingConfig(true)
    const result = await window.api['oauth:getGoogleConfigStatus']()
    setGmailConfigured(Boolean(result.success && result.data?.configured))
    setIsCheckingConfig(false)
  }

  useEffect(() => {
    void refreshAccounts()
    void refreshGmailConfig()
  }, [])

  const copyText = async (value: string, successMessage: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setStatus(successMessage)
      setError(null)
    } catch (clipboardError) {
      const message =
        clipboardError instanceof Error ? clipboardError.message : 'Failed to copy to clipboard'
      setError(message)
    }
  }

  const addAccount = async (provider: 'gmail' | 'outlook'): Promise<void> => {
    setIsWorking(true)
    setStatus(`Waiting for ${provider === 'gmail' ? 'Google' : 'Microsoft'} sign-in callback...`)
    setError(null)
    try {
      const result = await window.api['accounts:add'](provider)
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to add account')
      }
      await refreshAccounts()
      setStatus(`Connected ${result.data.email}`)
      setIsAddDialogOpen(false)
      setPage('hub')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unknown error'
      setError(message)
    } finally {
      setIsWorking(false)
    }
  }

  const removeAccount = async (account: Account): Promise<void> => {
    const approved = window.confirm(`Remove ${account.email}? Stored tokens for this account will be deleted.`)
    if (!approved) {
      return
    }
    setIsWorking(true)
    setError(null)
    setStatus(null)
    try {
      const result = await window.api['accounts:remove'](account.id)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to remove account')
      }
      await refreshAccounts()
      setStatus(`Removed ${account.email}`)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unknown error'
      setError(message)
    } finally {
      setIsWorking(false)
    }
  }

  const saveByocConfig = async (): Promise<void> => {
    setIsWorking(true)
    setError(null)
    setStatus(null)
    try {
      const result = await window.api['oauth:saveGoogleConfig']({
        clientId,
        clientSecret,
        projectId: projectId.trim() || undefined,
      })
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to save Gmail OAuth config')
      }
      await refreshGmailConfig()
      setStatus(`Saved config to ${result.data.path}`)
      setPage('link')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unknown error'
      setError(message)
    } finally {
      setIsWorking(false)
    }
  }

  const queryOtpForAccount = async (account: Account): Promise<void> => {
    setRunningByAccountId((existing) => ({ ...existing, [account.id]: true }))
    setError(null)
    setStatus(`Checking recent emails for ${account.email}...`)
    const startedAt = Date.now()
    try {
      while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        const listResult = await window.api['mail:listMessages'](account.id, { maxResults: 5 })
        if (!listResult.success || !listResult.data) {
          throw new Error(listResult.error ?? 'Failed to query recent emails')
        }
        const detected = extractOtpCandidate(listResult.data.messages)
        if (detected) {
          try {
            await navigator.clipboard.writeText(detected.code)
          } catch {
            // Clipboard copy is best-effort.
          }
          const otpResult: OtpResult = {
            code: detected.code,
            source: detected.source,
            detectedAt: new Date().toISOString(),
          }
          setOtpByAccountId((existing) => ({ ...existing, [account.id]: otpResult }))
          setStatus(`OTP detected for ${account.email} and copied to clipboard.`)
          return
        }
        await wait(POLL_INTERVAL_MS)
      }
      setStatus(`No OTP detected for ${account.email} before timeout.`)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unknown error'
      setError(message)
    } finally {
      setRunningByAccountId((existing) => ({ ...existing, [account.id]: false }))
    }
  }

  if (isCheckingConfig && isLoadingAccounts) {
    return <main style={{ ...shellStyle, padding: 24 }}>Loading 2Fast...</main>
  }

  return (
    <main style={shellStyle}>
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: 20 }}>
        <header
          style={{
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 30 }}>2Fast</h1>
            <p style={{ margin: '4px 0 0', color: '#475569' }}>
              Lightweight OTP retrieval from Gmail and Outlook
            </p>
          </div>
          <nav style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={page === 'hub' ? primaryButtonStyle : buttonStyle} onClick={() => setPage('hub')}>
              Account Hub
            </button>
            <button
              type="button"
              style={page === 'link' || page === 'gmailSetup' ? primaryButtonStyle : buttonStyle}
              onClick={() => setPage('link')}
            >
              Link Accounts
            </button>
          </nav>
        </header>

        {page === 'hub' ? (
          <AccountHubPage
            accounts={sortedAccounts}
            runningByAccountId={runningByAccountId}
            otpByAccountId={otpByAccountId}
            onQueryOtp={queryOtpForAccount}
            onCopyOtp={async (code) => copyText(code, 'OTP copied to clipboard.')}
            onOpenLinkAccounts={() => setPage('link')}
            cardStyle={cardStyle}
            buttonStyle={buttonStyle}
            primaryButtonStyle={primaryButtonStyle}
            timeoutSeconds={Math.floor(POLL_TIMEOUT_MS / 1000)}
          />
        ) : null}

        {page === 'link' ? (
          <LinkAccountsPage
            accounts={sortedAccounts}
            isWorking={isWorking}
            onOpenAddAccount={() => setIsAddDialogOpen(true)}
            onOpenGmailSetup={() => setPage('gmailSetup')}
            onRemoveAccount={removeAccount}
            cardStyle={cardStyle}
            buttonStyle={buttonStyle}
            primaryButtonStyle={primaryButtonStyle}
          />
        ) : null}

        {page === 'gmailSetup' ? (
          <GmailSetupPage
            byocGuideUrl={BYOC_GUIDE_URL}
            googleConsoleUrl={GOOGLE_CONSOLE_URL}
            googleCredentialsUrl={GOOGLE_CREDENTIALS_URL}
            clientId={clientId}
            clientSecret={clientSecret}
            projectId={projectId}
            isWorking={isWorking}
            gmailConfigured={gmailConfigured}
            onClientIdChange={setClientId}
            onClientSecretChange={setClientSecret}
            onProjectIdChange={setProjectId}
            onSave={saveByocConfig}
            onBack={() => setPage('link')}
            onCopyLink={copyText}
            cardStyle={cardStyle}
            buttonStyle={buttonStyle}
            primaryButtonStyle={primaryButtonStyle}
          />
        ) : null}

        {status ? <p style={{ marginTop: 12, color: '#166534' }}>{status}</p> : null}
        {error ? (
          <p role="alert" style={{ marginTop: 8, color: '#b91c1c' }}>
            {error}
          </p>
        ) : null}
      </section>
      <AddAccountDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSelectProvider={addAccount}
      />
    </main>
  )
}

export default App

