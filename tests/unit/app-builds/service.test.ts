/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}))

import { applyEasEvent, buildsOverview, findCiBuild, markBuilding, markCiFailed, markPreparing, startBuilds } from '@/lib/app-builds/service'
import { hashBuildToken } from '@/lib/app-builds/pipeline'
import { createFakeBuildsDb, type FakeBuildsDb } from './fake-builds-db'

const STORE = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-0000000000aa'
const EAS_ID = '11111111-2222-4333-8444-555555555555'
const OTHER_EAS_ID = '99999999-2222-4333-8444-555555555555'

const APP = {
  tenant_id: STORE,
  display_name: 'Kape Demo',
  bundle_id: 'com.webnegosyo.kapedemo',
  android_package: 'com.webnegosyo.kapedemo',
  icon_url: 'https://ik.imagekit.io/x/icon.png',
  splash_url: null,
  splash_background: '#1A2B3C',
  asc_app_id: '1234567890',
}

const ENV = {
  GITHUB_DISPATCH_TOKEN: 'github_pat_test',
  APP_BUILD_GITHUB_REPO: 'owner/repo',
  APP_BUILD_CI_SECRET: 'c'.repeat(32),
  EAS_WEBHOOK_SECRET: 'w'.repeat(20),
}

let db: FakeBuildsDb
let dispatched: { build_token: string }[]
let dispatchStatus: number
const realFetch = global.fetch

beforeEach(() => {
  db = createFakeBuildsDb([{ ...APP }])
  dispatched = []
  dispatchStatus = 204
  Object.assign(process.env, ENV)
  global.fetch = (async (_url: string, init: RequestInit) => {
    dispatched.push(JSON.parse(String(init.body)).inputs)
    return new Response(null, { status: dispatchStatus })
  }) as unknown as typeof fetch
})

afterAll(() => {
  global.fetch = realFetch
  for (const name of Object.keys(ENV)) delete process.env[name]
})

/** The build token App Studio dispatched for the nth build. */
const tokenOf = (index: number) => dispatched[index].build_token

describe('startBuilds', () => {
  it('starts one build per platform, stores only the token hash, dispatches only the token', async () => {
    const builds = await startBuilds(db.client, STORE, ['ios', 'android'], USER)
    expect(builds.map((build) => [build.platform, build.status, build.sendsToTesters])).toEqual([
      ['ios', 'queued', true],
      ['android', 'queued', true],
    ])
    expect(dispatched).toHaveLength(2)
    for (const [index, row] of db.builds.entries()) {
      expect(row.token_hash).toBe(hashBuildToken(tokenOf(index)))
      expect(JSON.stringify(row)).not.toContain(tokenOf(index))
      expect(row.created_by).toBe(USER)
    }
    expect(builds[0]).not.toHaveProperty('token_hash')
  })

  it('refuses a second open build on the same platform', async () => {
    // The fake DB stamps rows from 2026-11-13T12:00Z: pass a clock just after
    // it, or the real clock (hours later) sees the first build as stuck and
    // closes it, and the test fails on every day after it was written.
    const justAfter = new Date('2026-11-13T12:01:00Z')
    await startBuilds(db.client, STORE, ['ios'], USER, justAfter)
    await expect(startBuilds(db.client, STORE, ['ios'], USER, justAfter)).rejects.toThrow('An iOS build is already running for this app.')
  })

  it('closes a stuck build first, so a lost CI run never blocks the app', async () => {
    await startBuilds(db.client, STORE, ['ios'], USER)
    db.builds[0].updated_at = '2026-11-13T09:00:00.000Z'
    const [fresh] = await startBuilds(db.client, STORE, ['ios'], USER, new Date('2026-11-13T12:00:00Z'))
    expect(fresh.status).toBe('queued')
    expect(db.builds[0]).toMatchObject({ status: 'errored', error: expect.stringMatching(/didn’t start/) })
  })

  it('closes the build with the reason when GitHub refuses the dispatch', async () => {
    dispatchStatus = 401
    const [build] = await startBuilds(db.client, STORE, ['android'], USER)
    expect(build).toMatchObject({ status: 'errored', error: 'The build workflow couldn’t be started (GitHub answered 401).' })
  })

  it('refuses when the pipeline env or the identity is missing, and writes nothing', async () => {
    delete process.env.EAS_WEBHOOK_SECRET
    await expect(startBuilds(db.client, STORE, ['ios'], USER)).rejects.toThrow(/missing EAS_WEBHOOK_SECRET/)
    process.env.EAS_WEBHOOK_SECRET = ENV.EAS_WEBHOOK_SECRET
    db.apps[0].icon_url = null
    await expect(startBuilds(db.client, STORE, ['ios'], USER)).rejects.toThrow('Add an app icon (Identity tab).')
    expect(db.builds).toHaveLength(0)
    expect(dispatched).toHaveLength(0)
  })

  it('does not send iOS to TestFlight without an App Store Connect id', async () => {
    db.apps[0].asc_app_id = null
    const overview = await buildsOverview(db.client, STORE)
    expect(overview.submitNotes.ios).toMatch(/App Store Connect/)
    const [build] = await startBuilds(db.client, STORE, ['ios'], USER)
    expect(build.sendsToTesters).toBe(false)
  })
})

