/**
 * Which way imports may point inside the web app, written down once.
 *
 * Read by two things, so they can never disagree about what a rule refuses:
 * - `eslint.config.mjs` turns each rule into `no-restricted-imports` patterns
 *   (`importDirectionConfig`; `no-restricted-syntax` for `import()` and
 *   `require()`), so a new wrong-way import fails `npm run lint`;
 * - `tests/unit/guardrails/import-rules.test.ts` scans the source with the same
 *   rules (`findViolations`) to keep the exception list honest.
 *
 * Today's violators are listed per rule in
 * `tests/unit/guardrails/import-rule-exceptions.json`. That list may only
 * shrink: fix a file's imports, then take it off the list.
 *
 * ESLint's rule sees only the text of an import, never where it leads, so each
 * rule becomes one regular expression per folder depth: the alias form
 * (`@/components/…`) plus the relative form that reaches the same place from
 * that depth (`../../components/…`). The test resolves every import for real
 * and checks the two agree on every import in the tree.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { blankComments } from './entry-points.mjs'

/** `@/x` is `src/x` (tsconfig `paths`, Jest `moduleNameMapper`). */
const ALIAS = '@/'
const ALIAS_ROOT = 'src'
const CODE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']
const CODE_FILE = new RegExp(`\\.(${CODE_EXTENSIONS.join('|')})$`)
const TEST_FILE = /(\.(test|spec)\.[a-z]+$)|((^|\/)(__tests__|__mocks__)\/)/
const SKIPPED_DIRS = ['node_modules', '.next']
/** How many folders below a rule's `from` folder get a pattern. The test fails if a file sits deeper. */
export const MAX_NESTING = 12

export const SUB_PROJECTS = ['webnegosyo-app', 'mobile', 'customer-app', 'convex-template', 'webnegosyo-desktop']

/** The ESLint plugin name the rules are registered under: `import-direction/<id>`. */
export const PLUGIN = 'import-direction'

/**
 * @typedef {object} ImportRule
 * @property {string} id            rule name, also the key in the exceptions file
 * @property {string[]} from        folders whose (non-test) code the rule binds
 * @property {string[]} to          folders, or modules without extension, that may not be imported
 * @property {string} message       one sentence: what is refused and where the code belongs
 */

/** @type {ImportRule[]} */
export const IMPORT_RULES = [
  {
    id: 'lib-not-components',
    from: ['src/lib', 'src/platform'],
    to: ['src/components'],
    message:
      'Code in src/lib or src/platform may not import from src/components: move the shared part (a type, a constant, a helper) into src/lib and let the component import it from there.',
  },
  {
    id: 'lib-not-app',
    from: ['src/lib', 'src/platform'],
    to: ['src/app'],
    message:
      'Code in src/lib or src/platform may not import from src/app: logic that both need belongs in src/lib, and a route, page or server action in src/app calls it, never the other way round.',
  },
  {
    id: 'ui-not-app',
    from: ['src/components/ui'],
    to: ['src/app'],
    message:
      'A shared primitive in src/components/ui may not import from src/app: take what it needs as a prop, or put a component that knows about a screen in src/components/<area>/.',
  },
  {
    id: 'components-not-service-role',
    from: ['src/components'],
    to: ['src/lib/supabase/admin'],
    message:
      'A component in src/components may not import the service-role client (@/lib/supabase/admin), which bypasses row-level security: do the privileged read in a src/lib module called from the page or route, and pass the result in as props.',
  },
  {
    id: 'src-not-sub-projects',
    from: ['src'],
    to: SUB_PROJECTS,
    message:
      'Web code under src may not import from a sub-project folder (webnegosyo-app, mobile, customer-app, convex-template, webnegosyo-desktop): keep the web copy under src/lib and pin the two together with a parity test in tests/unit.',
  },
]

const toPosix = (filePath) => filePath.split(path.sep).join('/')
const segments = (posixPath) => posixPath.split('/').filter(Boolean)
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A literal path as an ESLint `files` glob: `[tenant]` and `(group)` folders are not character classes. */
const escapeGlob = (file) => file.replace(/[\\*?[\]{}()!+@]/g, '\\$&')

function isInside(posixPath, folder) {
  return posixPath === folder || posixPath.startsWith(`${folder}/`)
}

for (const rule of IMPORT_RULES) {
  for (const from of rule.from) {
    for (const to of rule.to) {
      // The relative patterns below assume the two are separate trees.
      if (isInside(from, to) || isInside(to, from)) throw new Error(`${rule.id}: ${from} and ${to} overlap`)
    }
  }
}

