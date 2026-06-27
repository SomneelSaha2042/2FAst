# Phase 9 - Protocol-Based Email Providers

## Goal

Add a provider registry and a shared read-only IMAP implementation for Yahoo, iCloud, Fastmail, Zoho, Proton Bridge, and custom IMAP accounts while preserving Gmail and Outlook behavior.

## Allowed Files

- `package.json`, `pnpm-lock.yaml`
- `README.md`, `PRD.md`
- `docs/`
- `src/shared/`
- `src/main/accounts/`, `src/main/providers/`, `src/main/ipc/`, `src/main/tray.ts`
- `src/preload/`
- `src/renderer/`
- `tests/unit/`

## Completion Gate

- [x] Provider registry exposes safe metadata and capabilities.
- [x] Account creation and provider resolution use registered connectors.
- [x] IMAP credentials are encrypted and never exposed after submission.
- [x] Read-only IMAP supports folders, message lists, recent-message searches, and full message reads.
- [x] Yahoo, iCloud, Fastmail, Zoho, Proton Bridge, and custom IMAP setup are available.
- [x] Proton Bridge connections are restricted to loopback hosts.
- [x] Gmail and Outlook behavior remains covered.
- [x] Provider architecture documentation is complete.
- [x] `pnpm verify` passes.
