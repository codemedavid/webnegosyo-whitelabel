/**
 * The table a scanned code named, carried from the menu URL to the checkout
 * form. Storage is wrapped like linked-outlet's: a private-mode browser that
 * throws on storage must never break the storefront.
 */

import type { StorageLike } from '@/lib/outlets/outlet-selection'

const memoryStorage = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const throwingStorage = (): StorageLike => ({
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
})

// Imported lazily: next/jest leaves static imports ahead of jest.mock.
const load = async () => import('@/lib/table-qr-param')

const NOW = 1_700_000_000_000

describe('readTableParam', () => {
  it('reads and normalizes the table in the URL', async () => {
    const { readTableParam } = await load()
    expect(readTableParam((key) => (key === 'table' ? 'table 12' : null))).toBe('12')
    expect(readTableParam((key) => (key === 'table' ? 'a3' : null))).toBe('A3')
  })

  it('is null when the URL names no table, or only a prefix', async () => {
    const { readTableParam } = await load()
    expect(readTableParam(() => null)).toBeNull()
    expect(readTableParam(() => 'Table')).toBeNull()
  })
})

describe('linked table storage', () => {
  it('remembers the table per store and forgets it after the window', async () => {
    const { writeLinkedTable, readLinkedTable, LINKED_TABLE_TTL_MS, LINKED_TABLE_KEY_PREFIX } = await load()
    const storage = memoryStorage()
    writeLinkedTable(storage, 'cafe', 'Table 7', NOW)
    expect([...storage.map.keys()]).toEqual([`${LINKED_TABLE_KEY_PREFIX}cafe`])
    expect(readLinkedTable(storage, 'cafe', NOW + 1000)).toBe('7')
    expect(readLinkedTable(storage, 'other', NOW + 1000)).toBeNull()
    expect(readLinkedTable(storage, 'cafe', NOW + LINKED_TABLE_TTL_MS + 1)).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('writes nothing for an empty label and clears on demand', async () => {
    const { writeLinkedTable, readLinkedTable, clearLinkedTable } = await load()
    const storage = memoryStorage()
    writeLinkedTable(storage, 'cafe', '  ', NOW)
    expect(storage.map.size).toBe(0)
    writeLinkedTable(storage, 'cafe', '4', NOW)
    clearLinkedTable(storage, 'cafe')
    expect(readLinkedTable(storage, 'cafe', NOW)).toBeNull()
  })

  it('drops a corrupt record rather than trusting it', async () => {
    const { readLinkedTable, LINKED_TABLE_KEY_PREFIX } = await load()
    const storage = memoryStorage()
    storage.map.set(`${LINKED_TABLE_KEY_PREFIX}cafe`, '{not json')
    expect(readLinkedTable(storage, 'cafe', NOW)).toBeNull()
    storage.map.set(`${LINKED_TABLE_KEY_PREFIX}cafe`, JSON.stringify({ label: 5, savedAt: 'x' }))
    expect(readLinkedTable(storage, 'cafe', NOW)).toBeNull()
  })

  it('survives a browser that refuses storage', async () => {
    const { writeLinkedTable, readLinkedTable, clearLinkedTable } = await load()
    const storage = throwingStorage()
    expect(() => writeLinkedTable(storage, 'cafe', '1', NOW)).not.toThrow()
    expect(readLinkedTable(storage, 'cafe', NOW)).toBeNull()
    expect(() => clearLinkedTable(storage, 'cafe')).not.toThrow()
  })
})

describe('seedTableField', () => {
  const fields = [{ field_name: 'customer_name' }, { field_name: 'table_number' }]

  it('fills the table field when the form has one, leaving the input untouched', async () => {
    const { seedTableField } = await load()
    const initial = { customer_name: '', table_number: '' }
    const seeded = seedTableField(initial, fields, '12')
    expect(seeded).toEqual({ customer_name: '', table_number: '12' })
    expect(initial.table_number).toBe('')
  })

  it('adds nothing to a form that never asks for a table', async () => {
    const { seedTableField } = await load()
    expect(seedTableField({ customer_name: '' }, [{ field_name: 'customer_name' }], '12')).toEqual({ customer_name: '' })
  })

  it('leaves the form alone without a scanned table', async () => {
    const { seedTableField } = await load()
    expect(seedTableField({ table_number: '' }, fields, null)).toEqual({ table_number: '' })
  })
})

describe('preferDineInOrderType', () => {
  const types = [
    { id: 'pickup', type: 'pickup' },
    { id: 'dinein', type: 'dine_in' },
  ]

  it('switches a scanned guest onto dine-in', async () => {
    const { preferDineInOrderType } = await load()
    expect(preferDineInOrderType(types, 'pickup', true)).toBe('dinein')
  })

  it('keeps the remembered type without a scan, or when there is no dine-in type', async () => {
    const { preferDineInOrderType } = await load()
    expect(preferDineInOrderType(types, 'pickup', false)).toBe('pickup')
    expect(preferDineInOrderType([types[0]], 'pickup', true)).toBe('pickup')
    expect(preferDineInOrderType([types[0]], null, true)).toBeNull()
  })
})
