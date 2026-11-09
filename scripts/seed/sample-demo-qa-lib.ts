/**
 * Shared pieces of the sample-demo QA seed and its teardown.
 *
 * Blast radius: ONE tenant, `sample-demo` (platform backend). Every row the
 * seed creates has a deterministic id derived from `QA-SEED:<key>`, so a
 * re-run updates in place and teardown deletes exactly those ids (plus orders
 * an E2E run placed with a `QA-SEED` customer name). Tenant columns the seed
 * changes are saved to `.sample-demo-snapshot.json` first and restored by
 * teardown.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const QA_SLUG = 'sample-demo'
export const QA_TAG = 'QA-SEED'
export const SNAPSHOT_PATH = join(__dirname, '.sample-demo-snapshot.json')

/** Tenant columns the seed overwrites (saved before the first write, restored by teardown). */
export const SNAPSHOT_COLUMNS = [
  'checkout_design',
  'checkout_design_enabled',
  'confirmation_design',
  'confirmation_design_enabled',
  'tracking_design',
  'tracking_design_enabled',
  'tracking_style',
  'confirmation_redirect',
  'confirmation_redirect_seconds',
  'auto_86_enabled',
] as const

/** A stable UUID for a seed row: same key → same id on every run. */
export function qaId(key: string): string {
  const hex = createHash('sha256').update(`${QA_TAG}:${key}`).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Clearly fake guest numbers: +63 900 000 00xx (no network uses 0900). */
export function fakePhone(n: number): string {
  return `+6390000000${String(n).padStart(2, '0')}`
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!match || process.env[match[1]] !== undefined) continue
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
}

export function serviceClient(): SupabaseClient {
  loadEnvFile(join(process.cwd(), '.env.local'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface QaTenant {
  id: string
  slug: string
  name: string
  order_backend: string | null
}

/** Resolve the tenant by slug and refuse anything but sample-demo on the platform backend. */
export async function resolveQaTenant(db: SupabaseClient): Promise<QaTenant> {
  const { data, error } = await db.from('tenants').select('id, slug, name, order_backend').eq('slug', QA_SLUG).maybeSingle()
  if (error) throw new Error(`Tenant lookup failed: ${error.message}`)
  if (!data) throw new Error(`Tenant "${QA_SLUG}" not found`)
  const tenant = data as QaTenant
  if (tenant.slug !== QA_SLUG) throw new Error(`Refusing: resolved slug is "${tenant.slug}", not "${QA_SLUG}"`)
  if (tenant.order_backend !== 'platform') throw new Error(`Refusing: ${QA_SLUG} is not on the platform backend (${tenant.order_backend})`)
  return tenant
}

/** Throw unless a write touched exactly `expected` rows. */
export function assertRows(label: string, rows: unknown[] | null, expected: number): void {
  const count = rows?.length ?? 0
  if (count !== expected) throw new Error(`${label}: expected ${expected} row(s), got ${count}`)
  console.log(`  ✓ ${label}: ${count} row(s)`)
}

// ── Deterministic ids ───────────────────────────────────────────────────────

export const IDS = {
  category: qaId('category:main'),
  items: {
    inasal: qaId('item:inasal'),
    coffee: qaId('item:coffee'),
    fries: qaId('item:fries'),
    cheeseBread: qaId('item:cheese-bread'),
  },
  vouchers: {
    tenOff: qaId('voucher:qa10off'),
    halfFries: qaId('voucher:qa50fries'),
    twentyPeso: qaId('voucher:qa20peso'),
  },
  voucherTargetFries: qaId('voucher-target:qa50fries:fries'),
  inventory: {
    breadRoll: qaId('inventory:bread-roll'),
    chickenLeg: qaId('inventory:chicken-leg'),
  },
  recipes: {
    cheeseBread: qaId('recipe:cheese-bread'),
    inasal: qaId('recipe:inasal'),
  },
  recipeComponents: {
    cheeseBread: qaId('recipe-component:cheese-bread:bread-roll'),
    inasal: qaId('recipe-component:inasal:chicken-leg'),
  },
  movements: {
    breadRoll: qaId('movement:receive:bread-roll'),
    chickenLeg: qaId('movement:receive:chicken-leg'),
  },
  fieldPrefix: 'qa_',
} as const

export const fieldId = (key: string) => qaId(`field:${key}`)
export const orderId = (n: number) => qaId(`order:${n}`)
export const orderItemId = (n: number, line: number) => qaId(`order-item:${n}:${line}`)

export const SEED_ORDER_COUNT = 12
export const seedOrderIds = (): string[] => Array.from({ length: SEED_ORDER_COUNT }, (_, i) => orderId(i + 1))
