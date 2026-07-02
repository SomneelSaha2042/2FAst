import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'

const appName = '2Fast'

const pathExists = async (path) => {
	try {
		await access(path, constants.F_OK)
		return true
	} catch {
		return false
	}
}

const findRcedit = async () => {
	const roots = [resolve('node_modules/.pnpm'), resolve('node_modules')]
	for (const root of roots) {
		if (!(await pathExists(root))) {
			continue
		}
		const stack = [root]
		while (stack.length > 0) {
			const current = stack.pop()
			if (!current) {
				continue
			}
			const entries = await readdir(current, { withFileTypes: true })
			for (const entry of entries) {
				const child = join(current, entry.name)
				if (entry.isFile() && entry.name.toLowerCase() === 'rcedit.exe') {
					return child
				}
				if (entry.isDirectory() && entry.name !== '.cache') {
					stack.push(child)
				}
			}
		}
	}
	throw new Error('Unable to find rcedit.exe in node_modules.')
}

const runRcedit = async (rceditPath, exePath, iconPath) =>
	new Promise((resolvePromise, rejectPromise) => {
		execFile(
			rceditPath,
			[
				exePath,
				'--set-icon',
				iconPath,
				'--set-version-string',
				'FileDescription',
				appName,
				'--set-version-string',
				'ProductName',
				appName,
				'--set-version-string',
				'CompanyName',
				'2Fast contributors',
				'--set-version-string',
				'OriginalFilename',
				'2Fast.exe',
				'--set-version-string',
				'InternalName',
				appName,
			],
			(error) => {
				if (error) {
					rejectPromise(error)
					return
				}
				resolvePromise()
			}
		)
	})

export default async function afterPack(context) {
	if (context.electronPlatformName !== 'win32') {
		return
	}

	const exePath = join(context.appOutDir, '2Fast.exe')
	const iconPath = resolve('assets/icon.ico')
	const rceditPath = await findRcedit()
	await runRcedit(rceditPath, exePath, iconPath)
}
