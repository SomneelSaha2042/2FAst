import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const targets = process.argv.slice(2)

if (targets.length === 0) {
	throw new Error('Pass at least one directory to clean.')
}

await Promise.all(
	targets.map((target) =>
		rm(resolve(target), {
			force: true,
			recursive: true,
		})
	)
)
