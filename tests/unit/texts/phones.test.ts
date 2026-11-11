/** @jest-environment node */
/**
 * Sending phones, server side: the RPC rows become cards with the online rule
 * applied at the server's clock; rename only touches an enabled phone of this
 * store; disconnect goes through the revoke RPC; the phone's own report never
 * throws (it rides on a claim that must not fail because of it).
 */

// A module (not a script), so these test-file constants stay file-scoped.
export {}

jest.mock('server-only', () => ({}))

const NOW = new Date('2026-10-14T02:00:00Z') // 10:00 AM Manila
const TENANT = 't-1'

function row(overrides: Record<string, unknown> = {}) {
  return {
    device_id: 'dev-1', label: null, manufacturer: 'samsung', model: 'SM-A155F', os_version: '14', app_version: '1.0.12',
    sms_permission: true, ignoring_battery_opt: false, last_seen_at: '2026-10-14T01:59:00Z',
    enrolled_at: '2026-10-03T02:00:00Z', enrolled_by: 'Ana', sent_today: 37, failed_today: 1, claimed_now: 2,
    ...overrides,
  }
}

async function load() {
  return import('@/lib/texts/server/phones')
}

describe('readSenderDevices + toSendingPhone', () => {
  it('asks for Manila midnight and maps a row to a card', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [row()], error: null })
    const { readSenderDevices, toSendingPhone } = await load()
    const rows = await readSenderDevices({ rpc } as never, TENANT, NOW)
    expect(rpc).toHaveBeenCalledWith('list_sms_sender_devices', { p_tenant_id: TENANT, p_day_start: '2026-10-13T16:00:00.000Z' })
    expect(toSendingPhone(rows[0], { now: NOW, isQuietNow: false, isLimitReached: false })).toEqual({
      deviceId: 'dev-1', name: 'Samsung SM-A155F', hasCustomName: false, manufacturer: 'samsung', model: 'SM-A155F', appVersion: '1.0.12',
      isAppOld: true, state: 'ready', lastSeenAt: '2026-10-14T01:59:00Z', ageSeconds: 60, isInactive: false,
      connectedAt: '2026-10-03T02:00:00Z', connectedBy: 'Ana', sentToday: 37, failedToday: 1, sendingNow: 2,
      smsPermission: true, isBatteryUnrestricted: false,
    })
  })

  it('throws on an RPC error or an unexpected shape (never a silent empty list)', async () => {
    const { readSenderDevices } = await load()
    await expect(readSenderDevices({ rpc: async () => ({ data: null, error: { message: 'boom' } }) } as never, TENANT, NOW)).rejects.toThrow('boom')
    await expect(readSenderDevices({ rpc: async () => ({ data: [{ nope: 1 }], error: null }) } as never, TENANT, NOW)).rejects.toThrow('shape')
  })

  it('treats a missing counter as zero and a missing report as unknown', async () => {
    const { readSenderDevices, toSendingPhone } = await load()
    const bare = { device_id: 'dev-2', last_seen_at: null }
    const [only] = await readSenderDevices({ rpc: async () => ({ data: [bare], error: null }) } as never, TENANT, NOW)
    expect(toSendingPhone(only, { now: NOW, isQuietNow: false, isLimitReached: false })).toMatchObject({
      name: 'Android phone', state: 'never', sentToday: 0, smsPermission: null, isBatteryUnrestricted: null, isAppOld: false,
    })
  })
})

function renameDb(device: unknown, upsertError: unknown = null) {
  const upsert = jest.fn().mockResolvedValue({ error: upsertError })
  const maybeSingle = jest.fn().mockResolvedValue({ data: device, error: null })
  const chain = { select: () => chain, eq: () => chain, maybeSingle }
  const from = jest.fn((table: string) => (table === 'sms_sender_devices' ? { upsert } : chain))
  return { db: { from } as never, upsert }
}

describe('renamePhone', () => {
  it('saves a trimmed label for an enabled phone of this store', async () => {
    const { renamePhone } = await load()
    const { db, upsert } = renameDb({ device_id: 'dev-1' })
    expect(await renamePhone(db, TENANT, 'dev-1', '  Juan’s   phone ')).toEqual({ ok: true, value: null })
    expect(upsert).toHaveBeenCalledWith({ device_id: 'dev-1', tenant_id: TENANT, label: 'Juan’s phone' }, { onConflict: 'device_id' })
  })

  it('refuses a phone that is not (or no longer) connected', async () => {
    const { renamePhone } = await load()
    const { db, upsert } = renameDb(null)
    expect(await renamePhone(db, TENANT, 'dev-9', 'Front')).toMatchObject({ ok: false, status: 404 })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses an empty or over-long name', async () => {
    const { renamePhone } = await load()
    const { db } = renameDb({ device_id: 'dev-1' })
    expect(await renamePhone(db, TENANT, 'dev-1', '   ')).toMatchObject({ ok: false, code: 'invalid_label' })
    expect(await renamePhone(db, TENANT, 'dev-1', 'x'.repeat(41))).toMatchObject({ ok: false, code: 'invalid_label' })
  })
})

describe('disconnectPhone', () => {
  it('revokes through the RPC with the actor', async () => {
    const { disconnectPhone } = await load()
    const rpc = jest.fn().mockResolvedValue({ data: { ok: true }, error: null })
    expect(await disconnectPhone({ rpc } as never, TENANT, 'owner-1', 'dev-1')).toEqual({ ok: true, value: null })
    expect(rpc).toHaveBeenCalledWith('revoke_loyalty_sms_device', { p_tenant_id: TENANT, p_actor_id: 'owner-1', p_device_id: 'dev-1' })
  })

  it('reports a refusal and throws on a database error', async () => {
    const { disconnectPhone } = await load()
    const refused = { rpc: async () => ({ data: { ok: false, error: 'request_denied' }, error: null }) }
    expect(await disconnectPhone(refused as never, TENANT, 'owner-1', 'dev-1')).toMatchObject({ ok: false, status: 403 })
    const broken = { rpc: async () => ({ data: null, error: { message: 'down' } }) }
    await expect(disconnectPhone(broken as never, TENANT, 'owner-1', 'dev-1')).rejects.toThrow('down')
  })
})

describe('recordPhoneInfo', () => {
  const info = { manufacturer: 'samsung', model: 'SM-A155F', osVersion: '14', appVersion: '1.0.13', smsPermission: true, isBatteryUnrestricted: null }

  it('passes the report to the RPC', async () => {
    const { recordPhoneInfo } = await load()
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    await recordPhoneInfo({ rpc } as never, TENANT, 'dev-1', info)
    expect(rpc).toHaveBeenCalledWith('record_sms_sender_info', {
      p_tenant_id: TENANT, p_device_id: 'dev-1', p_manufacturer: 'samsung', p_model: 'SM-A155F', p_os: '14',
      p_app: '1.0.13', p_sms: true, p_bat: null,
    })
  })

  it('never throws, whatever the database does', async () => {
    const { recordPhoneInfo } = await load()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordPhoneInfo({ rpc: async () => ({ error: { code: '42501' } }) } as never, TENANT, 'dev-1', info)).resolves.toBeUndefined()
    await expect(recordPhoneInfo({ rpc: async () => { throw new Error('socket') } } as never, TENANT, 'dev-1', info)).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })
})
