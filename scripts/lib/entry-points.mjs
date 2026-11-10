/**
 * Reading the app's entry points from source: every API route (each
 * `route.ts` under `src/app/api`) and server action file (`src/app/actions/*.ts`).
 *
 * Shared by `scripts/generate-entry-points.mjs` (the table in
 * `docs/generated/entry-points.md`) and the guardrail test
 * (`tests/unit/guardrails/entry-points.test.ts`), so the two can never disagree
 * about what counts as "declared through defineRoute / defineAction".
 *
 * Plain text scanning on purpose: importing 200 route modules would boot the
 * whole app, and a declaration that only a real parser can find is one a
 * reviewer cannot grep for either. The price is one rule the test enforces:
 * a wrapped handler is written `export const NAME = defineRoute({ … })` with
 * the declaration inline.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const ROUTES_DIR = 'src/app/api'
export const ACTIONS_DIR = 'src/app/actions'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const WRAPPER_BY_KIND = { route: 'defineRoute', action: 'defineAction' }

/** @param {string} filePath */
function toPosix(filePath) {
  return filePath.split(path.sep).join('/')
}

/**
 * @param {string} dir absolute
 * @returns {string[]} absolute paths of every `route.ts` beneath it
 */
function walkRoutes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkRoutes(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

/**
 * Every entry-point file, as sorted repo-relative posix paths.
 * @param {string} root repo root
 * @returns {{ file: string, kind: 'route' | 'action' }[]}
 */
export function listEntryFiles(root) {
  const routes = walkRoutes(path.join(root, ROUTES_DIR)).map((full) => ({
    file: toPosix(path.relative(root, full)),
    kind: /** @type {const} */ ('route'),
  }))
  const actionsDir = path.join(root, ACTIONS_DIR)
  const actions = readdirSync(actionsDir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'))
    .filter((name) => statSync(path.join(actionsDir, name)).isFile())
    .map((name) => ({ file: `${ACTIONS_DIR}/${name}`, kind: /** @type {const} */ ('action') }))
  return [...routes, ...actions].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/**
 * The source with every comment blanked to spaces (offsets and line starts
 * kept), so a commented-out `export async function GET` is not an export.
 * Strings are left alone: declarations are read out of them.
 * @param {string} source
 */
export function blankComments(source) {
  let out = ''
  let index = 0
  /** @type {null | "'" | '"' | '`'} */
  let quote = null
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (quote) {
      out += char
      if (char === '\\') {
        out += next ?? ''
        index += 2
        continue
      }
      if (char === quote) quote = null
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      out += char
      index += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        out += ' '
        index += 1
      }
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(index, stop).replace(/[^\n]/g, ' ')
      index = stop
      continue
    }
    out += char
    index += 1
  }
  return out
}

/**
 * The text of the balanced `{…}`, `[…]` or `(…)` that opens at `start`.
 * @param {string} text comment-free source
 * @param {number} start index of the opening bracket
 * @returns {string | null}
 */
function balanced(text, start) {
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const stack = []
  /** @type {null | string} */
  let quote = null
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char in pairs) stack.push(pairs[/** @type {keyof typeof pairs} */ (char)])
    else if (char === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

/**
 * The top-level `key: value` pairs of an object literal's text.
 * @param {string} objectText including its braces
 * @returns {Record<string, string>}
 */
export function topLevelProperties(objectText) {
  /** @type {Record<string, string>} */
  const properties = {}
  const body = objectText.slice(1, -1)
  let depth = 0
  /** @type {null | string} */
  let quote = null
  let start = 0
  const parts = []
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, index))
      start = index + 1
    }
  }
  parts.push(body.slice(start))
  for (const part of parts) {
    const match = /^\s*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+?)\s*$/.exec(part)
    if (match) properties[match[1]] = match[2]
  }
  return properties
}

