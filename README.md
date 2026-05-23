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
pnpm exec electron-builder
```

## License
MIT
