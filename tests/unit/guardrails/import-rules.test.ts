/**
 * @jest-environment node
 */
/**
 * Which way imports may point (`scripts/lib/import-rules.mjs`): shared logic in
 * `src/lib` and `src/platform` never reaches into `src/components` or
 * `src/app`, and so on. ESLint refuses a NEW wrong-way import
 * (`eslint.config.mjs` builds its patterns from the same rules); this test
 * keeps the list of today's violators honest:
 *
 * - a file that breaks a rule is listed under that rule in
 *   `import-rule-exceptions.json`, or the test fails (this also catches what
 *   ESLint cannot: a type written `import('…').Name`, and a disabled lint line);
 * - a listed file that is gone, or no longer breaks its rule, must come off
 *   the list.
 *
 * So the list can only shrink. Nothing here says today's entries are fine;
 * they are where the counting starts.
 *
 * To see every current violator and the import that causes it:
 * IMPORT_RULES_PRINT=1 npx jest --config jest.config.cjs
 * --testPathPatterns="guardrails/import-rules"
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { Linter } from 'eslint'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import {
  IMPORT_RULES,
  MAX_NESTING,
  breaksRule,
  eslintDynamicRuleName,
  eslintRegexFor,
  eslintRuleName,
  findViolations,
  importDirectionConfig,
  importsOf,
  readSources,
  resolveImport,
  restrictedImportRegex,
  ruleBinds,
} from '../../../scripts/lib/import-rules.mjs'
import exceptionList from './import-rule-exceptions.json'

const ROOT = process.cwd()
const EXCEPTIONS_FILE = 'tests/unit/guardrails/import-rule-exceptions.json'
const exceptions: Record<string, string[]> = exceptionList.rules
const sources = readSources(ROOT)
const violations = findViolations(sources)
const ruleIds = IMPORT_RULES.map((rule) => rule.id)
const ruleById = (id: string) => {
  const rule = IMPORT_RULES.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`no import rule called ${id}`)
  return rule
}

if (process.env.IMPORT_RULES_PRINT === '1') {
  // The documented way to read every current violator at once.
  console.log(JSON.stringify(violations, null, 2))
}

describe('import direction: the exception list only shrinks', () => {
  it('reads the source tree (guards the scan itself)', () => {
    expect(sources.length).toBeGreaterThan(1000)
    expect(sources.some(({ file }) => file === 'src/lib/order-backend.ts')).toBe(true)
    expect(sources.reduce((total, { imports }) => total + imports.length, 0)).toBeGreaterThan(10_000)
  })

  it('has one list per rule, and no list for a rule that does not exist', () => {
    expect(Object.keys(exceptions)).toEqual(ruleIds)
    expect(new Set(ruleIds).size).toBe(ruleIds.length)
  })

  it.each(ruleIds)('%s: a new wrong-way import is refused', (id) => {
    const listed = new Set(exceptions[id])
    const added = violations[id]
      .filter(({ file }) => !listed.has(file))
      .map(({ file, imports }) => `${file} imports ${imports.join(', ')}. ${ruleById(id).message} Do not add the file to ${EXCEPTIONS_FILE}.`)
    expect(added).toEqual([])
  })

  it.each(ruleIds)('%s: lists no file that is gone', (id) => {
    const missing = exceptions[id].filter((file) => !existsSync(path.join(ROOT, file)))
    expect(missing.map((file) => `${file}: no longer exists; remove it from "${id}" in ${EXCEPTIONS_FILE}`)).toEqual([])
  })

  it.each(ruleIds)('%s: lists no file that keeps the rule now', (id) => {
    const breaking = new Set(violations[id].map(({ file }) => file))
    const stale = exceptions[id].filter((file) => existsSync(path.join(ROOT, file)) && !breaking.has(file))
    expect(stale.map((file) => `${file}: no longer breaks the rule; remove it from "${id}" in ${EXCEPTIONS_FILE} so it cannot creep back`)).toEqual([])
  })

  it.each(ruleIds)('%s: the list is sorted, once each', (id) => {
    expect(exceptions[id]).toEqual([...new Set(exceptions[id])].sort())
  })
})

describe('import direction: the rules', () => {
  it.each(IMPORT_RULES)('$id says in one sentence what is refused and where the code belongs', ({ message }) => {
    expect(message).toMatch(/^[A-Z][^\n]* may not import [^\n]*: [^\n]*\.$/)
    // One sentence: no full stop followed by another sentence.
    expect(message).not.toMatch(/\.\s+[A-Z]/)
  })

  it('gives every file it binds an ESLint pattern (no file sits deeper than the patterns reach)', () => {
    const uncovered = IMPORT_RULES.flatMap((rule) =>
      sources
        .filter(({ file }) => ruleBinds(rule, file) && eslintRegexFor(rule, file) === null)
        .map(({ file }) => `${rule.id}: ${file} is more than ${MAX_NESTING} folders deep; raise MAX_NESTING in scripts/lib/import-rules.mjs`),
    )
    expect(uncovered).toEqual([])
  })

  it('ESLint and the scan agree on every import in the tree', () => {
    // ESLint matches the text of an import; the scan resolves where it leads.
    // A disagreement means an import is spelled in a way the patterns do not
    // expect (`../lib/../components/x`): write it as `@/…`.
    const disagreements = IMPORT_RULES.flatMap((rule) =>
      sources.flatMap(({ file, imports }) => {
        const regex = eslintRegexFor(rule, file)
        if (regex === null) return []
        return imports
          .filter(({ specifier }) => regex.test(specifier) !== breaksRule(rule, file, specifier))
          .map(({ specifier }) => `${rule.id}: ${file} imports '${specifier}'; write it as an @/ path`)
      }),
    )
    expect(disagreements).toEqual([])
  })
})

describe('import direction: the scan', () => {
  const specifiers = (source: string) => importsOf(source).map(({ specifier, kind }) => `${specifier}:${kind}`)

  it('sees every way a file imports a module', () => {
    const source = [
      "import React from 'react'",
      "import type { Thing } from '@/components/thing'",
      "import Default, { one,\n  two as second } from \"../two-lines\"",
      "import * as everything from './star'",
      "import './side-effect'",
      "export { a } from '@/app/a'",
      "export * from './all'",
      "export type { T } from './types'",
      "const lazy = await import('@/components/lazy')",
      "const legacy = require('../legacy')",
    ].join('\n')

    expect(specifiers(source)).toEqual([
      'react:static',
      '@/components/thing:static',
      '../two-lines:static',
      './star:static',
      './side-effect:static',
      '@/app/a:static',
      './all:static',
      './types:static',
      '@/components/lazy:dynamic',
      '../legacy:dynamic',
    ])
  })

  it('is not fooled by a comment, a plain string or an exported value', () => {
    const source = [
      "// import x from '@/components/commented'",
      "/* export * from '@/app/also-commented' */",
      "export const label = '@/components/just-a-string'",
      "const from = 'somewhere'",
    ].join('\n')

    expect(specifiers(source)).toEqual([])
  })

  it('resolves the alias and relative paths, and leaves packages alone', () => {
    expect(resolveImport('src/lib/a/b.ts', '@/components/ui/button')).toBe('src/components/ui/button')
    expect(resolveImport('src/lib/a/b.ts', '../../components/ui/button')).toBe('src/components/ui/button')
    expect(resolveImport('src/lib/a/b.ts', '../components/x')).toBe('src/lib/components/x')
    expect(resolveImport('src/lib/a/b.ts', './c')).toBe('src/lib/a/c')
    expect(resolveImport('src/lib/a/b.ts', '../../../webnegosyo-app/lib/x')).toBe('webnegosyo-app/lib/x')
    expect(resolveImport('src/lib/a/b.ts', 'react')).toBeNull()
    expect(resolveImport('src/lib/a/b.ts', '@supabase/ssr')).toBeNull()
  })

  it('binds a rule to non-test code in its folders only', () => {
    const rule = ruleById('lib-not-components')

    expect(breaksRule(rule, 'src/lib/a/b.ts', '@/components/x')).toBe(true)
    expect(breaksRule(rule, 'src/platform/http/define-route.ts', '../../components/x')).toBe(true)
    expect(breaksRule(rule, 'src/lib/a/b.ts', '@/components')).toBe(true)
    // A folder that merely starts with the same letters, or sits inside lib.
    expect(breaksRule(rule, 'src/lib/a/b.ts', '@/components-old/x')).toBe(false)
    expect(breaksRule(rule, 'src/lib/a/b.ts', '../components/x')).toBe(false)
    // Not this rule's folders; tests may import what they test.
    expect(breaksRule(rule, 'src/hooks/use-thing.ts', '@/components/x')).toBe(false)
    expect(breaksRule(rule, 'src/library/b.ts', '@/components/x')).toBe(false)
    expect(breaksRule(rule, 'src/lib/a/b.test.ts', '@/components/x')).toBe(false)
    expect(breaksRule(rule, 'src/lib/__tests__/b.ts', '@/components/x')).toBe(false)
  })

  it('treats a module target as that one module', () => {
    const rule = ruleById('components-not-service-role')

    expect(breaksRule(rule, 'src/components/admin/x.tsx', '@/lib/supabase/admin')).toBe(true)
    expect(breaksRule(rule, 'src/components/admin/x.tsx', '../../lib/supabase/admin.ts')).toBe(true)
    expect(breaksRule(rule, 'src/components/admin/x.tsx', '@/lib/supabase/admin-helpers')).toBe(false)
    expect(breaksRule(rule, 'src/components/admin/x.tsx', '@/lib/supabase/server')).toBe(false)
  })

  it('writes the relative form for the exact depth of the file', () => {
    const rule = ruleById('lib-not-components')

    expect(restrictedImportRegex(rule, 'src/lib', 0)).toBe('^(?:@/components|(?:\\.\\./){1}components)(?:\\.[cm]?[jt]sx?)?(?:/|$)')
    expect(new RegExp(restrictedImportRegex(rule, 'src/lib', 1)).test('../../components/x')).toBe(true)
    expect(new RegExp(restrictedImportRegex(rule, 'src/lib', 1)).test('../components/x')).toBe(false)
    expect(new RegExp(restrictedImportRegex(rule, 'src/lib', 1)).test('../../../components/x')).toBe(false)
    // Sub-projects sit beside src, one more step up, and have no alias.
    expect(new RegExp(restrictedImportRegex(ruleById('src-not-sub-projects'), 'src', 1)).test('../../mobile/lib/x')).toBe(true)
    expect(new RegExp(restrictedImportRegex(ruleById('src-not-sub-projects'), 'src', 1)).test('../mobile/x')).toBe(false)
  })
})

