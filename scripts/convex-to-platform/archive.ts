/**
 * Snapshot folders live OUTSIDE the repo (they hold customer names and
 * phones): `~/Documents/whitelabel-archive/convex-exports/<slug>-<date>/`,
 * or `$CONVEX_IMPORT_ARCHIVE`. Folders and files are private to the user.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { snapshotFromTables, tableNameFromEntry, type ConvexSnapshot } from '@/lib/convex-import'

export function archiveRoot(): string {
  return process.env.CONVEX_IMPORT_ARCHIVE || path.join(homedir(), 'Documents', 'whitelabel-archive', 'convex-exports')
}

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

function privateDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
}

export function writePrivate(file: string, content: string | Uint8Array) {
  writeFileSync(file, content, { mode: 0o600 })
  chmodSync(file, 0o600)
}

/** A new folder for an export: `<slug>-<date>`, or `<slug>-<date>-<n>` when that one exists. */
export function newExportDir(slug: string, suffix = ''): string {
  const root = archiveRoot()
  privateDir(root)
  const base = `${slug}-${today()}${suffix}`
  let dir = path.join(root, base)
  for (let n = 2; existsSync(dir); n++) dir = path.join(root, `${base}-${n}`)
  privateDir(dir)
  return dir
}

/** The newest import export of a store (not a delta folder). */
export function latestExportDir(slug: string): string {
  const root = archiveRoot()
  const pattern = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}(-\\d+)?$`)
  const candidates = existsSync(root)
    ? readdirSync(root)
        .filter((name) => pattern.test(name) && existsSync(path.join(root, name, 'snapshot.zip')))
        .map((name) => path.join(root, name))
        .sort((a, b) => statSync(path.join(b, 'snapshot.zip')).mtimeMs - statSync(path.join(a, 'snapshot.zip')).mtimeMs)
    : []
  if (candidates.length === 0) throw new Error(`No export for ${slug} under ${root}; run: export ${slug}`)
  return candidates[0]
}

function convexCliMain(): string {
  return path.join(path.dirname(require.resolve('convex/package.json')), 'bin', 'main.js')
}

export interface ExportResult {
  ok: boolean
  output: string
  zipBytes: number
}

/**
 * `convex export` into `dir/snapshot.zip` with only the deploy key in the
 * child's environment (never the parent's CONVEX_* settings). The key is
 * scrubbed from anything echoed back.
 */
export function runConvexExport(dir: string, deployKey: string): ExportResult {
  writePrivate(path.join(dir, 'package.json'), JSON.stringify({ name: 'convex-export', private: true, dependencies: { convex: '*' } }, null, 2))
  const result = spawnSync(process.execPath, [convexCliMain(), 'export', '--path', 'snapshot.zip'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? homedir(), CONVEX_DEPLOY_KEY: deployKey } as unknown as NodeJS.ProcessEnv,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(deployKey).join('***')
  const zip = path.join(dir, 'snapshot.zip')
  const ok = result.status === 0 && existsSync(zip)
  if (existsSync(zip)) chmodSync(zip, 0o600)
  return { ok, output: output.trim(), zipBytes: existsSync(zip) ? statSync(zip).size : 0 }
}

/** Reads `dir/snapshot.zip` (or an unzipped `dir/tables/`) into a snapshot. */
export function loadSnapshot(dir: string): ConvexSnapshot {
  const zip = path.join(dir, 'snapshot.zip')
  const files: Record<string, string> = {}
  if (existsSync(zip)) {
    const entries = unzipSync(new Uint8Array(readFileSync(zip)))
    for (const [entry, bytes] of Object.entries(entries)) {
      const table = tableNameFromEntry(entry)
      if (table) files[table] = strFromU8(bytes)
    }
  } else {
    const tables = path.join(dir, 'tables')
    for (const table of readdirSync(tables)) {
      const file = path.join(tables, table, 'documents.jsonl')
      if (existsSync(file)) files[table] = readFileSync(file, 'utf8')
    }
  }
  return snapshotFromTables(files)
}
