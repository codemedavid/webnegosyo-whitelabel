/** @jest-environment node */
import { readOrderNumber } from '../../mobile/lib/read-order-number'
it('enriches a confirmed order through the existing customer read RPC', async () => {
  expect(await readOrderNumber(async () => ({ data: [{ daily_number: 7 }], error: null }))).toBe(7)
})
it('keeps a saved order confirmed when display enrichment fails or times out', async () => {
  expect(await readOrderNumber(async () => { throw new Error('offline') })).toBeNull()
  expect(await readOrderNumber(() => new Promise(() => {}), 5)).toBeNull()
  expect(await readOrderNumber(async () => ({ data: [{ daily_number: -1 }], error: null }))).toBeNull()
})
