/**
 * Copies the web's app contract (the source of truth) and its sample payloads
 * into this app. Never edit the copies — edit src/lib/app-contract/ in the web
 * repo and re-run `npm run sync:contract`. The web suite's parity test fails
 * until the copies match byte for byte.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(appRoot, '..')

const CONTRACT_SOURCE = join(webRoot, 'src/lib/app-contract')
const CONTRACT_TARGET = join(appRoot, 'src/lib/contract')
const FIXTURE_SOURCE = join(webRoot, 'tests/fixtures/app-contract.ts')
const FIXTURE_TARGET = join(appRoot, 'src/fixtures/contract-fixtures.ts')

rmSync(CONTRACT_TARGET, { recursive: true, force: true })
mkdirSync(CONTRACT_TARGET, { recursive: true })
const files = readdirSync(CONTRACT_SOURCE).filter((name) => name.endsWith('.ts'))
for (const name of files) copyFileSync(join(CONTRACT_SOURCE, name), join(CONTRACT_TARGET, name))

mkdirSync(dirname(FIXTURE_TARGET), { recursive: true })
copyFileSync(FIXTURE_SOURCE, FIXTURE_TARGET)

console.log(`Synced ${files.length} contract files and the sample payloads.`)
