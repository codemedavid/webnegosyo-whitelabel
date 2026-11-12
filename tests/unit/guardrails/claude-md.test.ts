/**
 * The root CLAUDE.md is loaded on every turn of every Claude Code session, so
 * it holds only the rules for every change and a table of where each feature's
 * rules live. A feature's own rules sit in a CLAUDE.md beside its code and load
 * when that folder is worked on. This test keeps that split from eroding:
 * the root stays small, every file it points at exists, and no feature file is
 * left out of the table.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const ROOT_FILE = path.join(ROOT, 'CLAUDE.md')
// About 6,500 tokens. Before the split (2026-11-11) the file was 83,913 bytes.
const ROOT_BUDGET_BYTES = 26_000
const SEARCHED = ['src', 'webnegosyo-app', 'convex-template', 'mobile']
const SKIPPED = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'android', 'ios'])
// A pointer file in a sibling folder: it names the real file instead of holding rules.
const POINTER_MARK = "Rules for this folder live beside the feature's engine"

function findClaudeFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIPPED.has(name)) continue
    const full = path.join(dir, name)
    const stats = statSync(full)
    if (stats.isDirectory()) findClaudeFiles(full, found)
    else if (name === 'CLAUDE.md') found.push(path.relative(ROOT, full))
  }
  return found
}

const rootText = readFileSync(ROOT_FILE, 'utf8')
const linked = [...rootText.matchAll(/`([^`\s]+\/CLAUDE\.md)`/g)].map((match) => match[1])
const nested = SEARCHED.flatMap((dir) => findClaudeFiles(path.join(ROOT, dir))).sort()

describe('CLAUDE.md layout', () => {
  it('keeps the root file small: feature rules go beside the feature', () => {
    // Over budget? Move the new section into a CLAUDE.md in the feature's folder
    // and add one row to the "Feature rules" table instead.
    expect(Buffer.byteLength(rootText)).toBeLessThanOrEqual(ROOT_BUDGET_BYTES)
  })

  it('points only at files that exist', () => {
    expect(linked.length).toBeGreaterThan(10)
    expect(linked.filter((file) => !existsSync(path.join(ROOT, file)))).toEqual([])
  })

  it('lists every feature file in the root table', () => {
    const unlisted = nested.filter((file) => {
      const text = readFileSync(path.join(ROOT, file), 'utf8')
      const isPointer = text.includes(POINTER_MARK) || text.trim() === '@AGENTS.md'
      return !isPointer && !linked.includes(file)
    })
    expect(unlisted).toEqual([])
  })

  it('pointer files name feature files that exist', () => {
    for (const file of nested) {
      const text = readFileSync(path.join(ROOT, file), 'utf8')
      if (!text.includes(POINTER_MARK)) continue
      const targets = [...text.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1])
      expect({ file, targets: targets.length > 0 }).toEqual({ file, targets: true })
      expect({ file, missing: targets.filter((target) => !existsSync(path.join(ROOT, target))) }).toEqual({ file, missing: [] })
      const imports = [...text.matchAll(/^@(\S+)$/gm)].map((match) => path.join(path.dirname(file), match[1]))
      expect({ file, missing: imports.filter((target) => !existsSync(path.join(ROOT, target))) }).toEqual({ file, missing: [] })
    }
  })
})