/** @param {string} file repo-relative posix path */
export function isTestFile(file) {
  return TEST_FILE.test(file)
}

/**
 * The `from` folder of the rule that holds this file, or null when the rule does not bind it.
 * @param {ImportRule} rule
 * @param {string} file repo-relative posix path
 */
function scopeOf(rule, file) {
  if (!CODE_FILE.test(file) || isTestFile(file)) return null
  return rule.from.find((from) => file.startsWith(`${from}/`)) ?? null
}

/**
 * @param {ImportRule} rule
 * @param {string} file repo-relative posix path
 */
export function ruleBinds(rule, file) {
  return scopeOf(rule, file) !== null
}

/**
 * Where an import leads, as a repo-relative posix path (no extension added), or
 * null for a package.
 * @param {string} file repo-relative posix path of the importing file
 * @param {string} specifier
 */
export function resolveImport(file, specifier) {
  if (specifier.startsWith(ALIAS)) return path.posix.normalize(`${ALIAS_ROOT}/${specifier.slice(ALIAS.length)}`)
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  }
  return null
}

/** @param {string} resolved repo-relative path an import leads to */
function leadsInto(resolved, target) {
  if (isInside(resolved, target)) return true
  // `to` may name a module: `src/lib/supabase/admin` is also `…/admin.ts`.
  return resolved.replace(CODE_FILE, '') === target
}

/**
 * Does this import, written in this file, break the rule? Resolves the path for real.
 * @param {ImportRule} rule
 * @param {string} file repo-relative posix path
 * @param {string} specifier
 */
export function breaksRule(rule, file, specifier) {
  if (!ruleBinds(rule, file)) return false
  const resolved = resolveImport(file, specifier)
  return resolved !== null && rule.to.some((target) => leadsInto(resolved, target))
}

/**
 * The one regular expression ESLint tests import text against, for files
 * `nesting` folders below `from`.
 * @param {ImportRule} rule
 * @param {string} from one of `rule.from`
 * @param {number} nesting 0 for a file directly inside `from`
 */
export function restrictedImportRegex(rule, from, nesting) {
  const fromParts = segments(from)
  const forms = rule.to.flatMap((target) => {
    const targetParts = segments(target)
    let shared = 0
    while (shared < fromParts.length && fromParts[shared] === targetParts[shared]) shared += 1
    const climbs = fromParts.length - shared + nesting
    const relative = `(?:\\.\\./){${climbs}}${escapeRegex(targetParts.slice(shared).join('/'))}`
    const alias = isInside(target, ALIAS_ROOT)
      ? [escapeRegex(`${ALIAS}${targetParts.slice(segments(ALIAS_ROOT).length).join('/')}`)]
      : []
    return [...alias, relative]
  })
  return `^(?:${forms.join('|')})(?:\\.[cm]?[jt]sx?)?(?:/|$)`
}

/**
 * The regular expression ESLint applies to this file for this rule, or null
 * when no config block covers the file.
 * @param {ImportRule} rule
 * @param {string} file repo-relative posix path
 */
export function eslintRegexFor(rule, file) {
  const from = scopeOf(rule, file)
  if (from === null) return null
  const nesting = segments(path.posix.dirname(file)).length - segments(from).length
  return nesting > MAX_NESTING ? null : new RegExp(restrictedImportRegex(rule, from, nesting))
}

/** The rule id as ESLint reports it for `import … from` / `export … from`. */
export const eslintRuleName = (rule) => `${PLUGIN}/${rule.id}`
/** The same rule for `import('…')` and `require('…')`, which `no-restricted-imports` does not look at. */
export const eslintDynamicRuleName = (rule) => `${PLUGIN}/${rule.id}-dynamic`

/** `no-restricted-syntax` selectors for the same regular expression (esquery takes no `/` inside one). */
function dynamicImportSelectors(regex, message) {
  const pattern = regex.replaceAll('/', '\\x2F')
  return [
    { selector: `ImportExpression[source.value=/${pattern}/]`, message },
    { selector: `CallExpression[callee.name="require"][arguments.0.value=/${pattern}/]`, message },
  ]
}

