import { access, cp, mkdir, readFile, readdir } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

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

const copyMissingDependencies = async (projectDir, appOutDir) => {
	const rootPkgPath = join(projectDir, 'package.json')
	const rootPkg = JSON.parse(await readFile(rootPkgPath, 'utf-8'))
	const prodDeps = Object.keys(rootPkg.dependencies || {})

	const visited = new Set()
	const toVisit = [...prodDeps]
	const rootNodeModules = join(projectDir, 'node_modules')

	while (toVisit.length > 0) {
		const dep = toVisit.pop()
		if (!dep || visited.has(dep)) continue
		visited.add(dep)

		const pkgJsonPath = join(rootNodeModules, dep, 'package.json')
		if (existsSync(pkgJsonPath)) {
			try {
				const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8'))
				const subDeps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) }
				for (const sub of Object.keys(subDeps)) {
					if (!visited.has(sub)) {
						toVisit.push(sub)
					}
				}
			} catch {
				// Ignore JSON parse errors for non-standard packages
			}
		}
	}

	const targetNodeModules = join(appOutDir, 'resources', 'app', 'node_modules')
	if (!(await pathExists(targetNodeModules))) {
		return
	}

	for (const dep of visited) {
		const source = join(rootNodeModules, dep)
		const target = join(targetNodeModules, dep)
		if (existsSync(source) && !existsSync(target)) {
			await mkdir(dirname(target), { recursive: true })
			await cp(source, target, { recursive: true, dereference: true })
		}
	}
}

const runRceditIfAvailable = async (appOutDir) => {
	try {
		const exePath = join(appOutDir, '2Fast.exe')
		const iconPath = resolve('assets/2FAst.ico')
		if (!(await pathExists(iconPath)) || !(await pathExists(exePath))) {
			return
		}
		const rceditPath = await findRcedit()
		await runRcedit(rceditPath, exePath, iconPath)
	} catch {
		// Non-fatal if rcedit is not available
	}
}

export default async function afterPack(context) {
	const projectDir = context.packager?.projectDir || process.cwd()
	await copyMissingDependencies(projectDir, context.appOutDir)

	if (context.electronPlatformName === 'win32') {
		await runRceditIfAvailable(context.appOutDir)
	}
}
