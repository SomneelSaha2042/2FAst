import type { IpcApi, PollStartPayload, PollStatus, StoredOtp } from '../shared/ipc-api'

declare global {
  interface Window {
    api: { [K in keyof IpcApi]: IpcApi[K] }
    events: {
      onOtpDetected: (listener: (otp: StoredOtp) => void) => () => void
      onOtpExpired: (listener: (otpId: string) => void) => () => void
      onPollStatus: (listener: (status: PollStatus) => void) => () => void
      onStartAccountPoll: (listener: (payload: PollStartPayload) => void) => () => void
    }
  }
}

export {}
