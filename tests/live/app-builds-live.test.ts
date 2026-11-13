/** @jest-environment node */
/**
 * LIVE check of the store-build pipeline's server side against the real
 * PLATFORM database (customer app P9), on sample-demo's throwaway App Studio
 * app (bundle id ending `.simtest`, status paused, never published). One
 * Android build is started exactly as App Studio starts it, then driven
 * through the real routes the way the workflow and EAS call them:
 *
 *   startBuilds → GET /api/app-builds/manifest → POST /api/app-builds/report
 *   → POST /api/app-builds/eas-webhook (BUILD finished, SUBMIT finished)
 *   → a replayed contrary webhook changes nothing
 *
 *   APP_BUILDS_LIVE=1 npx jest tests/live/app-builds-live.test.ts
 *
 * Stubbed: only GitHub (the dispatch call is answered 204 here, so no real
 * workflow runs) and the rate limiter. The test app gets an icon and splash
 * colour for the run and its own values back afterwards; the build rows it
 * made are deleted. Nothing else is written.
 */
import { randomUUID } from 'node:crypto'
import fs from 'fs'
import path from 'path'
import type { NextRequest as NextRequestType } from 'next/server'

const isLive = process.env.APP_BUILDS_LIVE === '1'
const TEST_ICON = 'https://ik.imagekit.io/hd3mbcia1/tenants/logos/LOGO_wwqn3g.jpg?tr=w-1024,h-1024'
const CI_SECRET = `live-ci-secret-${randomUUID()}`
const WEBHOOK_SECRET = `live-webhook-secret-${randomUUID()}`

function loadEnv(): void {
  const candidates = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '../../../.env.local')]
  const file = candidates.find((candidate) => fs.existsSync(candidate))
  if (!file) throw new Error('No .env.local found for the live run')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  Object.assign(process.env, {
    GITHUB_DISPATCH_TOKEN: 'live-test-not-a-github-token',
    APP_BUILD_GITHUB_REPO: 'live-test/not-a-repo',
    APP_BUILD_CI_SECRET: CI_SECRET,
    EAS_WEBHOOK_SECRET: WEBHOOK_SECRET,
  })
  delete process.env.APP_BUILD_DRY_RUN
}

if (isLive) loadEnv()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }) }))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

const describeLive = isLive ? describe : describe.skip

