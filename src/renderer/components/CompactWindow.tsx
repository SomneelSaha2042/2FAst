import type { ReactElement, ReactNode } from 'react'

interface CompactWindowProps {
	readonly title: string
	readonly onMinimize: () => void
	readonly onClose: () => void
	readonly children: ReactNode
}

/**
 * Renders compact frameless-style window layout.
 * @param props Layout properties.
 * @returns Compact window shell.
 */
export default function CompactWindow(props: CompactWindowProps): ReactElement {
	return (
		<main style={{ minHeight: '100vh', background: '#f2f6fb', color: '#0f172a', fontFamily: '"Segoe UI", sans-serif' }}>
			<header style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: '#111827', color: '#e2e8f0', ['WebkitAppRegion' as string]: 'drag' }}>
				<strong style={{ fontSize: 13, letterSpacing: 0.2 }}>2Fast</strong>
				<div style={{ display: 'flex', gap: 6, ['WebkitAppRegion' as string]: 'no-drag' }}>
					<button type="button" onClick={props.onMinimize} style={{ border: '1px solid #334155', background: '#1f2937', color: '#e2e8f0', borderRadius: 6, width: 24, height: 22, cursor: 'pointer' }}>-</button>
					<button type="button" onClick={props.onClose} style={{ border: '1px solid #334155', background: '#1f2937', color: '#e2e8f0', borderRadius: 6, width: 24, height: 22, cursor: 'pointer' }}>x</button>
				</div>
			</header>
			<section style={{ padding: 12 }}>
				<h1 style={{ margin: '0 0 10px', fontSize: 18 }}>{props.title}</h1>
				{props.children}
			</section>
		</main>
	)
}
