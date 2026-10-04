/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import {
  chooseOtpSender,
  dispatchOtpViaSemaphore,
  loadOtpRouting,
  GATEWAY_ONLINE_WINDOW_SECONDS,
} from '@/lib/loyalty/otp-delivery'

const tenant = '11111111-1111-1111-1111-111111111111'
const challenge = '66666666-6666-6666-6666-666666666666'
const job = '44444444-4444-4444-4444-444444444444'
const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
const semaphore = { apiKey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', senderName: 'CAFE' }

describe('chooseOtpSender', () => {
  test('prefers the store phone because it costs nothing', () => {
    expect(chooseOtpSender({ gatewayOnline: true, hasSemaphore: true })).toBe('gateway')
    expect(chooseOtpSender({ gatewayOnline: true, hasSemaphore: false })).toBe('gateway')
  })
  test('uses Semaphore only when no phone is online', () => {
    expect(chooseOtpSender({ gatewayOnline: false, hasSemaphore: true })).toBe('semaphore')
  })
  test('says nobody can send rather than queue a code that never leaves', () => {
    expect(chooseOtpSender({ gatewayOnline: false, hasSemaphore: false })).toBe('none')
  })
})

function database(overrides: Partial<Record<string, { data: unknown; error: unknown }>> = {}) {
  const responses: Record<string, { data: unknown; error: unknown }> = {
    loyalty_sms_sender_status: { data: { ok: true, gatewayOnline: false, lastSeenAt: null }, error: null },
    begin_loyalty_sms_server_dispatch: {
      data: {
        ok: true,
        jobId: job,
        payloadEncrypted: crypto.encryptSms({ tenantId: tenant, challengeId: challenge }, { phone: '+639171234567', code: '012345' }),
      },
      error: null,
    },
    finish_loyalty_sms_server_dispatch: { data: { ok: true }, error: null },
    ...overrides,
  }
  return { rpc: jest.fn((name: string) => Promise.resolve(responses[name] ?? { data: null, error: { message: 'unknown' } })) }
}

describe('loadOtpRouting', () => {
  test('asks the database with the shared online window', async () => {
    const db = database({ loyalty_sms_sender_status: { data: { ok: true, gatewayOnline: true, lastSeenAt: 'x' }, error: null } })
    const readFallback = jest.fn()
    const routing = await loadOtpRouting(tenant, { database: db, readFallback })
    expect(routing).toEqual({ sender: 'gateway', semaphore: null })
    expect(db.rpc).toHaveBeenCalledWith('loyalty_sms_sender_status', { p_tenant_id: tenant, p_window_seconds: GATEWAY_ONLINE_WINDOW_SECONDS })
    expect(readFallback).not.toHaveBeenCalled()
  })

  test('reads the Semaphore key only when no phone is online', async () => {
    const routing = await loadOtpRouting(tenant, { database: database(), readFallback: jest.fn(async () => semaphore) })
    expect(routing).toEqual({ sender: 'semaphore', semaphore })
  })

  test('reports none when offline and unconfigured', async () => {
    expect(await loadOtpRouting(tenant, { database: database(), readFallback: jest.fn(async () => null) }))
      .toEqual({ sender: 'none', semaphore: null })
  })

  test('an unreadable heartbeat with no fallback queues for a phone instead of blocking claims', async () => {
    const db = database({ loyalty_sms_sender_status: { data: null, error: { message: 'down' } } })
    expect(await loadOtpRouting(tenant, { database: db, readFallback: jest.fn(async () => null) }))
      .toEqual({ sender: 'gateway', semaphore: null })
  })

  test('an unreadable heartbeat with a fallback delivers through Semaphore rather than risk silence', async () => {
    const db = database({ loyalty_sms_sender_status: { data: null, error: { message: 'down' } } })
    expect(await loadOtpRouting(tenant, { database: db, readFallback: jest.fn(async () => semaphore) }))
      .toEqual({ sender: 'semaphore', semaphore })
  })

  test('an unreadable fallback key reads as not configured', async () => {
    expect(await loadOtpRouting(tenant, { database: database(), readFallback: jest.fn(async () => { throw new Error('x') }) }))
      .toEqual({ sender: 'none', semaphore: null })
  })
})

describe('dispatchOtpViaSemaphore', () => {
  test('takes the job, sends the decrypted code with the store template, then records the outcome', async () => {
    const db = database()
    const send = jest.fn(async () => ({ ok: true as const }))
    const outcome = await dispatchOtpViaSemaphore(
      { tenantId: tenant, challengeId: challenge, storeName: 'Cafe' },
      { database: db, crypto, semaphore, send },
    )
    expect(outcome).toBe('sent')
    expect(send).toHaveBeenCalledWith(semaphore, {
      phone: '+639171234567',
      code: '012345',
      template: '{otp} is your Cafe reward code. It expires in 5 minutes. Never share it with anyone.',
    })
    expect(db.rpc).toHaveBeenCalledWith('begin_loyalty_sms_server_dispatch', { p_tenant_id: tenant, p_challenge_id: challenge })
    expect(db.rpc).toHaveBeenCalledWith('finish_loyalty_sms_server_dispatch', { p_tenant_id: tenant, p_job_id: job, p_outcome: 'sent' })
  })

  test('records a refused send as failed', async () => {
    const db = database()
    const outcome = await dispatchOtpViaSemaphore(
      { tenantId: tenant, challengeId: challenge, storeName: 'Cafe' },
      { database: db, crypto, semaphore, send: jest.fn(async () => ({ ok: false as const, reason: 'rejected' as const })) },
    )
    expect(outcome).toBe('failed')
    expect(db.rpc).toHaveBeenCalledWith('finish_loyalty_sms_server_dispatch', { p_tenant_id: tenant, p_job_id: job, p_outcome: 'failed' })
  })

  test('leaves a job a phone already took alone and never sends', async () => {
    const send = jest.fn()
    const db = database({ begin_loyalty_sms_server_dispatch: { data: { ok: false, error: 'request_denied' }, error: null } })
    expect(await dispatchOtpViaSemaphore({ tenantId: tenant, challengeId: challenge, storeName: 'Cafe' }, { database: db, crypto, semaphore, send }))
      .toBe('not_started')
    expect(send).not.toHaveBeenCalled()
  })

  test('a payload that fails authentication is recorded failed and never sent', async () => {
    const send = jest.fn()
    const db = database({ begin_loyalty_sms_server_dispatch: { data: { ok: true, jobId: job, payloadEncrypted: 'v1.garbage' }, error: null } })
    expect(await dispatchOtpViaSemaphore({ tenantId: tenant, challengeId: challenge, storeName: 'Cafe' }, { database: db, crypto, semaphore, send }))
      .toBe('failed')
    expect(send).not.toHaveBeenCalled()
  })

  test('an unconfirmed outcome write is reported, not thrown', async () => {
    const db = database({ finish_loyalty_sms_server_dispatch: { data: null, error: { message: 'down' } } })
    expect(await dispatchOtpViaSemaphore(
      { tenantId: tenant, challengeId: challenge, storeName: 'Cafe' },
      { database: db, crypto, semaphore, send: jest.fn(async () => ({ ok: true as const })) },
    )).toBe('sent_unrecorded')
  })
})
