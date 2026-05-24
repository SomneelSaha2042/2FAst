# 2Fast Beta Release Checklist

## Automated Gate
- `pnpm verify` passes on Windows, macOS, and Linux.
- `pnpm build` produces a clean `dist` directory.
- Release workflow uploads Windows NSIS, macOS DMG, and Linux AppImage artifacts.

## Manual Smoke Test
- Launch packaged app and confirm it stays tray-first with no visible startup window.
- Add or reconnect Gmail and Outlook accounts.
- Verify multi-account listing and account removal.
- Trigger an OTP scan and confirm detection and copy still work.
- Confirm no poll log file appears by default.
- Confirm no auto-update check runs.

## Artifact Sizes
| Platform | Artifact | Size |
| --- | --- | --- |
| Windows | NSIS x64 | 99.63 MB |
| macOS | DMG x64/arm64 | TBD |
| Linux | AppImage x64 | TBD |
