# AGENTS.md (Project Rules)

## Purpose

This document is the **non-negotiable ruleset** for every coding agent session (Codex, Claude Code, Cursor, etc.) working on the 2Fast project. Read it first, before any code.

---

## 1 — Golden rules

1. **Read before you write.** Before touching any file, read: (a) this page, (b) the PRD §8 (locked stack) + §9 (repo layout), (c) your current Phase page.
2. **pnpm only.** Never `npm install`, `npm run`, `yarn add`, or `yarn`. Always `pnpm add`, `pnpm run`, `pnpm install`.
3. **Run `pnpm verify` after every meaningful change.** The verify script runs `tsc --noEmit && eslint . && vitest run`. It must pass before you stop.
4. **Touch only files listed in your phase.** Do not create, modify, or delete files belonging to other phases unless explicitly told.
5. **No new dependencies without rationale.** Before adding any dependency, state a one-sentence justification in chat. Wait for approval.
6. **No native modules.** Anything requiring `node-gyp`, Python, or Windows Build Tools is banned. The sole exception is `better-sqlite3` (which ships prebuilt binaries via `prebuild-install`).
7. **Stop at the completion gate.** Each phase has a hard gate. When all boxes are ticked, stop. Do not start the next phase.

---

## 2 — TypeScript rules

- `"strict": true` in every `tsconfig.json`. No exceptions.
- No `any` types. Use `unknown` + type guards if the type is truly unknown.
- No `// @ts-ignore` or `// @ts-expect-error` without a comment explaining why.
- Prefer `interface` over `type` for object shapes.
- Use `readonly` for properties that should not be mutated.
- All exported functions must have JSDoc with `@param` and `@returns`.

---

## 3 — Electron security rules

- `contextIsolation: true` — always.
- `nodeIntegration: false` — always.
- `sandbox: true` — on all renderer `BrowserWindow`s.
- All main↔renderer communication goes through `contextBridge.exposeInMainWorld` in the preload script.
- Never expose Node APIs (fs, child_process, etc.) to the renderer.
- Validate all IPC inputs in the main process handler. Never trust renderer-supplied data.
- HTML email bodies must be rendered in a sandboxed `<iframe>` or `<webview>` with `sandbox` attribute. Never inject HTML email content directly into the React DOM.

---

## 4 — Git conventions

- Branch naming: `phase-<N>/<short-description>` (e.g. `phase-1/scaffold`)
- Commit messages: `phase <N>: <imperative verb> <what>` (e.g. `phase 1: add vite config for renderer`)
- One commit per logical change. No mega-commits.
- Squash merge to `main` at the end of each phase.

---

## 5 — File organisation

- Follow the repo layout in PRD §9 exactly.
- Main process code lives in `src/main/`.
- Preload code lives in `src/preload/`.
- Renderer (React) code lives in `src/renderer/`.
- Shared types live in `src/shared/`. Never import from `main/` in `renderer/` or vice versa.
- Tests mirror source structure under `tests/unit/`.

---

## 6 — IPC contract rules

- All IPC channels are defined as a TypeScript interface in `src/shared/ipc-api.ts`.
- Channel names use the format `provider:action` (e.g. `gmail:listMessages`, `outlook:sendMail`, `accounts:add`).
- The preload script exposes a typed `window.api` object that mirrors the IPC interface.
- Main process handlers validate inputs with runtime checks before processing.

---

## 7 — Testing rules

- Unit tests use Vitest.
- Every exported function in `src/main/` must have at least one unit test.
- Test files are named `<module>.test.ts` and live in `tests/unit/` mirroring the source path.
- Mock external APIs (Gmail, Graph) — never make real network calls in tests.
- `pnpm verify` must pass. This includes type-check + lint + tests.

---

## 8 — Dependency rules

Allowed dependencies (no approval needed):

| Package | Purpose |
| --- | --- |
| `electron` | Runtime |
| `react`, `react-dom` | UI |
| `vite`, `@vitejs/plugin-react` | Renderer build |
| `typescript` | Language |
| `tailwindcss`, `@tailwindcss/vite` | Styling |
| `googleapis` | Gmail API |
| `@azure/msal-node` | Microsoft auth |
| `@microsoft/microsoft-graph-client` | Graph API |
| `electron-store` | JSON config store |
| `better-sqlite3` | Local cache DB |
| `vitest` | Testing |
| `eslint`, `prettier` | Linting |
| `electron-builder` | Packaging |

Anything else requires a one-sentence justification before adding.

---

## 9 — Error handling

- All IPC handlers must wrap their body in try/catch and return structured `{ success, data, error }` responses.
- Never let unhandled exceptions crash the main process. Use `process.on('uncaughtException')` as a safety net with logging.
- Log errors with enough context to debug (account ID, provider, operation, error message). Never log tokens or secrets.

---

## 10 — The `pnpm verify` script

Add this to root `package.json`:

```json
"scripts": {
  "verify": "tsc --noEmit && eslint . && vitest run"
}
```

This is your single source of truth for "is the code valid?". Run it after every meaningful change. It must pass before any phase gate can be checked off.