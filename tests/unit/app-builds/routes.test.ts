/** @jest-environment node */
import { NextRequest } from 'next/server'
import { easSignatureFor } from '@/lib/app-builds/eas-webhook'
import { createFakeBuildsDb, type FakeBuildsDb } from './fake-builds-db'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }) }))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

let db: FakeBuildsDb
jest.mock('@/lib/app-studio/service', () => ({ appStudioDb: () => db.client }))

const STORE = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-0000000000aa'
const EAS_ID = '11111111-2222-4333-8444-555555555555'
const CI_SECRET = 'c'.repeat(32)
const WEBHOOK_SECRET = 'w'.repeat(20)
const APP = {
  tenant_id: STORE,
  display_name: 'Kape Demo',
  bundle_id: 'com.webnegosyo.kapedemo',
  android_package: 'com.webnegosyo.kapedemo',
  icon_url: 'https://ik.imagekit.io/x/icon.png',
  splash_url: null,
  splash_background: '#1A2B3C',
  asc_app_id: null,
}

let token: string
const realFetch = global.fetch

beforeEach(async () => {
  db = createFakeBuildsDb([{ ...APP }])
  Object.assign(process.env, {
    GITHUB_DISPATCH_TOKEN: 'github_pat_test',
    APP_BUILD_GITHUB_REPO: 'owner/repo',
    APP_BUILD_CI_SECRET: CI_SECRET,
    EAS_WEBHOOK_SECRET: WEBHOOK_SECRET,
  })
  global.fetch = (async (_url: string, init: RequestInit) => {
    token = JSON.parse(String(init.body)).inputs.build_token
    return new Response(null, { status: 204 })
  }) as unknown as typeof fetch
  const { startBuilds } = await import('@/lib/app-builds/service')
  await startBuilds(db.client, STORE, ['android'], USER)
  global.fetch = realFetch
})

const ci = (path: string, method: string, headers: Record<string, string>, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })

const both = () => ({ 'x-app-build-secret': CI_SECRET, authorization: `Bearer ${token}` })

describe('/api/app-builds/manifest + /report (the build workflow)', () => {
  it('needs BOTH the CI secret and the build token: the token alone is public in the run inputs', async () => {
    const { GET } = await import('@/app/api/app-builds/manifest/route')
    expect((await GET(ci('/api/app-builds/manifest', 'GET', { authorization: `Bearer ${token}` }))).status).toBe(401)
    expect((await GET(ci('/api/app-builds/manifest', 'GET', { 'x-app-build-secret': CI_SECRET }))).status).toBe(401)
    expect((await GET(ci('/api/app-builds/manifest', 'GET', { 'x-app-build-secret': 'x'.repeat(32), authorization: `Bearer ${token}` }))).status).toBe(401)
    expect(db.builds[0].status).toBe('queued')
  })

  it('answers the snapshot and moves the build to preparing, then building on report', async () => {
    const { GET } = await import('@/app/api/app-builds/manifest/route')
    const response = await GET(ci('/api/app-builds/manifest', 'GET', both()))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { manifest } = await response.json()
    expect(manifest).toMatchObject({ platform: 'android', identity: { bundleId: APP.bundle_id }, submit: { enabled: true, playTrack: 'internal' } })
    expect(db.builds[0].status).toBe('preparing')

    const { POST } = await import('@/app/api/app-builds/report/route')
    expect((await POST(ci('/api/app-builds/report', 'POST', both(), { event: 'started', easBuildId: 'nope' }))).status).toBe(400)
    expect((await POST(ci('/api/app-builds/report', 'POST', both(), { event: 'started', easBuildId: EAS_ID }))).status).toBe(200)
    expect(db.builds[0]).toMatchObject({ status: 'building', eas_build_id: EAS_ID })
    // Once building, the token is spent.
    expect((await GET(ci('/api/app-builds/manifest', 'GET', both()))).status).toBe(401)
  })

  it('records a failure before EAS', async () => {
    const { POST } = await import('@/app/api/app-builds/report/route')
    expect((await POST(ci('/api/app-builds/report', 'POST', both(), { event: 'failed', reason: 'icon check' }))).status).toBe(200)
    expect(db.builds[0]).toMatchObject({ status: 'errored', error: 'The build stopped before EAS: icon check' })
  })
})

describe('/api/app-builds/eas-webhook', () => {
  const hook = (body: string, signature: string | null) =>
    new NextRequest('http://localhost/api/app-builds/eas-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature ? { 'expo-signature': signature } : {}) },
      body,
    })

  it('refuses an unsigned or wrongly signed call and changes nothing', async () => {
    db.builds[0].status = 'building'
    db.builds[0].eas_build_id = EAS_ID
    const { POST } = await import('@/app/api/app-builds/eas-webhook/route')
    const body = JSON.stringify({ id: EAS_ID, status: 'finished' })
    expect((await POST(hook(body, null))).status).toBe(401)
    expect((await POST(hook(body, easSignatureFor(body, 'another-secret-xyz')))).status).toBe(401)
    expect(db.builds[0].status).toBe('building')
  })

  it('finishes the build on a signed call, and answers 200 for builds it does not know', async () => {
    db.builds[0].status = 'building'
    db.builds[0].eas_build_id = EAS_ID
    const { POST } = await import('@/app/api/app-builds/eas-webhook/route')
    const body = JSON.stringify({ id: EAS_ID, status: 'finished', artifacts: { buildUrl: 'https://expo.dev/a.aab' }, metadata: { appVersion: '1.0.0', appBuildVersion: '4' } })
    const response = await POST(hook(body, easSignatureFor(body, WEBHOOK_SECRET)))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, outcome: 'applied' })
    expect(db.builds[0]).toMatchObject({ status: 'finished', submit_status: 'submitting', build_number: '4' })

    const stranger = JSON.stringify({ id: '99999999-2222-4333-8444-555555555555', status: 'errored' })
    const ignored = await POST(hook(stranger, easSignatureFor(stranger, WEBHOOK_SECRET)))
    expect(ignored.status).toBe(200)
    expect(await ignored.json()).toEqual({ ok: true, outcome: 'unknown-build' })
  })
})