describe('the workflow side', () => {
  it('trades the token for the snapshot, then moves queued → preparing → building', async () => {
    await startBuilds(db.client, STORE, ['ios'], USER)
    // An identity edit after the start never changes what is built.
    db.apps[0].display_name = 'Renamed'
    const build = await findCiBuild(db.client, tokenOf(0))
    expect(build?.manifest.identity.displayName).toBe('Kape Demo')
    await markPreparing(db.client, build!)
    expect(db.builds[0].status).toBe('preparing')
    expect(await markBuilding(db.client, build!.id, EAS_ID.toUpperCase())).toBe(true)
    expect(db.builds[0]).toMatchObject({ status: 'building', eas_build_id: EAS_ID })
    // Building: the token no longer opens anything, and a second report changes nothing.
    expect(await findCiBuild(db.client, tokenOf(0))).toBeNull()
    expect(await markBuilding(db.client, build!.id, OTHER_EAS_ID)).toBe(false)
    expect(await markCiFailed(db.client, build!.id, 'late')).toBe(false)
    expect(db.builds[0].eas_build_id).toBe(EAS_ID)
  })

  it('refuses an unknown or expired token (tokens work for 2 hours)', async () => {
    await startBuilds(db.client, STORE, ['ios'], USER, new Date('2026-11-13T12:00:00Z'))
    expect(await findCiBuild(db.client, 'wnbt_' + 'x'.repeat(43), new Date('2026-11-13T12:01:00Z'))).toBeNull()
    expect(await findCiBuild(db.client, tokenOf(0), new Date('2026-11-13T13:59:00Z'))).not.toBeNull()
    expect(await findCiBuild(db.client, tokenOf(0), new Date('2026-11-13T14:01:00Z'))).toBeNull()
  })

  it('records a failure before EAS', async () => {
    await startBuilds(db.client, STORE, ['android'], USER)
    expect(await markCiFailed(db.client, db.builds[0].id as string, 'The build stopped before EAS: icon check')).toBe(true)
    expect(db.builds[0]).toMatchObject({ status: 'errored', error: 'The build stopped before EAS: icon check' })
  })
})

describe('applyEasEvent', () => {
  async function building() {
    await startBuilds(db.client, STORE, ['ios'], USER)
    await markBuilding(db.client, db.builds[0].id as string, EAS_ID)
    return db.builds[0]
  }
  const finished = { kind: 'build' as const, easBuildId: EAS_ID, buildId: null, status: 'finished' as const, artifactUrl: 'https://expo.dev/a.ipa', appVersion: '1.0.0', buildNumber: '3', error: null }

  it('finishes the build and marks the submission under way', async () => {
    const row = await building()
    expect(await applyEasEvent(db.client, finished)).toBe('applied')
    expect(row).toMatchObject({ status: 'finished', artifact_url: 'https://expo.dev/a.ipa', app_version: '1.0.0', build_number: '3', submit_status: 'submitting' })
    expect(row.finished_at).toBeTruthy()
    expect(await applyEasEvent(db.client, { kind: 'submit', easBuildId: EAS_ID, ok: true, error: null })).toBe('applied')
    expect(row.submit_status).toBe('submitted')
  })

  it('a replay or a late contrary event changes nothing', async () => {
    const row = await building()
    await applyEasEvent(db.client, finished)
    expect(await applyEasEvent(db.client, finished)).toBe('unchanged')
    expect(await applyEasEvent(db.client, { ...finished, status: 'errored', error: 'late', artifactUrl: null })).toBe('unchanged')
    expect(row).toMatchObject({ status: 'finished', error: null, artifact_url: 'https://expo.dev/a.ipa' })
    await applyEasEvent(db.client, { kind: 'submit', easBuildId: EAS_ID, ok: true, error: null })
    expect(await applyEasEvent(db.client, { kind: 'submit', easBuildId: EAS_ID, ok: false, error: 'late' })).toBe('unchanged')
    expect(row.submit_status).toBe('submitted')
  })

  it('keeps a submission report that overtakes its build webhook', async () => {
    const row = await building()
    expect(await applyEasEvent(db.client, { kind: 'submit', easBuildId: EAS_ID, ok: true, error: null })).toBe('applied')
    await applyEasEvent(db.client, finished)
    expect(row).toMatchObject({ status: 'finished', submit_status: 'submitted' })
  })

  it('finds a build whose EAS id never came back, by the wnb: message', async () => {
    await startBuilds(db.client, STORE, ['ios'], USER)
    const row = db.builds[0]
    expect(await applyEasEvent(db.client, { ...finished, buildId: row.id as string })).toBe('applied')
    expect(row).toMatchObject({ status: 'finished', eas_build_id: EAS_ID })
  })

  it('ignores builds it does not know, and a message naming a build that has another EAS id', async () => {
    const row = await building()
    expect(await applyEasEvent(db.client, { ...finished, easBuildId: OTHER_EAS_ID })).toBe('unknown-build')
    expect(await applyEasEvent(db.client, { ...finished, easBuildId: OTHER_EAS_ID, buildId: row.id as string })).toBe('unknown-build')
    expect(row.status).toBe('building')
  })

  it('records a failed build and a failed submission with their reasons', async () => {
    const row = await building()
    await applyEasEvent(db.client, { ...finished, status: 'errored', error: 'Pod install failed', artifactUrl: null })
    expect(row).toMatchObject({ status: 'errored', error: 'Pod install failed', submit_status: 'none' })

    db = createFakeBuildsDb([{ ...APP }])
    const second = await building()
    await applyEasEvent(db.client, finished)
    await applyEasEvent(db.client, { kind: 'submit', easBuildId: EAS_ID, ok: false, error: 'Missing export compliance' })
    expect(second).toMatchObject({ status: 'finished', submit_status: 'submit_failed', error: 'Sending to testers failed: Missing export compliance' })
  })
})
