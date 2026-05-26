import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const electronBuilderCliPath = require.resolve('electron-builder/cli.js')

const child = spawn(process.execPath, [electronBuilderCliPath, '--publish', 'never'], {
	env: {
		...process.env,
		ELECTRON_BUILDER_DISABLE_BUILD_CACHE: 'true',
	},
	stdio: 'inherit',
})

child.on('exit', (code, signal) => {
	if (signal !== null) {
		process.kill(process.pid, signal)
		return
	}

	process.exit(code ?? 1)
})

child.on('error', (error) => {
	console.error(error)
	process.exit(1)
})
