import { Notification, clipboard } from 'electron'
import type { StoredOtp } from './otp-store.js'

export interface OtpActionOptions {
	readonly autoCopyToClipboard: boolean
	readonly showNotifications: boolean
	readonly soundEnabled: boolean
	readonly onDetected: (otp: StoredOtp) => void
}

/**
 * Executes side-effects after OTP detection.
 * @param otp Stored OTP entry.
 * @param options User-configured action options.
 * @returns Void.
 */
export function handleOtpDetected(otp: StoredOtp, options: OtpActionOptions): void {
	if (options.autoCopyToClipboard) {
		clipboard.writeText(otp.code)
	}

	if (options.showNotifications) {
		const notification = new Notification({
			title: `OTP: ${otp.code}`,
			body: `From: ${otp.source.sender} - ${otp.source.subject}`,
			silent: !options.soundEnabled,
			urgency: 'critical',
		})
		notification.show()
	}

	options.onDetected(otp)
}