/**
 * The flat-config entries that enforce the rules: every rule switched on for
 * the files it binds and off for the files listed as today's exceptions.
 *
 * Each rule is ESLint's built-in `no-restricted-imports` (plus
 * `no-restricted-syntax` for `import()` / `require()`) registered under its
 * own name. Flat config keeps only the LAST options given to a rule name, so
 * five blocks all configuring `no-restricted-imports` would leave one rule
 * standing per file; with a name each, they stack, a failure names its rule,
 * and an exception switches off exactly one of them.
 *
 * @param {Record<string, string[]>} exceptions rule id → repo-relative files
 * @param {{ restrictedImports: object, restrictedSyntax: object }} builtIn ESLint's own two rules (the caller imports ESLint, this file does not)
 */
export function importDirectionConfig(exceptions, { restrictedImports, restrictedSyntax }) {
  const testFiles = ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/__mocks__/**']
  const plugin = {
    rules: Object.fromEntries(
      IMPORT_RULES.flatMap((rule) => [
        [rule.id, restrictedImports],
        [`${rule.id}-dynamic`, restrictedSyntax],
      ]),
    ),
  }
  const blocks = [{ plugins: { [PLUGIN]: plugin } }]
  for (const rule of IMPORT_RULES) {
    for (const from of rule.from) {
      for (let nesting = 0; nesting <= MAX_NESTING; nesting += 1) {
        const regex = restrictedImportRegex(rule, from, nesting)
        blocks.push({
          files: [`${from}/${'*/'.repeat(nesting)}*.{${CODE_EXTENSIONS.join(',')}}`],
          ignores: testFiles,
          rules: {
            [eslintRuleName(rule)]: ['error', { patterns: [{ regex, message: rule.message }] }],
            [eslintDynamicRuleName(rule)]: ['error', ...dynamicImportSelectors(regex, rule.message)],
          },
        })
      }
    }
  }
  for (const rule of IMPORT_RULES) {
    const files = exceptions[rule.id] ?? []
    if (files.length === 0) continue
    blocks.push({
      files: files.map(escapeGlob),
      rules: { [eslintRuleName(rule)]: 'off', [eslintDynamicRuleName(rule)]: 'off' },
    })
  }
  return blocks
}

// ---------------------------------------------------------------------------
// The scan (the guardrail test's side)
// ---------------------------------------------------------------------------

const STATIC_IMPORT = /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[\w*${},\s]+?\s+from\s+)?(['"])([^'"\n]+)\1/g
const DYNAMIC_IMPORT = /\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g

/**
 * Every module a source file imports: `static` is `import … from`,
 * `export … from` and `import 'x'`; `dynamic` is `import('x')` and
 * `require('x')`, including a type written `import('x').Name`, which only the
 * test catches (ESLint is given no pattern for a type query).
 * @param {string} source
 * @returns {{ specifier: string, kind: 'static' | 'dynamic' }[]}
 */
export function importsOf(source) {
  const text = blankComments(source)
  const found = []
  for (const match of text.matchAll(STATIC_IMPORT)) found.push({ specifier: match[2], kind: /** @type {const} */ ('static') })
  for (const match of text.matchAll(DYNAMIC_IMPORT)) found.push({ specifier: match[2], kind: /** @type {const} */ ('dynamic') })
  return found
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIPPED_DIRS.includes(entry.name) ? [] : walk(full)
    return [full]
  })
}

/**
 * Every non-test code file a rule could bind, read once.
 * @param {string} root repo root
 * @returns {{ file: string, imports: { specifier: string, kind: 'static' | 'dynamic' }[] }[]}
 */
export function readSources(root) {
  const folders = [...new Set(IMPORT_RULES.flatMap((rule) => rule.from).map((from) => segments(from)[0]))]
  return folders
    .flatMap((folder) => walk(path.join(root, folder)))
    .map((full) => toPosix(path.relative(root, full)))
    .filter((file) => CODE_FILE.test(file) && !isTestFile(file))
    .sort()
    .map((file) => ({ file, imports: importsOf(readFileSync(path.join(root, file), 'utf8')) }))
}

/**
 * Today's violators: rule id → sorted files, each with the imports that break the rule.
 * @param {ReturnType<typeof readSources>} sources
 * @returns {Record<string, { file: string, imports: string[] }[]>}
 */
export function findViolations(sources) {
  return Object.fromEntries(
    IMPORT_RULES.map((rule) => [
      rule.id,
      sources
        .map(({ file, imports }) => ({
          file,
          imports: [...new Set(imports.map(({ specifier }) => specifier).filter((specifier) => breaksRule(rule, file, specifier)))],
        }))
        .filter(({ imports }) => imports.length > 0),
    ]),
  )
}
