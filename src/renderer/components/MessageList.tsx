import type { ReactElement } from 'react'

interface MessageListProps {
	readonly [key: string]: unknown
}

/**
 * Deprecated in tray-first mode.
 * @param _props Legacy props.
 * @returns Placeholder element.
 */
export default function MessageList(_props: MessageListProps): ReactElement {
	void _props
	return <></>
}
