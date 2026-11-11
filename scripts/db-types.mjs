#!/usr/bin/env node
// Database types generated from the LIVE platform schema.
//   npm run db:types         rewrite src/types/database.generated.ts
//   npm run db:types:check   regenerate in memory; exit 1 (with a short summary)
//                            when it differs from the committed file
//
// Needs the Supabase CLI, logged in (`supabase login`) with access to the
// platform project. Reads the schema only; never writes to the database.
// Only `public` is generated: it is the one schema the app reaches through
// PostgREST (`reporting` and the rest are not exposed).
//
// Local only for now: the check is not in CI because it needs a Supabase
// token there.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const GENERATED_PATH = 'src/types/database.generated.ts'
// The platform project (NEXT_PUBLIC_SUPABASE_URL of production).
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'tjcmkstsuhqdwkfdrxan'
const SCHEMAS = ['public']

export const HEADER = [
  '// GENERATED FILE: do not edit by hand. Generated from the live platform schema.',
  '// Regenerate: npm run db:types (scripts/db-types.mjs runs',
  `//   supabase gen types typescript --project-id <platform ref> ${SCHEMAS.map((s) => `--schema ${s}`).join(' ')})`,
  '// Drift check: npm run db:types:check',
  "// New code types rows from here: Tables<'orders'>, TablesInsert<'orders'>, ...",
  '',
  '',
].join('\n')

function generate() {
  const args = ['gen', 'types', 'typescript', '--project-id', PROJECT_REF, ...SCHEMAS.flatMap((s) => ['--schema', s])]
  const run = spawnSync('supabase', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.error) {
    console.error(`Could not run the Supabase CLI: ${run.error.message}`)
    process.exit(2)
  }
  if (run.status !== 0 || !run.stdout.includes('export type Database')) {
    const why = `${run.stdout}\n${run.stderr}`
      .split('\n')
      .filter((line) => line.trim() && !/new version|recommend updating/i.test(line))
      .join('\n')
    console.error(`supabase gen types failed (exit ${run.status}):\n${why}`)
    process.exit(2)
  }
  return HEADER + run.stdout.replace(/\s+$/, '') + '\n'
}

/** Top-level entries (tables, views, functions, enums) with their text, per section. */
function entities(source) {
  const found = new Map()
  let section = null
  let name = null
  let body = []
  const flush = () => {
    if (section && name) found.set(`${section} ${name}`, body.join('\n'))
    name = null
    body = []
  }
  for (const line of source.split('\n')) {
    const sectionMatch = /^ {4}(Tables|Views|Functions|Enums|CompositeTypes): \{/.exec(line)
    if (sectionMatch) {
      flush()
      section = sectionMatch[1]
      continue
    }
    if (/^ {4}\}/.test(line)) {
      flush()
      section = null
      continue
    }
    const entryMatch = section && /^ {6}([A-Za-z0-9_]+):/.exec(line)
    if (entryMatch) {
      flush()
      name = entryMatch[1]
    }
    if (name) body.push(line)
  }
  flush()
  return found
}

export function summarize(committed, fresh) {
  const before = entities(committed)
  const after = entities(fresh)
  const lines = []
  for (const [key, text] of after) {
    if (!before.has(key)) lines.push(`  + ${key}`)
    else if (before.get(key) !== text) lines.push(`  ~ ${key}`)
  }
  for (const key of before.keys()) if (!after.has(key)) lines.push(`  - ${key}`)
  return lines.sort((a, b) => a.slice(4).localeCompare(b.slice(4)))
}

function main() {
  const target = join(ROOT, GENERATED_PATH)
  const fresh = generate()
  if (!process.argv.includes('--check')) {
    writeFileSync(target, fresh)
    console.log(`Wrote ${GENERATED_PATH} (${fresh.split('\n').length - 1} lines).`)
    return
  }
  // Compared in memory: the committed file is never touched by --check.
  let committed = ''
  try {
    committed = readFileSync(target, 'utf8')
  } catch {
    console.error(`${GENERATED_PATH} is missing. Run npm run db:types.`)
    process.exit(1)
  }
  if (committed === fresh) {
    console.log(`${GENERATED_PATH} matches the live schema.`)
    return
  }
  const changes = summarize(committed, fresh)
  console.error(`${GENERATED_PATH} differs from the live schema (+ added, ~ changed, - removed):`)
  console.error(changes.length ? changes.join('\n') : '  (formatting or header only)')
  console.error('Run npm run db:types and commit the result.')
  process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
