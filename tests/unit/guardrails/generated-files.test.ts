/**
 * @jest-environment node
 */
/**
 * Generated files are not ours to lint or to ratchet, so ESLint ignores them
 * and ratchets.test.ts skips them. Both read ONE explicit list,
 * `generated-files.json`, by file name: a pattern would quietly exempt any
 * hand-written file that happened to match it. This test keeps the list honest:
 * every listed file says it is generated and how to regenerate it, every file
 * under src/ that says it is generated is listed, and ESLint really ignores
 * the listed files (and still lints the hand-written database types).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import generated from './generated-files.json'

const ROOT = process.cwd()
const listed = Object.keys(generated.files) as (keyof typeof generated.files)[]
const GENERATED_MARK = /^\/\/ GENERATED\b.*do not edit by hand/i

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const posix = (full: string) => path.relative(ROOT, full).split(path.sep).join('/')
const firstLine = (file: string) => readFileSync(path.join(ROOT, file), 'utf8').split('\n', 1)[0]

describe('generated files: one explicit list', () => {
  it('lists real files, each marked as generated', () => {
    expect(listed.length).toBeGreaterThan(0)
    for (const file of listed) {
      expect({ file, exists: existsSync(path.join(ROOT, file)) }).toEqual({ file, exists: true })
      expect({ file, marked: GENERATED_MARK.test(firstLine(file)) }).toEqual({ file, marked: true })
    }
    expect(listed).toEqual([...listed].sort())
  })

  it('lists every file under src/ that is generated', () => {
    const unlisted = walk(path.join(ROOT, 'src'))
      .map(posix)
      .filter((file) => /\.(ts|tsx|js|mjs)$/.test(file))
      .filter((file) => /\.generated\./.test(file) || GENERATED_MARK.test(firstLine(file)))
      .filter((file) => !listed.includes(file as (typeof listed)[number]))
    expect(unlisted).toEqual([])
  })

  it('the database types say how to regenerate them, and the script exists', () => {
    const source = readFileSync(path.join(ROOT, 'src/types/database.generated.ts'), 'utf8')
    expect(source.slice(0, 600)).toContain('npm run db:types')
    expect(source).toContain('export type Database')
    const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts
    expect(scripts['db:types']).toBe('node scripts/db-types.mjs')
    expect(scripts['db:types:check']).toBe('node scripts/db-types.mjs --check')
  })

  it('ESLint ignores the listed files and still lints the hand-written types', () => {
    const probe = [...listed, 'src/types/database.ts']
    const run = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { ESLint } = await import('eslint')
         const eslint = new ESLint({ cwd: process.cwd() })
         const files = JSON.parse(process.argv[1])
         const result = {}
         for (const file of files) result[file] = await eslint.isPathIgnored(file)
         console.log(JSON.stringify(result))`,
        JSON.stringify(probe),
      ],
      { cwd: ROOT, encoding: 'utf8' },
    )
    expect(run.stderr).toBe('')
    const ignored = JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}')
    expect(ignored).toEqual({
      ...Object.fromEntries(listed.map((file) => [file, true])),
      'src/types/database.ts': false,
    })
  }, 60_000)
})
