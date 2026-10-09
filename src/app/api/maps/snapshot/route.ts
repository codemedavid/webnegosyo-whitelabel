import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { gateAppMapsRequest, latLngSchema, mapsFail, NO_STORE } from '@/lib/maps/app-maps-request'
import { signSnapshotUrl, SNAPSHOT_MAX_SIZE, SNAPSHOT_MIN_SIZE } from '@/lib/maps/apple/snapshot-url'

/**
 * POST /api/maps/snapshot — a signed Apple Maps image URL of one pinned spot.
 *
 * The merchant app shows it as the delivery address's map preview; the image
 * itself is fetched from Apple by the device. Body: `{ tenantId, at, width,
 * height }` (points). Same gate as `/api/maps/places`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sizeSchema = z.number().finite().min(SNAPSHOT_MIN_SIZE).max(SNAPSHOT_MAX_SIZE)

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  at: latLngSchema,
  width: sizeSchema,
  height: sizeSchema,
})

const BUDGETS = {
  bucket: 'maps-snapshot',
  burst: { limit: 20, windowSec: 60 },
  daily: { limit: 500, windowSec: 86_400 },
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return mapsFail(400, 'That map preview request was not valid.')

  const { tenantId, at, width, height } = parsed.data
  const gate = await gateAppMapsRequest(request, tenantId, BUDGETS)
  if (!gate.ok) return gate.response
  if (!gate.config) return mapsFail(503, 'Map preview is unavailable.')

  try {
    const url = signSnapshotUrl(gate.config, { center: at, width, height })
    return NextResponse.json({ url }, { headers: NO_STORE })
  } catch (error) {
    // A malformed key is a deploy problem: log it, never echo it.
    console.error('[maps-snapshot] failed to sign a snapshot:', error instanceof Error ? error.message : error)
    return mapsFail(503, 'Map preview is unavailable.')
  }
}
