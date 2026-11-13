/**
 * GET /api/app-builds/manifest — the build workflow fetches what to build.
 *
 * Caller: the `build-customer-app` GitHub workflow, with the CI secret AND
 * the build's one-time token (`verifyBuildCaller`). Answers the manifest App
 * Studio snapshotted when the build was started, and moves the build
 * queued → preparing. Works only while the build is queued or preparing and
 * the token is younger than 2 hours.
 */
import { NextResponse } from 'next/server'
import { defineRoute } from '@/platform/http/define-route'
import { verifyBuildCaller } from '@/lib/app-builds/ci-auth'
import { appBuildsDb, markPreparing } from '@/lib/app-builds/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineRoute({
  auth: { kind: 'device', scheme: 'app build CI secret + build token', verify: verifyBuildCaller },
  rateLimit: { bucket: 'app-build-manifest', per: 'ip', max: 30, window: '1m' },
  handler: async ({ device }) => {
    await markPreparing(appBuildsDb(), device)
    return NextResponse.json({ manifest: device.manifest }, { headers: { 'Cache-Control': 'no-store' } })
  },
})
