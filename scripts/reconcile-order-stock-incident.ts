#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { buildDepletionItemsFromConvexOrderItems, buildDepletionItemsFromOrderRows } from '@/lib/inventory/customer-order-items'
import { readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { decideOrderStockRepair } from '@/lib/inventory/order-stock-repair'
import { applyOrderStockMovements } from '@/lib/inventory/order-stock-service'
import { probePlatformStockContract } from '@/lib/inventory/platform-stock-contract'
import type { DepletionOrderItem } from '@/lib/inventory/order-depletion'

config({ path: '.env.local' })
config()

const INCIDENT_ISSUES = new Set(['JAVASCRIPT-NEXTJS-2H', 'JAVASCRIPT-NEXTJS-2M'])

interface ManifestEntry {
  issueId: string
  eventId: string
  occurredAt: string
  tenantId: string
  orderId: string
  revision: number
  url: string
}

interface CanonicalOrder {
  status: string | null
  paymentStatus: string | null
  revision: number
  outletId: string | null
  items: DepletionOrderItem[]
  selectionEvidenceRequired: boolean
  hasSelectionSnapshot: boolean
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function parseManifest(value: unknown): ManifestEntry[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Manifest must be a non-empty JSON array.')
  const rows = value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Manifest row ${index + 1} is not an object.`)
    const row = entry as Record<string, unknown>
    for (const key of ['issueId', 'eventId', 'occurredAt', 'tenantId', 'orderId', 'url']) {
      if (typeof row[key] !== 'string' || row[key] === '') throw new Error(`Manifest row ${index + 1} has invalid ${key}.`)
    }
    if (!INCIDENT_ISSUES.has(row.issueId as string)) throw new Error(`Manifest row ${index + 1} is outside this incident.`)
    if (!Number.isInteger(row.revision) || Number(row.revision) < 0) throw new Error(`Manifest row ${index + 1} has invalid revision.`)
    return row as unknown as ManifestEntry
  })

  const events = new Set<string>()
  const orders = new Map<string, ManifestEntry>()
  for (const row of rows) {
    if (events.has(row.eventId)) throw new Error(`Duplicate Sentry event ${row.eventId}.`)
    events.add(row.eventId)
    const key = `${row.tenantId}:${row.orderId}`
    const prior = orders.get(key)
    if (prior && prior.revision !== row.revision) throw new Error(`Conflicting captured revisions for ${key}.`)
    orders.set(key, prior ?? row)
  }
  return [...orders.values()]
}

async function assertContract(url: string, key: string): Promise<void> {
  const missing = await probePlatformStockContract({
    restUrl: `${url.replace(/\/$/, '')}/rest/v1`,
    apiKey: key,
  })
  if (missing.length) throw new Error(`Platform stock contract is incomplete: ${missing.join(', ')}`)
}

async function main(): Promise<void> {
  const manifestPath = argValue('--manifest')
  if (!manifestPath) throw new Error('--manifest <absolute-json-path> is required.')
  const execute = process.argv.includes('--execute')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')

  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
  if (execute && argValue('--confirm-count') !== String(manifest.length)) {
    throw new Error(`Execution requires --confirm-count ${manifest.length}.`)
  }
  await assertContract(url, key)

  const supabase = createAdminClient()
  const tenantIds = [...new Set(manifest.map((row) => row.tenantId))]
  const { data: tenantRows, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, inventory_enabled, order_backend, convex_deployment_url')
    .in('id', tenantIds)
  if (tenantError) throw tenantError
  const tenants = new Map((tenantRows ?? []).map((row) => [row.id, row]))
  const convexClients = new Map<string, ReturnType<typeof createConvexServerClient>>()

  let eligible = 0
  let applied = 0
  let skipped = 0
  let failed = 0
  console.log(`${execute ? 'EXECUTE' : 'DRY-RUN'} contract=ok events=${manifest.length} uniqueOrders=${manifest.length}`)

  for (const captured of manifest) {
    try {
      const tenant = tenants.get(captured.tenantId)
      let order: CanonicalOrder | null = null
      let inventoryEnabled = tenant?.inventory_enabled === true
      let backend = 'missing'

      if (tenant) {
        backend = resolveOrderBackend(tenant as OrderBackendTenantFields)
        if (backend === 'platform') {
          const { data, error } = await supabase
            .from('orders')
            .select('id, status, payment_status, revision_number, outlet_id, customer_data, order_items(menu_item_id, quantity, variation, addons)')
            .eq('id', captured.orderId)
            .eq('tenant_id', captured.tenantId)
            .maybeSingle()
          if (error) throw error
          if (data) {
            const saved = buildDepletionItemsFromOrderRows(data.order_items ?? [])
            const snapshot = readInventorySelectionSnapshot(data.customer_data, saved)
            const lines = data.order_items ?? []
            order = {
              status: data.status,
              paymentStatus: data.payment_status,
              revision: Number(data.revision_number ?? 0),
              outletId: data.outlet_id,
              items: snapshot ?? saved,
              selectionEvidenceRequired: lines.some((line) => Boolean(line.variation) || (Array.isArray(line.addons) && line.addons.length > 0)),
              hasSelectionSnapshot: snapshot !== null,
            }
          }
        } else if (backend === 'convex') {
          let convex = convexClients.get(captured.tenantId)
          if (!convex) {
            const secrets = await getTenantSecrets(supabase, captured.tenantId)
            if (!tenant.convex_deployment_url || !secrets?.convex_deploy_key) throw new Error('Convex backend credentials are incomplete.')
            convex = createConvexServerClient(tenant.convex_deployment_url, secrets.convex_deploy_key)
            convexClients.set(captured.tenantId, convex)
          }
          const data = await convex.query<Record<string, unknown> | null>('orders:getOrderByIdInternal', { orderId: captured.orderId })
          if (data) {
            const saved = buildDepletionItemsFromConvexOrderItems(Array.isArray(data.items) ? data.items : [])
            const snapshot = readInventorySelectionSnapshot(data.customerData, saved)
            const lines = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : []
            order = {
              status: typeof data.status === 'string' ? data.status : null,
              paymentStatus: typeof data.paymentStatus === 'string' ? data.paymentStatus : null,
              revision: Number(data.revisionNumber ?? 0),
              outletId: typeof data.outletId === 'string' ? data.outletId : null,
              items: snapshot ?? saved,
              selectionEvidenceRequired: lines.some((line) => (Array.isArray(line.variationSelections) && line.variationSelections.length > 0) || (Array.isArray(line.addons) && line.addons.length > 0)),
              hasSelectionSnapshot: snapshot !== null,
            }
          }
        } else {
          throw new Error(`Unsupported incident backend ${backend}.`)
        }
      }

      const decision = decideOrderStockRepair({
        exists: order !== null,
        inventoryEnabled,
        status: order?.status,
        paymentStatus: order?.paymentStatus,
        capturedRevision: captured.revision,
        currentRevision: order?.revision ?? captured.revision,
        itemCount: order?.items.length ?? 0,
        // The 2M/POS request carried exact option ids in its body, but the
        // order backends persist only display labels. Without a checkout-style
        // snapshot, an apparently plain saved row cannot prove the original
        // request was plain, so every 2M row requires that stronger evidence.
        selectionEvidenceRequired: captured.issueId === 'JAVASCRIPT-NEXTJS-2M' || (order?.selectionEvidenceRequired ?? false),
        hasSelectionSnapshot: order?.hasSelectionSnapshot ?? false,
      })

      if (decision.action === 'skip') {
        skipped += 1
        console.log(`SKIP tenant=${captured.tenantId} order=${captured.orderId} backend=${backend} reason=${decision.reason}`)
        continue
      }

      eligible += 1
      if (!execute) {
        console.log(`WOULD_APPLY tenant=${captured.tenantId} order=${captured.orderId} backend=${backend} revision=${captured.revision} items=${order!.items.length}`)
        continue
      }
      const result = await applyOrderStockMovements(captured.tenantId, captured.orderId, order!.items, 'sale', captured.revision, order!.outletId)
      applied += 1
      console.log(`APPLIED tenant=${captured.tenantId} order=${captured.orderId} backend=${backend} movements=${result.movementCount} skippedIngredients=${result.skipped.length}`)
    } catch (error) {
      failed += 1
      console.error(`ERROR tenant=${captured.tenantId} order=${captured.orderId} message=${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log(`SUMMARY eligible=${eligible} applied=${applied} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
