/**
 * Server wiring shared by the /api/approvals/** routes: one place that turns a
 * verified caller into an ApprovalsContext and a reply into a response.
 */
import 'server-only'

import { after, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } from '@/lib/supabase/admin'
import { defaultSideEffectDeps } from './execute'
import type { ApprovalsReply } from './http'
import { createExpoApprovalNotifier } from './notifier'
import type { ApprovalsContext } from './service'
import type { ApprovalActor } from './types'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function buildApprovalsContext(actor: ApprovalActor, tenantId: string): ApprovalsContext {
  // Bounded: every tenant shares this database (CLAUDE.md, platform limits).
  const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient
  // Pushes and receipt chasing outlive the request: give them an unbounded client.
  const backgroundDb = createAdminClient() as unknown as SupabaseClient
  return {
    db,
    actor,
    tenantId,
    now: new Date(),
    notifier: createExpoApprovalNotifier(backgroundDb),
    schedule: (work) =>
      after(async () => {
        try {
          await work()
        } catch (error) {
          console.error('[approvals] background work failed', error)
        }
      }),
    sideEffectDeps: defaultSideEffectDeps,
  }
}

export function respond(reply: ApprovalsReply): NextResponse {
  return NextResponse.json(reply.body, { status: reply.status, headers: NO_STORE })
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ success: false, data: null, error, code: 'invalid_request' }, { status: 400, headers: NO_STORE })
}

export function serverError(scope: string, error: unknown): NextResponse {
  console.error(`[approvals] ${scope} failed`, error)
  return NextResponse.json(
    { success: false, data: null, error: 'Something went wrong. Refresh to see whether it went through before trying again.', code: 'server_error' },
    { status: 500, headers: NO_STORE },
  )
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}
