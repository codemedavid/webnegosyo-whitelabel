/** @jest-environment node */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PosOrderPayload } from '../../../webnegosyo-desktop/src/shared/types'

const payload: PosOrderPayload = { clientOrderId: 'new', source: 'pos', total: 10, itemCount: 1, customerName: 'Guest', customerContact: '', items: [] }

let mockDirectory: string
jest.mock('electron', () => ({ app: { getPath: () => mockDirectory } }), { virtual: true })

beforeEach(() => {
  jest.resetModules()
  mockDirectory = mkdtempSync(join(tmpdir(), 'pos-offline-test-'))
})
afterEach(() => rmSync(mockDirectory, { recursive: true, force: true }))

it('preserves an unreadable ledger instead of overwriting existing paid sales', async () => {
  const path = join(mockDirectory, 'pos-orders.json')
  writeFileSync(path, '{damaged')
  const { savePosOrder } = await import('../../../webnegosyo-desktop/src/main/pos-store')
  expect(() => savePosOrder(payload, 'paid', { tenantId: 't1', convexUrl: 'https://one.convex.cloud' })).toThrow()
  expect(readFileSync(path, 'utf8')).toBe('{damaged')
})

it('persists tenant scope without sending it inside the mutation payload', async () => {
  const { savePosOrder, getPendingPosOrders } = await import('../../../webnegosyo-desktop/src/main/pos-store')
  savePosOrder(payload, 'paid', { tenantId: 't1', convexUrl: 'https://one.convex.cloud' })
  expect(getPendingPosOrders()).toEqual([expect.objectContaining({ tenantId: 't1', convexUrl: 'https://one.convex.cloud', payload })])
  expect(() => savePosOrder(payload, 'paid', { tenantId: 't2', convexUrl: 'https://two.convex.cloud' })).toThrow()
})