/** @param {string | undefined} text */
function literal(text) {
  if (text === undefined) return undefined
  const quoted = /^(['"`])([\s\S]*)\1$/.exec(text.trim())
  return quoted ? quoted[2] : text.trim().replace(/\s+/g, ' ')
}

/**
 * @typedef {object} EntryDeclaration
 * @property {string} kind
 * @property {string} [permission]
 * @property {string} [branch]
 * @property {string} [access]
 * @property {string} [session]
 * @property {string} [scheme]
 * @property {boolean} namesStore
 * @property {string} rateLimit human-readable
 * @property {string[]} validates
 */

/**
 * @param {string} objectText the declaration object literal
 * @returns {EntryDeclaration | null} null when `auth.kind` cannot be read as a literal
 */
function readDeclaration(objectText) {
  const properties = topLevelProperties(objectText)
  const authText = properties.auth
  if (!authText || !authText.trim().startsWith('{')) return null
  const auth = topLevelProperties(authText.trim())
  const kind = literal(auth.kind)
  if (!kind || !/^[a-z-]+$/.test(kind)) return null

  let rateLimit = 'not stated'
  if (properties.rateLimit?.trim().startsWith('{')) {
    const rule = topLevelProperties(properties.rateLimit.trim())
    const per = literal(rule.per)
    rateLimit = per === 'none'
      ? `none: ${literal(rule.reason)}`
      : `${literal(rule.max)} per ${literal(rule.window)} per ${per} (\`${literal(rule.bucket)}\`)`
  } else if (properties.rateLimit) {
    rateLimit = literal(properties.rateLimit) ?? 'not stated'
  }

  return {
    kind,
    permission: literal(auth.permission),
    branch: literal(auth.branch),
    access: literal(auth.access),
    session: literal(auth.session),
    scheme: literal(auth.scheme),
    namesStore: auth.storeClaim !== undefined,
    rateLimit,
    validates: ['params', 'query', 'body', 'args'].filter((part) => properties[part] !== undefined),
  }
}

/**
 * @typedef {object} EntryHandler
 * @property {string} name the exported name (an HTTP method for a route)
 * @property {boolean} isWrapped
 * @property {EntryDeclaration | null} declaration what a wrapped handler declares; null when unreadable
 */

/**
 * The handlers a file exports and whether each goes through the wrapper.
 * @param {'route' | 'action'} kind
 * @param {string} source
 * @returns {{ handlers: EntryHandler[], isFullyWrapped: boolean }}
 */
export function analyzeEntrySource(kind, source) {
  const text = blankComments(source)
  const wrapper = WRAPPER_BY_KIND[kind]
  /** @type {EntryHandler[]} */
  const handlers = []
  /** @param {string} name */
  const counts = (name) => kind === 'action' || HTTP_METHODS.includes(name)
  /** @param {string} name */
  const addUnwrapped = (name) => {
    if (counts(name)) handlers.push({ name, isWrapped: false, declaration: null })
  }

  for (const match of text.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) addUnwrapped(match[1])

  for (const match of text.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*/gm)) {
    const name = match[1]
    if (!counts(name)) continue
    const after = text.slice(match.index + match[0].length)
    const call = new RegExp(`^${wrapper}\\s*(?:<[^(]*>)?\\s*\\(\\s*`).exec(after)
    if (!call) {
      addUnwrapped(name)
      continue
    }
    const objectStart = match.index + match[0].length + call[0].length
    const objectText = text[objectStart] === '{' ? balanced(text, objectStart) : null
    handlers.push({ name, isWrapped: true, declaration: objectText ? readDeclaration(objectText) : null })
  }

  // `export const { GET, POST } = …` and `export { a as GET }`: never the wrapper's own form.
  for (const match of text.matchAll(/^export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=/gm)) {
    for (const part of match[1].split(',')) addUnwrapped(part.split(':').pop()?.trim() ?? '')
  }
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim() ?? ''
      if (name && !name.startsWith('type ')) addUnwrapped(name)
    }
  }
  if (/^export\s+default\b/m.test(text)) addUnwrapped(kind === 'action' ? 'default' : '')
  if (/^export\s*\*/m.test(text)) handlers.push({ name: '*', isWrapped: false, declaration: null })

  return { handlers, isFullyWrapped: handlers.length > 0 && handlers.every((handler) => handler.isWrapped) }
}

