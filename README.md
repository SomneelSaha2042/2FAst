# 2Fast

2Fast is a lightweight desktop OTP polling utility for Gmail and Outlook.

## Features
- Multi-account Gmail and Outlook linking
- On-demand OTP polling per account
- OTP extraction with confidence scoring
- Auto-copy to clipboard
- Native notifications
- Tray-first workflow with compact popover window
- Recent OTP history with expiry
- Settings for polling, notifications, startup, and sender allowlist

## Prerequisites
- Node.js 22+
- pnpm

## Google BYOC setup
Follow the in-app Gmail setup guide and Google OAuth desktop app docs:
https://developers.google.com/identity/protocols/oauth2/native-app

## Microsoft setup
Use a public client app registration and delegated Graph permissions.

## Development
```bash
pnpm install
pnpm dev
pnpm verify
```

## Build
```bash
pnpm build
pnpm dist
```

## Beta release notes
- First beta target: `v0.9.0-beta.1`
- Release artifacts are unsigned for Windows, macOS, and Linux.
- Updates are manual for this beta. Download and install the newer artifact from the release page.
- macOS and Windows may show security prompts because the beta is unsigned.
- Poll debug logs are off by default. Set `TWOFAST_DEBUG_POLL=1` before launching the app to write redacted poll logs to the app log directory.
- Release checklist: [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md)
- API scope index: [`docs/API_SCOPE_INDEX.md`](docs/API_SCOPE_INDEX.md)

## License
MIT
