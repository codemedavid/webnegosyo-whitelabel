import { createRefBook, isUuidLike } from '@/lib/assistant/refs'

describe('ref book', () => {
  test('gives each id one stable short ref per kind', () => {
    // Arrange
    const book = createRefBook({})

    // Act
    const first = book.refFor('item', '6f1c2b0e-0000-4000-8000-000000000001')
    const second = book.refFor('item', '6f1c2b0e-0000-4000-8000-000000000002')
    const again = book.refFor('item', '6f1c2b0e-0000-4000-8000-000000000001')

    // Assert
    expect(first).toBe('i1')
    expect(second).toBe('i2')
    expect(again).toBe('i1')
  })

  test('resolves a ref only for the kind it was issued for', () => {
    const book = createRefBook({})
    const ref = book.refFor('customer', 'cust-uuid')

    expect(book.resolve(ref, 'customer')).toBe('cust-uuid')
    expect(book.resolve(ref, 'item')).toBeNull()
    expect(book.resolve('i99', 'item')).toBeNull()
  })

  test('keeps refs stable across turns through its snapshot', () => {
    const book = createRefBook({})
    book.refFor('item', 'a')
    const restored = createRefBook(book.snapshot())

    expect(restored.refFor('item', 'b')).toBe('i2')
    expect(restored.resolve('i1', 'item')).toBe('a')
  })

  test('ignores a malformed stored snapshot instead of trusting it', () => {
    const book = createRefBook({ refs: { i1: { kind: 'nope', id: 5 } }, next: 'x' } as never)

    expect(book.resolve('i1', 'item')).toBeNull()
    expect(book.refFor('item', 'a')).toBe('i1')
  })

  test('snapshot is a copy: changing it cannot rewrite the book', () => {
    const book = createRefBook({})
    book.refFor('item', 'a')
    const snap = book.snapshot() as { refs: Record<string, { id: string }> }
    snap.refs.i1.id = 'evil'

    expect(book.resolve('i1', 'item')).toBe('a')
  })

  test('detects uuid-looking strings so they never reach the model', () => {
    expect(isUuidLike('6f1c2b0e-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuidLike('i12')).toBe(false)
  })
})