describeLive('store builds against the platform database (sample-demo test app)', () => {
  jest.setTimeout(60_000)

  let NextRequest: typeof NextRequestType
  let service: typeof import('@/lib/app-builds/service')
  let tenantId: string
  let original: { icon_url: string | null; splash_background: string | null; splash_url: string | null }
  const madeBuilds: string[] = []
  const realFetch = global.fetch
  let dispatchedToken: string | null = null

  beforeAll(async () => {
    NextRequest = (await import('next/server')).NextRequest
    service = await import('@/lib/app-builds/service')
    const db = service.appBuildsDb()
    const { data: app, error } = await db
      .from('tenant_apps')
      .select('tenant_id, icon_url, splash_background, splash_url, bundle_id, status')
      .like('bundle_id', '%.simtest')
      .maybeSingle()
    if (error || !app) throw new Error(`test app not found: ${error?.message ?? 'no .simtest app'}`)
    if (app.status === 'live') throw new Error('refusing to run on a live app')
    tenantId = app.tenant_id
    original = { icon_url: app.icon_url, splash_background: app.splash_background, splash_url: app.splash_url }
    const { data: set } = await db
      .from('tenant_apps')
      .update({ icon_url: TEST_ICON, splash_background: '#FFFFFF', splash_url: null })
      .eq('tenant_id', tenantId)
      .select('tenant_id')
    if ((set ?? []).length !== 1) throw new Error('could not set the test icon')

    // GitHub is the one thing not called for real: answer the dispatch, pass everything else through.
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('https://api.github.com/')) {
        dispatchedToken = JSON.parse(String(init?.body)).inputs.build_token
        return new Response(null, { status: 204 })
      }
      return realFetch(input, init)
    }) as typeof fetch
  })

  afterAll(async () => {
    global.fetch = realFetch
    if (!tenantId) return
    const db = service.appBuildsDb()
    if (madeBuilds.length > 0) await db.from('tenant_app_builds').delete().in('id', madeBuilds)
    await db.from('tenant_apps').update(original).eq('tenant_id', tenantId)
    const { data: left } = await db.from('tenant_app_builds').select('id').in('id', madeBuilds.length ? madeBuilds : [randomUUID()])
    expect(left ?? []).toEqual([])
  })

  const readBuild = async (id: string) => {
    const { data } = await service.appBuildsDb().from('tenant_app_builds').select('*').eq('id', id).single()
    return data!
  }

  const ciRequest = (route: string, method: 'GET' | 'POST', body?: unknown) =>
    new NextRequest(`http://localhost${route}`, {
      method,
      headers: {
        'x-app-build-secret': CI_SECRET,
        authorization: `Bearer ${dispatchedToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

  const webhook = async (payload: unknown) => {
    const { easSignatureFor } = await import('@/lib/app-builds/eas-webhook')
    const body = JSON.stringify(payload)
    const { POST } = await import('@/app/api/app-builds/eas-webhook/route')
    return POST(
      new NextRequest('http://localhost/api/app-builds/eas-webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'expo-signature': easSignatureFor(body, WEBHOOK_SECRET) },
        body,
      }),
    )
  }

  it('runs one build from App Studio to "on Play internal testing"', async () => {
    const userId = randomUUID()
    const [started] = await service.startBuilds(service.appBuildsDb(), tenantId, ['android'], userId)
    madeBuilds.push(started.id)
    expect(started).toMatchObject({ platform: 'android', status: 'queued', sendsToTesters: true })
    expect(dispatchedToken).toMatch(/^wnbt_/)
    const stored = await readBuild(started.id)
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(stored)).not.toContain(dispatchedToken)

    // A second Android build is refused while this one is open.
    await expect(service.startBuilds(service.appBuildsDb(), tenantId, ['android'], userId)).rejects.toThrow(/already running/)

    // The workflow trades its token for the snapshot.
    const { GET } = await import('@/app/api/app-builds/manifest/route')
    const manifestResponse = await GET(ciRequest('/api/app-builds/manifest', 'GET'))
    expect(manifestResponse.status).toBe(200)
    const { manifest } = await manifestResponse.json()
    expect(manifest).toMatchObject({ buildId: started.id, platform: 'android', assets: { iconUrl: TEST_ICON }, submit: { playTrack: 'internal' } })
    expect((await readBuild(started.id)).status).toBe('preparing')

    // ...and reports the EAS build it started.
    const easBuildId = randomUUID()
    const { POST: report } = await import('@/app/api/app-builds/report/route')
    expect((await report(ciRequest('/api/app-builds/report', 'POST', { event: 'started', easBuildId }))).status).toBe(200)
    expect(await readBuild(started.id)).toMatchObject({ status: 'building', eas_build_id: easBuildId })

    // EAS: build finished, then the submission.
    const finished = await webhook({
      id: easBuildId,
      platform: 'android',
      status: 'finished',
      artifacts: { buildUrl: 'https://expo.dev/artifacts/eas/live-test.aab' },
      metadata: { appVersion: '1.0.0', appBuildVersion: '1', message: manifest.message },
    })
    expect(await finished.json()).toEqual({ ok: true, outcome: 'applied' })
    expect(await readBuild(started.id)).toMatchObject({ status: 'finished', submit_status: 'submitting', app_version: '1.0.0', build_number: '1' })

    const submitted = await webhook({ id: randomUUID(), platform: 'android', status: 'finished', turtleBuildId: easBuildId })
    expect(await submitted.json()).toEqual({ ok: true, outcome: 'applied' })

    // A replayed, contrary build event changes nothing (the trigger and the conditional write).
    const replay = await webhook({ id: easBuildId, platform: 'android', status: 'errored', error: { message: 'late' } })
    expect(await replay.json()).toEqual({ ok: true, outcome: 'unchanged' })
    const final = await readBuild(started.id)
    expect(final).toMatchObject({ status: 'finished', submit_status: 'submitted', error: null })
    expect(final.finished_at).toBeTruthy()

    // The panel's read.
    const overview = await service.buildsOverview(service.appBuildsDb(), tenantId)
    expect(overview.builds[0]).toMatchObject({ id: started.id, status: 'finished', submitStatus: 'submitted', buildNumber: '1' })
    expect(overview.missingEnv).toEqual([])
    expect(overview.problems).toEqual([])
  })
})
