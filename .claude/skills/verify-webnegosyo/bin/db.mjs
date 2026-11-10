#!/usr/bin/env node
/**
 * verify-webnegosyo DB helper — service-role REST, pinned to ONE tenant: sample-demo.
 *
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs tenant
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs read <table> '<postgrest query>'
 *       e.g. read orders 'select=id,total,delivery_fee,customer_data&customer_name=like.QA-SEED*&order=created_at.desc&limit=5'
 *       Reads of a table with tenant_id are ALWAYS narrowed to sample-demo (tenant_id=eq.<id> is appended).
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs order <order-id>        # order row + its items
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs hold lift   <state-file> # paid_through = today+7 (saves the old value)
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs hold restore <state-file>
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs question require <qa_field_name> <state-file>
 *   node .claude/skills/verify-webnegosyo/bin/db.mjs question restore <state-file>
 *
 * Writes exist only for the three verification switches above, only on
 * sample-demo rows, and each asserts exactly one affected row. Run from the
 * repo root (reads .env.local).
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const ALLOWED_SLUG = 'sample-demo'

function loadEnv() {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) throw new Error(`.env.local not found in ${process.cwd()} (run from the repo root)`)
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  return { url, key }
}

const env = loadEnv()

async function rest(method, path, body, prefer) {
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

export async function sampleDemo() {
  const rows = await rest('GET', `tenants?select=id,slug,name,order_backend&slug=eq.${ALLOWED_SLUG}`)
  if (rows.length !== 1 || rows[0].slug !== ALLOWED_SLUG) throw new Error(`refusing: ${ALLOWED_SLUG} did not resolve to exactly one tenant`)
  if (rows[0].order_backend !== 'platform') throw new Error(`refusing: ${ALLOWED_SLUG} is not on the platform backend`)
  return rows[0]
}

/** Tables that carry tenant_id; reads of them are narrowed to sample-demo. */
const TENANT_TABLES = new Set([
  'orders', 'menu_items', 'categories', 'customer_form_fields', 'vouchers', 'order_types', 'payment_methods',
  'tenant_subscriptions', 'inventory_items', 'stock_movements', 'recipes', 'outlets', 'order_ledger', 'gov_discount_grants',
])

function assertOne(label, rows) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`${label}: expected 1 affected row, got ${rows?.length ?? 0}`)
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const tenant = await sampleDemo()
  if (cmd === 'tenant') return print(tenant)

  if (cmd === 'read') {
    const [table, query = 'select=*'] = args
    if (!/^[a-z_]+$/.test(table ?? '')) throw new Error('read <table> <query>')
    if (table === 'tenants') return print(await rest('GET', `tenants?${query}&id=eq.${tenant.id}`))
    const scoped = TENANT_TABLES.has(table) ? `${query}&tenant_id=eq.${tenant.id}` : query
    if (!TENANT_TABLES.has(table) && !/order_id=|id=eq\./.test(query)) {
      throw new Error(`${table} has no tenant_id: filter by order_id=… or id=eq.… of a sample-demo row`)
    }
    return print(await rest('GET', `${table}?${scoped}`))
  }

  if (cmd === 'order') {
    const [id] = args
    const [order] = await rest('GET', `orders?select=*&id=eq.${id}&tenant_id=eq.${tenant.id}`)
    if (!order) throw new Error(`no sample-demo order ${id}`)
    const items = await rest('GET', `order_items?select=menu_item_name,variation,addons,quantity,price,subtotal,discount_amount&order_id=eq.${id}`)
    return print({ order, items })
  }

  if (cmd === 'hold') {
    const [action, stateFile] = args
    if (!stateFile) throw new Error('hold lift|restore <state-file>')
    if (action === 'lift') {
      const [sub] = await rest('GET', `tenant_subscriptions?select=paid_through&tenant_id=eq.${tenant.id}`)
      if (!sub) return print({ note: 'no subscription row: nothing to lift' })
      if (!existsSync(stateFile)) writeFileSync(stateFile, JSON.stringify({ paid_through: sub.paid_through }))
      const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      const rows = await rest('PATCH', `tenant_subscriptions?tenant_id=eq.${tenant.id}`, { paid_through: ahead }, 'return=representation')
      assertOne('lift hold', rows)
      return print({ saved: JSON.parse(readFileSync(stateFile, 'utf8')), now: ahead })
    }
    if (action === 'restore') {
      if (!existsSync(stateFile)) return print({ note: 'no saved paid_through: nothing to restore' })
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
      const rows = await rest('PATCH', `tenant_subscriptions?tenant_id=eq.${tenant.id}`, { paid_through: saved.paid_through }, 'return=representation')
      assertOne('restore hold', rows)
      rmSync(stateFile)
      return print({ restored: saved.paid_through })
    }
  }

  if (cmd === 'question') {
    const [action, a, b] = args
    if (action === 'require') {
      const [field, stateFile] = [a, b]
      if (!/^qa_[a-z_]+$/.test(field ?? '') || !stateFile) throw new Error('question require <qa_field_name> <state-file> (only seeded qa_* questions)')
      const rows = await rest('GET', `customer_form_fields?select=id,field_name,is_required&field_name=eq.${field}&tenant_id=eq.${tenant.id}`)
      assertOne(`find ${field}`, rows)
      if (!existsSync(stateFile)) writeFileSync(stateFile, JSON.stringify({ id: rows[0].id, field, is_required: rows[0].is_required }))
      const updated = await rest('PATCH', `customer_form_fields?id=eq.${rows[0].id}&tenant_id=eq.${tenant.id}`, { is_required: true }, 'return=representation')
      assertOne(`require ${field}`, updated)
      return print({ field, is_required: updated[0].is_required })
    }
    if (action === 'restore') {
      const stateFile = a
      if (!stateFile || !existsSync(stateFile)) return print({ note: 'no saved question: nothing to restore' })
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
      const updated = await rest('PATCH', `customer_form_fields?id=eq.${saved.id}&tenant_id=eq.${tenant.id}`, { is_required: saved.is_required }, 'return=representation')
      assertOne(`restore ${saved.field}`, updated)
      rmSync(stateFile)
      return print({ field: saved.field, is_required: updated[0].is_required })
    }
  }
  throw new Error('usage: tenant | read <table> <query> | order <id> | hold lift|restore <file> | question require <qa_field> <file> | question restore <file>')
}

function print(value) {
  console.log(JSON.stringify(value, null, 2))
}

main().catch((error) => {
  console.error(`db.mjs: ${error.message}`)
  process.exit(1)
})