/**
 * @typedef {object} EntryFile
 * @property {string} file
 * @property {'route' | 'action'} kind
 * @property {EntryHandler[]} handlers
 * @property {boolean} isFullyWrapped
 */

/**
 * @param {string} root repo root
 * @returns {EntryFile[]}
 */
export function analyzeEntryPoints(root) {
  return listEntryFiles(root).map(({ file, kind }) => ({
    file,
    kind,
    ...analyzeEntrySource(kind, readFileSync(path.join(root, file), 'utf8')),
  }))
}

/** `src/app/api/a/[id]/route.ts` → `/api/a/[id]`. @param {string} file */
function routePath(file) {
  return file.replace(/^src\/app/, '').replace(/\/route\.ts$/, '')
}

/**
 * @param {EntryDeclaration} declaration
 * @param {'route' | 'action'} surface
 */
function whoMayCall(declaration, surface) {
  const { kind, permission, access, session, scheme } = declaration
  if (kind === 'staff') {
    const key = permission === 'any-staff' ? 'any member of the store' : `\`${permission}\``
    // A server action has no Request, so it is only ever the web admin's cookie session.
    const via = surface === 'action' ? 'session' : session === 'bearer' ? 'app token' : 'session or app token'
    return `staff: ${key} (${access ?? 'edit'}, ${via})`
  }
  if (kind === 'superadmin') return permission === 'full-superadmin' ? 'superadmin only' : `console: \`${permission}\``
  if (kind === 'cron') return 'cron secret'
  if (kind === 'device' || kind === 'signature') return `${kind}: ${scheme ?? 'unnamed'}`
  return 'anyone'
}

/** Pipes inside a cell would split it. @param {string} cell */
function cell(cell) {
  return cell.replace(/\|/g, '\\|')
}

/**
 * The generated document. Deterministic: same tree, same bytes.
 * @param {EntryFile[]} entries
 */
export function renderEntryPointsDoc(entries) {
  const rows = []
  for (const entry of entries) {
    for (const handler of entry.handlers) {
      if (!handler.isWrapped) continue
      const name = entry.kind === 'route' ? `${handler.name} ${routePath(entry.file)}` : `${handler.name} (${entry.file})`
      const declaration = handler.declaration
      rows.push(
        declaration
          ? [
              name,
              whoMayCall(declaration, entry.kind),
              declaration.kind === 'staff' ? (declaration.namesStore ? 'named, checked' : "caller's own") : '—',
              declaration.kind === 'staff' ? declaration.branch ?? '?' : '—',
              declaration.rateLimit,
              declaration.validates.join(', ') || '—',
            ]
          : [name, 'UNREADABLE DECLARATION', '?', '?', '?', '?'],
      )
    }
  }

  return [
    '# Entry points',
    '',
    '<!-- Generated by `node scripts/generate-entry-points.mjs`. Do not edit by hand; the guardrail test fails when it is stale. -->',
    '',
    'Every API route and server action that is declared through `defineRoute` / `defineAction`',
    '(`src/platform/http/`): who may call it, which store and branch it acts on, its rate limit and',
    'which inputs it validates. Entry points that still check access by hand are listed in',
    '`tests/unit/guardrails/entry-point-exceptions.json`; that list can only shrink.',
    '',
    // Only declared entries appear, so the file changes when a declaration does and never
    // because someone touched a hand-checked route.
    `## Declared entry points (${rows.length})`,
    '',
    '| Entry | Who may call | Store | Branch | Rate limit | Validates |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
    '',
  ].join('\n')
}