describe('import direction: what ESLint is given', () => {
  // The real blocks, run by the real ESLint, without the Next.js presets.
  const restrictedImports = builtinRules.get('no-restricted-imports')
  const restrictedSyntax = builtinRules.get('no-restricted-syntax')
  if (!restrictedImports || !restrictedSyntax) throw new Error('ESLint no longer ships the two built-in rules')
  const linter = new Linter({ configType: 'flat', cwd: ROOT })
  const excepted = {
    'lib-not-components': ['src/lib/listed.js'],
    'components-not-service-role': ['src/components/[group]/(listed)/card.js'],
  }
  const config = importDirectionConfig(excepted, { restrictedImports, restrictedSyntax }) as Linter.Config[]
  const lint = (filename: string, code: string) =>
    linter.verify(code, config, { filename: path.join(ROOT, filename) }).map(({ ruleId, message }) => `${ruleId}: ${message}`)

  it.each([
    ['lib-not-components', 'src/lib/menu/thing.js', "import { Card } from '@/components/admin/card'"],
    ['lib-not-components', 'src/platform/http/thing.js', "export * from '../../components/admin/card'"],
    ['lib-not-app', 'src/lib/thing.js', "import { saveAction } from '@/app/actions/save'"],
    ['lib-not-app', 'src/platform/db/deep/thing.js', "import page from '../../../app/page'"],
    ['ui-not-app', 'src/components/ui/button.js', "import { saveAction } from '@/app/actions/save'"],
    ['components-not-service-role', 'src/components/admin/card.js', "import { createAdminClient } from '@/lib/supabase/admin'"],
    ['src-not-sub-projects', 'src/lib/receipt.js', "import { layout } from '../../webnegosyo-app/lib/receipt-layout'"],
    ['src-not-sub-projects', 'src/app/api/thing/route.js', "import { schema } from '../../../../convex-template/convex/schema'"],
  ])('%s refuses %s', (id, filename, code) => {
    expect(lint(filename, code)).toEqual([
      `${eslintRuleName(ruleById(id))}: '${/'([^']+)'/.exec(code)?.[1]}' import is restricted from being used by a pattern. ${ruleById(id).message}`,
    ])
  })

  it.each([
    ['lib-not-app', 'src/lib/orders/thing.js', "export const load = () => import('@/app/actions/save')"],
    ['lib-not-components', 'src/lib/thing.js', "const { Card } = require('../components/admin/card')"],
    ['src-not-sub-projects', 'src/hooks/use-thing.js', "export const load = () => import('../../mobile/lib/thing')"],
  ])('%s refuses %s loading it with import() or require()', (id, filename, code) => {
    expect(lint(filename, code)).toEqual([`${eslintDynamicRuleName(ruleById(id))}: ${ruleById(id).message}`])
  })

  it.each([
    ['lib loading lib with import()', 'src/lib/menu/thing.js', "export const load = () => import('@/lib/money')"],
    ['a listed file loading a component with import()', 'src/lib/listed.js', "export const load = () => import('@/components/admin/card')"],
    ['a component importing lib', 'src/components/admin/card.js', "import { money } from '@/lib/money'"],
    ['lib importing lib', 'src/lib/menu/thing.js', "import { money } from '../money'"],
    ['a folder inside lib that is called components', 'src/lib/menu/thing.js', "import { part } from '../components/part'"],
    ['a test beside the code', 'src/lib/menu/thing.test.js', "import { Card } from '@/components/admin/card'"],
    ['a test importing a sub-project', 'tests/unit/parity.test.js', "import { layout } from '../../webnegosyo-app/lib/receipt-layout'"],
    ['a file listed as an exception', 'src/lib/listed.js', "import { Card } from '@/components/admin/card'"],
    ['a listed file in [bracket] and (group) folders', 'src/components/[group]/(listed)/card.js', "import { createAdminClient } from '@/lib/supabase/admin'"],
  ])('allows %s', (_name, filename, code) => {
    expect(lint(filename, code)).toEqual([])
  })

  it('switches off only the listed rule for a listed file', () => {
    expect(lint('src/lib/listed.js', "import { saveAction } from '@/app/actions/save'")).toHaveLength(1)
    expect(lint('src/lib/listed.js', "export const load = () => import('@/app/actions/save')")).toHaveLength(1)
    expect(lint('src/components/[group]/(other)/card.js', "import { createAdminClient } from '@/lib/supabase/admin'")).toHaveLength(1)
  })
})
