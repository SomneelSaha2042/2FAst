import { Menu, shell } from 'electron'

/**
 * Builds the top application menu.
 * @returns Electron Menu instance.
 */
export function buildAppMenu(): Menu {
	return Menu.buildFromTemplate([
		{
			label: '2Fast',
			submenu: [
				{ role: 'about' },
				{ type: 'separator' },
				{ role: 'quit' },
			],
		},
		{
			label: 'Edit',
			submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'copy' }, { role: 'paste' }],
		},
		{
			label: 'Window',
			submenu: [{ role: 'minimize' }, { role: 'close' }],
		},
		{
			label: 'Help',
			submenu: [
				{
					label: 'Project Page',
					click: () => {
						void shell.openExternal('https://github.com')
					},
				},
			],
		},
	])
}
