/**
 * @jest-environment node
 *
 * Direct anon order inserts are being dropped (migration
 * 20261107120200_drop_anon_order_inserts.sql removes `orders_insert_customer`
 * and `order_items_insert_customer`). After it, any code that writes `orders` or
 * `order_items` with the anon key fails at checkout, and nothing else notices.
 *
 * Customer-facing code (the web storefront, the white-label customer app in
 * mobile/, the new customer-app/, the desktop register, edge functions) must
 * therefore write orders only through the service role (web `createOrder`,
 * `POST /api/orders/customer-app`). Exempt:
 *   - files that build a service-role client and no session client;
 *   - the merchant app (webnegosyo-app/): it writes as a signed-in staff member
 *     (`orders_insert_admin` / `order_items_write_admin`), which the migration keeps.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SCANNED_ROOTS = [
  'src',
  'mobile/app',
  'mobile/lib',
  'mobile/components',
  'customer-app/src',
  'webnegosyo-desktop/src',
  'supabase/functions',
]
const SKIP_DIRS = new Set(['node_modules', '.next', 'tests', '__tests__', 'dist'])

function listSources(dir: string): string[] {
  const absolute = path.join(ROOT, dir)
  try {
    statSync(absolute)
  } catch {
    return []
  }
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listSources(relative)
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx|js)$/.test(entry.name) ? [relative] : []
  })
}

const ORDER_WRITE = /\.from\(\s*(['"`])(orders|order_items)\1\s*\)[\s\S]{0,400}?\.(insert|upsert)\(/g
const REST_ORDER_POST = /rest\/v1\/(orders|order_items)\b/
const SERVICE_ROLE = /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|service_role/
const SESSION_CLIENT =
  /from\s+['"](?:@\/lib\/supabase\/(?:server|client)|(?:\.\.?\/)+(?:lib\/)?supabase)['"]|createBrowserClient|createServerClient/

export function findAnonOrderWrites(file: string, source: string): string[] {
  const isServiceRoleOnly = SERVICE_ROLE.test(source) && !SESSION_CLIENT.test(source)
  const findings: string[] = []
  for (const match of source.matchAll(ORDER_WRITE)) {
    // Stop at the first statement end so a later, unrelated insert is not pinned on this table.
    const statement = match[0].split(/;\s*\n/)[0]
    if (!/\.(insert|upsert)\($/.test(statement)) continue
    if (isServiceRoleOnly) continue
    // The web checkout names its writer `orderWriter = createAdminClient()` in a
    // file that also has session reads; accept a write whose receiver is that client.
    const receiver = source.slice(Math.max(0, (match.index ?? 0) - 80), match.index).match(/(\w+)\s*$/)?.[1]
    if (receiver && new RegExp(`\\b${receiver}\\s*=\\s*createAdminClient\\(`).test(source)) continue
    findings.push(`${file}:${source.slice(0, match.index ?? 0).split('\n').length} ${match[2]}.${match[3]}`)
  }
  if (REST_ORDER_POST.test(source) && !isServiceRoleOnly) {
    findings.push(`${file}: raw PostgREST call to /rest/v1/orders`)
  }
  return findings
}

describe('findAnonOrderWrites (the detector itself)', () => {
  test('flags a session or anon client inserting an order or a line', () => {
    expect(findAnonOrderWrites('x.ts', `supabase().from('orders').insert({ id })`)).toHaveLength(1)
    expect(findAnonOrderWrites('x.ts', `client\n  .from("order_items")\n  .insert(rows)`)).toHaveLength(1)
    expect(findAnonOrderWrites('x.ts', `db.from('orders').upsert(row)`)).toHaveLength(1)
    expect(findAnonOrderWrites('x.ts', `fetch(url + '/rest/v1/orders', { method: 'POST' })`)).toHaveLength(1)
    const mixed = `import { createClient } from '@/lib/supabase/server'\nimport { createAdminClient } from '@/lib/supabase/admin'\nconst supabase = await createClient()\nawait supabase.from('orders').insert(row)`
    expect(findAnonOrderWrites('x.ts', mixed)).toHaveLength(1)
  })

  test('accepts the service role, reads and updates', () => {
    expect(findAnonOrderWrites('x.ts', `const admin = createAdminClient()\nadmin.from('orders').insert(row)`)).toEqual([])
    expect(findAnonOrderWrites('x.ts', `supabase.from('orders').select('id').eq('id', id)`)).toEqual([])
    expect(findAnonOrderWrites('x.ts', `supabase.from('orders').update({ status }).eq('id', id)`)).toEqual([])
    const named = `import { createClient } from '@/lib/supabase/server'\nconst orderWriter = createAdminClient()\nawait orderWriter\n  .from('orders')\n  .insert(row)`
    expect(findAnonOrderWrites('x.ts', named)).toEqual([])
  })
})

describe('no customer-facing code writes orders with the anon key', () => {
  test('every order / order line insert outside the merchant app goes through the service role', () => {
    const findings = SCANNED_ROOTS.flatMap(listSources).flatMap((file) =>
      findAnonOrderWrites(file, readFileSync(path.join(ROOT, file), 'utf8')),
    )
    expect(findings).toEqual([])
  })

  test('the web checkout writes the order and its lines with the service role', () => {
    const source = readFileSync(path.join(ROOT, 'src/lib/orders-service.ts'), 'utf8')
    expect(source).toMatch(/const orderWriter = createAdminClient\(\)/)
    expect(source).toMatch(/await orderWriter\s*\n\s*\.from\('orders'\)\s*\n\s*\.insert\(/)
    expect(source).toMatch(/await orderWriter\s*\n\s*\.from\('order_items'\)/)
  })
})
