/**
 * The branch a printed link named, remembered across routes.
 *
 * Deliberately separate from `outlet-selection`'s stored choice: that one
 * carries a mode the customer picked on the splash chooser, and a QR code
 * carries no mode at all. Widening the existing record to allow a missing mode
 * would make every reader of it handle a half-filled selection; a second, much
 * smaller key keeps that flow exactly as it is.
 */

import {
  LINKED_OUTLET_KEY_PREFIX,
  LINKED_OUTLET_TTL_MS,
  clearLinkedOutletSlug,
  readLinkedOutletSlug,
  writeLinkedOutletSlug,
} from '@/lib/outlets/linked-outlet'
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
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('denied')
  },
  removeItem: () => {
    throw new Error('denied')
  },
})

const NOW = 1_700_000_000_000

describe('linked outlet storage', () => {
  it('reads back the slug it wrote', () => {
    // Arrange
    const storage = memoryStorage()

    // Act
    writeLinkedOutletSlug(storage, 'acme', 'cainta', NOW)

    // Assert
    expect(readLinkedOutletSlug(storage, 'acme', NOW)).toBe('cainta')
  })

  it('keeps tenants apart', () => {
    // Arrange
    const storage = memoryStorage()
    writeLinkedOutletSlug(storage, 'acme', 'cainta', NOW)

    // Act + Assert
    expect(readLinkedOutletSlug(storage, 'other-tenant', NOW)).toBeNull()
    expect(storage.map.has(`${LINKED_OUTLET_KEY_PREFIX}acme`)).toBe(true)
  })

  it('forgets a link older than the retention window', () => {
    // Arrange
    const storage = memoryStorage()
    writeLinkedOutletSlug(storage, 'acme', 'cainta', NOW)

    // Act
    const slug = readLinkedOutletSlug(storage, 'acme', NOW + LINKED_OUTLET_TTL_MS + 1)

    // Assert
    expect(slug).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('returns null for a corrupt record rather than throwing', () => {
    // Arrange
    const storage = memoryStorage()
    storage.map.set(`${LINKED_OUTLET_KEY_PREFIX}acme`, 'not json')

    // Act + Assert
    expect(readLinkedOutletSlug(storage, 'acme', NOW)).toBeNull()
  })

  it('survives storage that throws, as Safari private mode does', () => {
    // Arrange
    const storage = throwingStorage()

    // Act + Assert
    expect(() => writeLinkedOutletSlug(storage, 'acme', 'cainta', NOW)).not.toThrow()
    expect(readLinkedOutletSlug(storage, 'acme', NOW)).toBeNull()
    expect(() => clearLinkedOutletSlug(storage, 'acme')).not.toThrow()
  })

  it('clears the remembered link', () => {
    // Arrange
    const storage = memoryStorage()
    writeLinkedOutletSlug(storage, 'acme', 'cainta', NOW)

    // Act
    clearLinkedOutletSlug(storage, 'acme')

    // Assert
    expect(readLinkedOutletSlug(storage, 'acme', NOW)).toBeNull()
  })
})
