/**
 * POST /api/loyalty/passes/sync — refresh wallet cards after the ledger moved.
 *
 * Called by database triggers via pg_net (`20260929120000_loyalty_wallet_passes`)
 * with `{ pass_id }` when a member's balance or rewards change, or
 * `{ program_id }` when the programme itself changes. The body is only an id,
 * everything is re-read with the service role, and a card whose rendered
 * content did not change reaches no device — a replay is a no-op. Because a
 * programme id fans out to every card on it, the call must also carry the
 * shared `X-Wallet-Sync-Secret` (Vault `wallet_pass_sync_secret` on the
 * database side, `WALLET_PASS_SYNC_SECRET` here).
 */

import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { loadWalletConfig } from '@/lib/loyalty/wallet-pass/config'
import { verifySyncSecret } from '@/lib/loyalty/wallet-pass/auth-token'
import { findPassById, listPassesForProgram } from '@/lib/loyalty/wallet-pass/pass-repository'
import { renderPass, syncGoogleClass, syncPass } from '@/lib/loyalty/wallet-pass/pass-service'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SYNC_LIMIT = { maxRequests: 600, windowMs: 60_000 }
const PROGRAM_SYNC_CONCURRENCY = 5

type SyncTarget = { kind: 'pass'; id: string } | { kind: 'program'; id: string }

function readTarget(body: unknown): SyncTarget | null {
  const value = body as { pass_id?: unknown; program_id?: unknown } | null
  if (typeof value?.pass_id === 'string' && UUID.test(value.pass_id)) return { kind: 'pass', id: value.pass_id }
  if (typeof value?.program_id === 'string' && UUID.test(value.program_id)) return { kind: 'program', id: value.program_id }
  return null
}

async function syncTarget(target: SyncTarget): Promise<void> {
  const config = loadWalletConfig()
  if (!config.apple && !config.google) return
  const admin = createAdminClient()

  if (target.kind === 'pass') {
    const row = await findPassById(admin, target.id)
    if (row) await syncPass(admin, row, config)
    return
  }

  const rows = await listPassesForProgram(admin, target.id)
  if (rows.length === 0) return
  const first = await renderPass(admin, rows[0], config.publicBaseUrl)
  if (first) await syncGoogleClass(config, first)

  for (let start = 0; start < rows.length; start += PROGRAM_SYNC_CONCURRENCY) {
    await Promise.all(rows.slice(start, start + PROGRAM_SYNC_CONCURRENCY).map((row) =>
      syncPass(admin, row, config).catch((error) => {
        console.error('[wallet-pass] programme card sync failed:', error instanceof Error ? error.message : error)
      }),
    ))
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  if (!checkRateLimit(`wallet-sync:${ip}`, SYNC_LIMIT).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  if (!verifySyncSecret(process.env.WALLET_PASS_SYNC_SECRET, request.headers.get('x-wallet-sync-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // Handled as an invalid target below.
  }
  const target = readTarget(body)
  if (!target) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  after(async () => {
    try {
      await syncTarget(target)
    } catch (error) {
      console.error('[wallet-pass] sync failed:', target, error instanceof Error ? error.message : error)
    }
  })
  return NextResponse.json({ accepted: true }, { status: 202 })
}
