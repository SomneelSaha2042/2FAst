import type { IpcApi } from '../shared/ipc-api'

declare global {
  interface Window {
    api: { [K in keyof IpcApi]: IpcApi[K] }
  }
}

export {}
