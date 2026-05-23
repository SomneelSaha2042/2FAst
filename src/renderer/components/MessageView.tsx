import type { ReactElement } from 'react'

interface MessageViewProps {
	readonly [key: string]: unknown
}

/**
 * Deprecated in tray-first mode.
 * @param _props Legacy props.
 * @returns Placeholder element.
 */
export default function MessageView(_props: MessageViewProps): ReactElement {
	void _props
	return <></>
}
