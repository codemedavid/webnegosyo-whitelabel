#!/usr/bin/env node
// Prints every migration that is not fully live on the platform database,
// from supabase/migration-status.json, plus any file that has no status yet.
//   npm run db:status
// The ledger is kept by hand (a migration moves to `applied` once it has been
// applied AND its objects probed live); this script only reads it. It exits 1
// when a migration file is missing from the ledger, so it can gate a release.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ledger = JSON.parse(readFileSync(join(root, 'supabase/migration-status.json'), 'utf8'))
const files = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()

const applied = new Set(ledger.applied)
const notApplied = ledger.notApplied ?? {}
const expected = ledger.expected ?? {}
const undeclared = files.filter((name) => !applied.has(name) && !(name in notApplied) && !(name in expected))

const line = (name, entry) => `  ${entry.status.toUpperCase().padEnd(10)} ${name}\n             ${entry.gate ?? entry.note ?? ''}`.trimEnd()

console.log(`Migrations: ${files.length} files, ${applied.size} live (checked ${ledger.verifiedOn}).\n`)

const waiting = Object.entries(notApplied)
console.log(waiting.length ? 'Not fully live:' : 'Every listed migration is live.')
for (const [name, entry] of waiting) console.log(line(name, entry))

const arriving = Object.entries(expected).filter(([name]) => files.includes(name) && expected[name].status !== 'applied')
if (arriving.length) {
  console.log('\nLanded from a branch and still waiting:')
  for (const [name, entry] of arriving) console.log(line(name, entry))
}

const liveOnly = Object.entries(ledger.liveOnly ?? {})
if (liveOnly.length) {
  console.log('\nLive with no file on this branch:')
  for (const [name, entry] of liveOnly) console.log(`  ${name} (${entry.liveVersion}): ${entry.note}`)
}

if (undeclared.length) {
  console.log('\nNo status recorded (add each to supabase/migration-status.json):')
  for (const name of undeclared) console.log(`  ${name}`)
  process.exit(1)
}
