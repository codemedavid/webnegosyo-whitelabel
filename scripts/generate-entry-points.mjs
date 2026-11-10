#!/usr/bin/env node

/**
 * Writes `docs/generated/entry-points.md`: the table of every API route and
 * server action declared through `defineRoute` / `defineAction`, who may call
 * it and its limit. Read from source (`scripts/lib/entry-points.mjs`).
 *
 *   node scripts/generate-entry-points.mjs          # rewrite the document
 *   node scripts/generate-entry-points.mjs --check  # exit 1 when it is stale
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeEntryPoints, renderEntryPointsDoc } from './lib/entry-points.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'docs', 'generated', 'entry-points.md')
const rendered = renderEntryPointsDoc(analyzeEntryPoints(root))

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : ''
  if (current !== rendered) {
    console.error('docs/generated/entry-points.md is stale. Run: node scripts/generate-entry-points.mjs')
    process.exit(1)
  }
  console.log('docs/generated/entry-points.md is current.')
} else {
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, rendered)
  console.log(`Wrote ${path.relative(root, target)}`)
}
