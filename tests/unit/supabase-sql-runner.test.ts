import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import {
  applySupabaseSchema,
  createSchemaRunner,
  type PgConnection,
  type PgConnector,
} from '@/lib/supabase-sql-runner'

const DB_URL = 'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres'
const BUNDLE = 'create table if not exists orders();'

// A fake postgres.js connection + connector — no module mocking needed because
// the driver is injected.
let unsafe: jest.Mock<PgConnection['unsafe']>
let end: jest.Mock<PgConnection['end']>
let connect: jest.Mock<PgConnector>

beforeEach(() => {
  unsafe = jest.fn<PgConnection['unsafe']>(async () => undefined)
  end = jest.fn<PgConnection['end']>(async () => undefined)
  const conn: PgConnection = { unsafe, end }
  connect = jest.fn<PgConnector>(() => conn)
})

describe('applySupabaseSchema', () => {
  it('connects with the tenant db url and runs the bundle via unsafe()', async () => {
    await applySupabaseSchema(DB_URL, BUNDLE, connect)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect.mock.calls[0][0]).toBe(DB_URL)
    expect(unsafe).toHaveBeenCalledWith(BUNDLE)
  })

  it('always closes the connection, even when the bundle fails', async () => {
    unsafe.mockRejectedValueOnce(new Error('permission denied for schema public'))

    await expect(applySupabaseSchema(DB_URL, BUNDLE, connect)).rejects.toThrow(
      'permission denied'
    )
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('closes the connection on the happy path', async () => {
    await applySupabaseSchema(DB_URL, BUNDLE, connect)
    expect(end).toHaveBeenCalledTimes(1)
  })
})

describe('createSchemaRunner', () => {
  it('produces a SqlRunner bound to the tenant db url', async () => {
    const run = createSchemaRunner(DB_URL, connect)
    await run(BUNDLE)

    expect(connect.mock.calls[0][0]).toBe(DB_URL)
    expect(unsafe).toHaveBeenCalledWith(BUNDLE)
  })
})
