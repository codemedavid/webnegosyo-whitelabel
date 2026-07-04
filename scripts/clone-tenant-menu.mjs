#!/usr/bin/env node
/**
 * Clone a tenant's menu (categories + menu_items, including image_url) into
 * another tenant. Full-clone semantics: the target's existing categories and
 * menu_items are DELETED, then the source's are copied with fresh IDs.
 *
 * Images live on ImageKit; copying an item's `image_url` simply points the new
 * item at the same hosted file (no re-upload needed).
 *
 * Usage:
 *   node scripts/clone-tenant-menu.mjs --source <slug|id> --target <slug|id> [--execute]
 *
 * Defaults to DRY RUN. Pass --execute to actually mutate the database.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY  (bypasses RLS — service role)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

// ---- env ----
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// ---- args ----
const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const sourceRef = getArg('source')
const targetRef = getArg('target')
const execute = args.includes('--execute')

if (!sourceRef || !targetRef) {
  console.error('❌ Usage: node scripts/clone-tenant-menu.mjs --source <slug|id> --target <slug|id> [--execute]')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveTenant(ref) {
  const column = UUID_RE.test(ref) ? 'id' : 'slug'
  const { data, error } = await sb.from('tenants').select('id, name, slug').eq(column, ref).single()
  if (error || !data) throw new Error(`Tenant not found for ${column}="${ref}": ${error?.message ?? 'no row'}`)
  return data
}

// Columns to carry over (everything except identity/ownership/timestamps,
// which we regenerate or override).
const CATEGORY_COPY_COLS = [
  'name', 'description', 'icon', 'icon_color', 'order', 'is_active',
  'display_layout', 'default_addons',
]
const ITEM_COPY_COLS = [
  'name', 'description', 'price', 'discounted_price', 'image_url',
  'variations', 'variation_types', 'addons', 'is_available', 'is_featured',
  'order', 'bcg_classification', 'badge_text', 'show_in_checkout_upsell',
  'boost_priority',
]

const pick = (row, cols) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]))

async function main() {
  const source = await resolveTenant(sourceRef)
  const target = await resolveTenant(targetRef)

  if (source.id === target.id) throw new Error('Source and target are the same tenant — aborting.')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`SOURCE: ${source.name} (${source.slug}) ${source.id}`)
  console.log(`TARGET: ${target.name} (${target.slug}) ${target.id}`)
  console.log(`MODE:   ${execute ? '⚠️  EXECUTE (will mutate DB)' : '🔎 DRY RUN (no changes)'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const [{ data: srcCats, error: catErr }, { data: srcItems, error: itemErr }] = await Promise.all([
    sb.from('categories').select('*').eq('tenant_id', source.id).order('order'),
    sb.from('menu_items').select('*').eq('tenant_id', source.id).order('order'),
  ])
  if (catErr) throw catErr
  if (itemErr) throw itemErr

  const { count: tgtCatCount } = await sb.from('categories').select('*', { count: 'exact', head: true }).eq('tenant_id', target.id)
  const { count: tgtItemCount } = await sb.from('menu_items').select('*', { count: 'exact', head: true }).eq('tenant_id', target.id)

  const itemsWithImage = srcItems.filter((i) => i.image_url && i.image_url.trim() !== '').length
  console.log(`Source: ${srcCats.length} categories, ${srcItems.length} items (${itemsWithImage} with images)`)
  console.log(`Target (to be deleted): ${tgtCatCount} categories, ${tgtItemCount} items\n`)

  // Safety: confirm no order history references target items.
  const { data: tgtItemRows } = await sb.from('menu_items').select('id').eq('tenant_id', target.id)
  const tgtItemIds = (tgtItemRows ?? []).map((r) => r.id)
  if (tgtItemIds.length) {
    const { count: refCount } = await sb
      .from('order_items')
      .select('*', { count: 'exact', head: true })
      .in('menu_item_id', tgtItemIds)
    if (refCount && refCount > 0) {
      throw new Error(`Aborting: ${refCount} order_items reference the target's menu items (would orphan order history).`)
    }
  }

  // Build new category rows + id remap.
  const catIdMap = new Map()
  const newCats = srcCats.map((c) => {
    const newId = randomUUID()
    catIdMap.set(c.id, newId)
    return { id: newId, tenant_id: target.id, ...pick(c, CATEGORY_COPY_COLS) }
  })

  const newItems = srcItems.map((it) => ({
    id: randomUUID(),
    tenant_id: target.id,
    category_id: catIdMap.get(it.category_id) ?? null,
    ...pick(it, ITEM_COPY_COLS),
  }))

  const orphanItems = newItems.filter((i) => i.category_id === null).length
  if (orphanItems) console.log(`⚠️  ${orphanItems} source items have a category not in source categories (category_id=null)\n`)

  if (!execute) {
    console.log('DRY RUN — would perform:')
    console.log(`  1. DELETE ${tgtItemCount} menu_items from target`)
    console.log(`  2. DELETE ${tgtCatCount} categories from target`)
    console.log(`  3. INSERT ${newCats.length} categories into target`)
    console.log(`  4. INSERT ${newItems.length} menu_items into target`)
    console.log('\nSample new items:')
    newItems.slice(0, 5).forEach((i) => console.log(`  - ${i.name}  →  ${i.image_url || '(no image)'}`))
    console.log('\nRe-run with --execute to apply.')
    return
  }

  // ---- EXECUTE ----
  console.log('Deleting target menu_items...')
  const delItems = await sb.from('menu_items').delete().eq('tenant_id', target.id)
  if (delItems.error) throw delItems.error

  console.log('Deleting target categories...')
  const delCats = await sb.from('categories').delete().eq('tenant_id', target.id)
  if (delCats.error) throw delCats.error

  console.log(`Inserting ${newCats.length} categories...`)
  const insCats = await sb.from('categories').insert(newCats)
  if (insCats.error) throw insCats.error

  console.log(`Inserting ${newItems.length} menu_items...`)
  // batch to stay well under payload limits
  const BATCH = 100
  for (let i = 0; i < newItems.length; i += BATCH) {
    const slice = newItems.slice(i, i + BATCH)
    const ins = await sb.from('menu_items').insert(slice)
    if (ins.error) throw ins.error
  }

  // ---- verify ----
  const { count: finalCats } = await sb.from('categories').select('*', { count: 'exact', head: true }).eq('tenant_id', target.id)
  const { count: finalItems } = await sb.from('menu_items').select('*', { count: 'exact', head: true }).eq('tenant_id', target.id)
  const { count: finalNoImg } = await sb.from('menu_items').select('*', { count: 'exact', head: true }).eq('tenant_id', target.id).or('image_url.is.null,image_url.eq.')

  console.log('\n✅ Done.')
  console.log(`Target now has: ${finalCats} categories, ${finalItems} items (${finalNoImg} without image)`)
  if (finalCats !== newCats.length || finalItems !== newItems.length) {
    console.log('⚠️  Final counts do not match expected — please review.')
  }
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message)
  process.exit(1)
})
