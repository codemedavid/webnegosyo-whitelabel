/**
 * POST /api/app-builds/report — the build workflow says how starting went.
 *
 *   { event: 'started', easBuildId }  the EAS build exists → building
 *   { event: 'failed', reason }       it stopped before EAS (asset check, CLI) → errored
 *
 * Same credential as the manifest route (CI secret + build token). Only a
 * build that is still queued/preparing moves; anything else answers 409 and
 * changes nothing.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { defineRoute } from '@/platform/http/define-route'
import { verifyBuildCaller } from '@/lib/app-builds/ci-auth'
import { appBuildsDb, markBuilding, markCiFailed } from '@/lib/app-builds/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const reportSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('started'), easBuildId: z.string().regex(UUID) }),
  z.object({ event: z.literal('failed'), reason: z.string().trim().min(1).max(500) }),
])

export const POST = defineRoute({
  auth: { kind: 'device', scheme: 'app build CI secret + build token', verify: verifyBuildCaller },
  rateLimit: { bucket: 'app-build-report', per: 'ip', max: 30, window: '1m' },
  body: reportSchema,
  handler: async ({ device, body }) => {
    const db = appBuildsDb()
    const moved = body.event === 'started'
      ? await markBuilding(db, device.id, body.easBuildId)
      : await markCiFailed(db, device.id, `The build stopped before EAS: ${body.reason}`)
    return moved
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: 'This build is no longer waiting to start.' }, { status: 409 })
  },
})
