/**
 * @jest-environment node
 *
 * Row-level security refuses a write silently: no error, zero rows. A writer
 * that checks only `error` reports success. `assertRowsChanged` turns the
 * response into a result that cannot be read as success unless a row changed.
 */
import { assertRowsChanged, type WriteResponse } from '@/platform/db/assert-rows-changed'

interface Row {
  id: string
}

const response = (overrides: Partial<WriteResponse<Row>>): WriteResponse<Row> => ({ data: null, error: null, count: null, ...overrides })

describe('assertRowsChanged', () => {
  describe('a write that selected its rows back', () => {
    it('passes when rows came back', () => {
      expect(assertRowsChanged(response({ data: [{ id: 'a' }, { id: 'b' }], status: 200 }))).toEqual({
        ok: true,
        count: 2,
        rows: [{ id: 'a' }, { id: 'b' }],
      })
    })

    it('fails on zero rows with no error: the shape of an RLS refusal', () => {
      expect(assertRowsChanged(response({ data: [], status: 200 }))).toEqual({ ok: false, reason: 'no-rows-changed' })
    })

    it('reads .single() / .maybeSingle() as one row or none', () => {
      expect(assertRowsChanged(response({ data: { id: 'a' }, status: 200 }))).toEqual({ ok: true, count: 1, rows: [{ id: 'a' }] })
      expect(assertRowsChanged(response({ data: null, status: 200 }))).toEqual({ ok: false, reason: 'no-rows-changed' })
    })
  })

  describe("a write that asked for { count: 'exact' }", () => {
    it('passes on a positive count', () => {
      expect(assertRowsChanged(response({ count: 3, status: 204 }))).toEqual({ ok: true, count: 3, rows: [] })
    })

    it('fails on a count of zero', () => {
      expect(assertRowsChanged(response({ count: 0, status: 204 }))).toEqual({ ok: false, reason: 'no-rows-changed' })
    })
  })

  it('fails a write that asked for neither rows nor a count, instead of trusting "no error"', () => {
    expect(assertRowsChanged(response({ status: 204 }))).toEqual({ ok: false, reason: 'not-counted' })
    expect(assertRowsChanged({ error: null })).toEqual({ ok: false, reason: 'not-counted' })
  })

  it('returns the database error as it is', () => {
    const error = { message: 'new row violates row-level security policy', code: '42501' }

    expect(assertRowsChanged(response({ error, status: 403 }))).toEqual({ ok: false, reason: 'error', error })
    // An error wins even when rows are present.
    expect(assertRowsChanged(response({ data: [{ id: 'a' }], error }))).toEqual({ ok: false, reason: 'error', error })
  })

  describe('expected', () => {
    it('passes on exactly the expected number', () => {
      expect(assertRowsChanged(response({ data: [{ id: 'a' }] }), { expected: 1 }).ok).toBe(true)
    })

    it('fails when more or fewer rows changed than the writer meant', () => {
      expect(assertRowsChanged(response({ data: [{ id: 'a' }, { id: 'b' }] }), { expected: 1 })).toEqual({
        ok: false,
        reason: 'unexpected-count',
        count: 2,
        expected: 1,
      })
      expect(assertRowsChanged(response({ count: 1 }), { expected: 2 })).toEqual({
        ok: false,
        reason: 'unexpected-count',
        count: 1,
        expected: 2,
      })
    })

    it('still calls zero rows a refusal, whatever was expected', () => {
      expect(assertRowsChanged(response({ data: [] }), { expected: 3 })).toEqual({ ok: false, reason: 'no-rows-changed' })
    })
  })

  it('narrows: rows are only reachable on success', () => {
    const result = assertRowsChanged(response({ data: [{ id: 'a' }] }))

    // @ts-expect-error rows exist only once `ok` is checked
    void result.rows
    expect(result.ok && result.rows[0].id).toBe('a')
  })
})
