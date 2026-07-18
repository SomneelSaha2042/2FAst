import React, { ReactElement, useCallback, useEffect, useState } from 'react'
import type { OtpResult, PollStartPayload } from '../shared/ipc-api'
import { getApi, getEvents, pollPayloadFromLocation, formatTimestamp, WindowChrome, automaticPollScans, providerLabel, PollState, pollPayloadKey, openRecentEmailsWindow } from './shared'
function PollView(): ReactElement {
	const [target, setTarget] = useState<PollStartPayload | null>(pollPayloadFromLocation())
	const [scanState, setScanState] = useState<PollState>('idle')
	const [candidates, setCandidates] = useState<readonly OtpResult[]>([])
	const [copiedCode, setCopiedCode] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const runScan = useCallback(async (
		payload: PollStartPayload,
		options?: { readonly force?: boolean }
	): Promise<void> => {
		const key = pollPayloadKey(payload)
		if (!options?.force && (automaticPollScans.activeKeys.has(key) || automaticPollScans.completedKeys.has(key))) {
			return
		}
		const api = getApi()
		if (!api) {
			setError('Preload bridge unavailable.')
			setScanState('error')
			return
		}
		automaticPollScans.activeKeys.add(key)
		if (options?.force) {
			automaticPollScans.completedKeys.delete(key)
		}
		setScanState('scanning')
		setCopiedCode(null)
		setError(null)
		let result: Awaited<ReturnType<Window['api']['poll:scanAccount']>>
		try {
			result = await api['poll:scanAccount'](payload.accountId)
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Failed to inspect latest emails'
			setError(message.includes('No handler registered') ? 'Restart 2Fast to load the latest polling handler.' : message)
			setScanState('error')
			automaticPollScans.activeKeys.delete(key)
			return
		}
		if (!result.success || !result.data) {
			setError(result.error ?? 'Failed to inspect latest emails')
			setScanState('error')
			automaticPollScans.activeKeys.delete(key)
			return
		}
		setCandidates(result.data)
		setScanState('complete')
		automaticPollScans.completedKeys.add(key)
		automaticPollScans.activeKeys.delete(key)
	}, [])

	useEffect(() => {
		const startAutomaticScan = (payload: PollStartPayload): void => {
			setTarget(payload)
			setCandidates([])
			setScanState('idle')
			setCopiedCode(null)
			setError(null)
			void runScan(payload, { force: true })
		}
		const initial = pollPayloadFromLocation()
		if (initial) {
			startAutomaticScan(initial)
		}
		const events = getEvents()
		if (!events) return undefined
		return events.onStartAccountPoll(startAutomaticScan)
	}, [runScan])

	const copyCandidate = async (candidate: OtpResult): Promise<void> => {
		try {
			await navigator.clipboard.writeText(candidate.code)
			setCopiedCode(candidate.code)
		} catch (clipboardError) {
			setError(clipboardError instanceof Error ? clipboardError.message : 'Failed to copy code')
			setScanState('error')
		}
	}

	const title = target ? `${providerLabel(target.provider)}` : 'OTP Check'
	const copiedCandidateLabel = (candidate: OtpResult): string => copiedCode === candidate.code ? 'Copied' : 'Copy code'

	return (
		<WindowChrome title={title} subtitle={target?.email} view="poll">
			<div className="flex flex-1 mt-8 h-[calc(520px-32px)] overflow-hidden">
				{/* SideNavBar (Compact version for Tray OTP feed) */}
				<nav className="h-full w-12 fixed left-0 top-8 bg-surface-container-low border-r border-surface-container-highest flex flex-col items-center py-4 gap-4 z-40 shrink-0 select-none">
					<button
						type="button"
						disabled={scanState === 'scanning'}
						title="Scan Feed"
						className="w-8 h-8 flex items-center justify-center text-primary bg-surface-variant rounded transition-all duration-200 border border-outline/20 cursor-pointer disabled:opacity-50"
						onClick={() => {
							if (target) void runScan(target, { force: true })
						}}
					>
						<span className="material-symbols-outlined text-[18px]">lock_open</span>
					</button>
					<button
						type="button"
						title="Open Settings"
						className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-variant rounded transition-all duration-200 cursor-pointer"
						onClick={() => {
							const api = getApi()
							if (api) void api['window:openSettings']()
						}}
					>
						<span className="material-symbols-outlined text-[18px]">settings</span>
					</button>
				</nav>

				{/* Main Content Area */}
				<main className="ml-12 mt-8 flex-1 flex flex-col p-4 overflow-y-auto relative bg-background text-left">
					{/* Header Section */}
					<div className="mb-4 flex flex-col gap-1">
						<div className="flex items-center gap-2 text-primary font-body-sm">
							<span className="text-secondary">~/2Fast/feed</span>
							<span className="text-on-surface-variant">$</span>
							<span>./scan --service={target ? target.provider : 'mail'}</span>
						</div>
					</div>

					{/* Scan states representation */}
					<div className="space-y-3 shrink-0">
						{scanState === 'scanning' && (
							<div className="warp-block rounded p-4 mb-6 relative overflow-hidden">
								<div className="flex items-start gap-3">
									<div className="text-primary mt-0.5">
										<span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
									</div>
									<div className="flex-1">
										<p className="font-body-sm text-on-surface flex items-center gap-2">
											Scanning Feed
											<span className="w-1.5 h-3.5 bg-primary terminal-blink inline-block"></span>
										</p>
										<p className="font-body-sm text-outline mt-1 text-[11px]">Inspecting latest emails...</p>
									</div>
								</div>
								{/* Progress Bar */}
								<div className="mt-3 h-[2px] w-full bg-surface-container-highest overflow-hidden">
									<div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: '45%' }}></div>
								</div>
							</div>
						)}

						{scanState === 'idle' && (
							<div className="warp-block rounded p-4 mb-6 relative overflow-hidden">
								<div className="flex items-start gap-3">
									<div className="text-primary mt-0.5">
										<span className="material-symbols-outlined text-[18px]">mail</span>
									</div>
									<div className="flex-1">
										<p className="font-body-sm text-on-surface flex items-center gap-2">Ready to Scan</p>
										<p className="font-body-sm text-outline mt-1 text-[11px]">Waiting for account query trigger...</p>
									</div>
								</div>
								{/* Progress Bar */}
								<div className="mt-3 h-[2px] w-full bg-surface-container-highest overflow-hidden">
									<div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: '0%' }}></div>
								</div>
							</div>
						)}

						{scanState === 'complete' && candidates.length === 0 && (
							<div className="warp-block rounded p-4 mb-6 relative overflow-hidden">
								<div className="flex items-start gap-3">
									<div className="text-primary mt-0.5">
										<span className="material-symbols-outlined text-[18px]">warning</span>
									</div>
									<div className="flex-1">
										<p className="font-body-sm text-on-surface flex items-center gap-2">No codes found</p>
										<p className="font-body-sm text-outline mt-1 text-[11px]">No OTPs matched in the latest 5 emails</p>
									</div>
								</div>
								{/* Progress Bar */}
								<div className="mt-3 h-[2px] w-full bg-surface-container-highest overflow-hidden">
									<div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: '100%' }}></div>
								</div>
							</div>
						)}

						{scanState === 'error' && (
							<div className="flex flex-col gap-2">
								<div className="warp-block rounded p-4 mb-6 relative overflow-hidden border-l-2 border-l-error">
									<div className="flex items-start gap-3">
										<div className="text-error mt-0.5">
											<span className="material-symbols-outlined text-[18px]">error</span>
										</div>
										<div className="flex-1">
											<p className="font-body-sm text-on-surface flex items-center gap-2">Scan failed</p>
											<p className="font-body-sm text-red-300 mt-1 text-[11px] truncate max-w-[200px]">{error || 'Something went wrong'}</p>
										</div>
									</div>
								</div>
								{(error?.toLowerCase().includes('reconnect') || error?.toLowerCase().includes('expired')) && (
									<button
										type="button"
										className="w-full py-2 bg-secondary-container text-secondary border border-secondary font-body-sm rounded hover:bg-surface-variant transition-colors cursor-pointer"
										onClick={() => {
											const api = getApi()
											if (api) void api['window:openSettings']()
										}}
									>
										Open Settings to Reconnect
									</button>
								)}
							</div>
						)}
					</div>

					{/* Candidates list */}
					<div className="flex-1 flex flex-col gap-2 mt-4 min-h-0">
						<div className="flex items-center justify-between mb-2 shrink-0">
							<button type="button" onClick={() => void openRecentEmailsWindow()} className="text-[10px] text-primary hover:underline cursor-pointer select-none">
								Missed an OTP? View recent emails
							</button>
							<span className="text-[11px] font-label-md select-none text-secondary/80">LIVE</span>
						</div>

						<div className="space-y-1.5 overflow-y-auto pr-1 flex-1 min-h-0">
							{candidates.map((candidate, idx) => (
								<div
									key={`${candidate.source.messageId}-${candidate.code}-${idx}`}
									className={`rounded p-3 flex items-center justify-between transition-all group cursor-pointer ${
										idx === 0 ? 'warp-block-active' : 'warp-block opacity-80 hover:opacity-100'
									}`}
								>
									<div className="flex flex-col gap-1 min-w-0">
										<span className={`font-code-otp text-code-otp leading-tight select-text ${idx === 0 ? 'text-primary' : 'text-on-surface-variant'}`}>{candidate.code}</span>
										<div className="flex items-center gap-1.5 min-w-0 max-w-[170px]">
											<span className="font-body-sm text-outline text-[11px] truncate">{candidate.source.sender}</span>
											{candidate.source.folder && <span className="px-1 py-[1px] bg-surface-container-highest text-[9px] text-outline rounded uppercase tracking-wider shrink-0">{candidate.source.folder}</span>}
										</div>
										<span className="font-body-sm text-outline/60 text-[9px] truncate max-w-[170px]">{formatTimestamp(candidate.source.receivedAt)}</span>
									</div>
									<button
										type="button"
										title={copiedCandidateLabel(candidate)}
										aria-label={copiedCandidateLabel(candidate)}
										className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer p-1.5 rounded hover:bg-surface-container-highest shrink-0"
										onClick={() => void copyCandidate(candidate)}
									>
										<span className="material-symbols-outlined text-[18px]">
											{copiedCode === candidate.code ? 'check' : 'content_copy'}
										</span>
									</button>
								</div>
							))}
							{candidates.length === 0 && (
								<p className="font-body-sm text-outline text-center py-6 select-none bg-surface-container/10 border border-outline-variant/10 rounded">Candidates will appear here after scanning.</p>
							)}
						</div>
					</div>

					{/* Scan Trigger Button */}
					{target && (
						<div className="mt-4 shrink-0">
							<button
								type="button"
								disabled={scanState === 'scanning'}
								className="w-full h-10 bg-surface-container-high border border-outline/20 text-on-surface font-body-sm rounded flex items-center justify-center gap-2 hover:bg-surface-bright transition-all cursor-pointer disabled:opacity-50"
								onClick={() => void runScan(target, { force: true })}
							>
								<span className="material-symbols-outlined text-[16px]">sync</span>
								Scan Again
							</button>
						</div>
					)}
				</main>
			</div>
		</WindowChrome>
	)
}

export default PollView