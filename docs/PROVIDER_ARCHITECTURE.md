# Provider Architecture

## Integration Matrix

| Provider | User-facing ID | Transport | Authentication | Notes |
| --- | --- | --- | --- | --- |
| Gmail | `gmail` | Gmail API | OAuth + BYOC | Dedicated provider |
| Outlook / Microsoft 365 | `outlook` | Microsoft Graph | OAuth | Dedicated provider |
| Yahoo Mail | `yahoo` | IMAP | App password | Shared IMAP provider |
| iCloud Mail | `icloud` | IMAP | App-specific password | Shared IMAP provider |
| Fastmail | `fastmail` | IMAP | App password | JMAP may be added later |
| Zoho Mail | `zoho` | IMAP | App password | IMAP must be enabled |
| Proton Mail | `proton` | IMAP through Proton Bridge | Bridge credentials | Loopback only; paid Bridge required |
| Hosted/custom mail | `imap` | IMAP | App password | User supplies secure server settings |

SMTP, POP3, JMAP, and new-provider OAuth flows are outside Phase 9.

## Contracts

- `src/shared/provider-registry.ts` is the safe, renderer-visible source of provider names, transports, capabilities, guidance, and non-secret presets.
- An `AccountConnector` owns account creation, reconnect, and authenticated `MailProvider` construction for one or more provider IDs.
- Branded IMAP provider IDs all resolve to `ImapProvider`; they do not require separate provider classes.
- Renderer behavior uses provider capabilities and mailbox style instead of provider-name checks.
- Generic IMAP is read-only. It supports folders, message lists, recent searches, and full message reads. It does not promise portable threads, sending, or mutations.

## Security Rules

- Renderer-supplied account inputs are validated again in the main process.
- Provider presets cannot be overridden by the renderer.
- Custom IMAP requires TLS or STARTTLS and always verifies the remote certificate.
- Proton Bridge uses its fixed loopback preset and is the only IMAP preset allowed to accept its local self-signed certificate.
- IMAP credentials are encrypted with Electron `safeStorage` in the dedicated IMAP credential store.
- Secrets never appear in `Account`, provider descriptors, logs, or IPC responses.
- Each IMAP operation opens its own connection and releases mailbox locks and connections in `finally`.

## Adding Providers

### Add An IMAP Preset

1. Add a reviewed descriptor and secure server preset to `PROVIDER_REGISTRY`.
2. Add concise app-password and setup guidance.
3. Add registry, validation, and account-creation tests.

No new connector or provider implementation should be needed.

### Add A New Protocol

1. Add the transport and capabilities to shared contracts.
2. Implement a `MailProvider` for protocol operations.
3. Register an `AccountConnector` for account lifecycle and credential handling.
4. Add strict IPC validation, encrypted secret storage, UI setup, and mocked protocol tests.

## References

- Yahoo: <https://help.yahoo.com/kb/imap-internet-message-access-protocol-sln4075.html>
- iCloud: <https://support.apple.com/en-ca/102525>
- Fastmail: <https://www.fastmail.help/hc/en-us/articles/1500000278342>
- Zoho: <https://www.zoho.com/mail/help/imap-access.html>
- Proton Bridge: <https://proton.me/support/imap-smtp-and-pop3-setup>
- JMAP Mail: <https://www.rfc-editor.org/info/rfc8621/>
