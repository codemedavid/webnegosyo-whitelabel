/**
 * Menu arrangement writes for the MCP.
 *
 * Ordering is the cheapest lever menu engineering has — a star moved to the top
 * of its category outsells the same star buried at the bottom. But a REORDER IS
 * A WHOLESALE REWRITE of the `order` column, so a caller that passes half the
 * ids does not "reorder those": it leaves the omitted rows sharing stale
 * positions with the new ones, and the menu comes out interleaved and wrong.
 *
 * So these writers reject any list that is not the complete set, and they check
 * the results of their updates instead of firing them and hoping — the existing
 * `reorderCategories` awaits a Promise.all of query builders and never looks at
 * `error`, which is how a failed write becomes a silent success.
 */

import { reorderCategoriesForProvisioning, reorderMenuItemsForProvisioning } from '@/lib/menu-arrangement'

/** A client whose reads answer with `existingIds` and whose updates succeed. */
function fakeClient(existingIds: string[], updateError: { message: string } | null = null) {
  const updates: Array<{ id: string; order: number }> = []

  const selectBuilder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    })
    return b
  }

  const updateBuilder = (order: number) => {
    const b: Record<string, unknown> = {}
    let id = ''
    Object.assign(b, {
      eq: (col: string, val: string) => {
        if (col === 'id') id = val
        return b
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (!updateError) updates.push({ id, order })
        return resolve({ data: null, error: updateError })
      },
    })
    return b
  }

  return {
    updates,
    client: {
      from: () => ({
        select: () => selectBuilder(existingIds.map((id) => ({ id }))),
        update: (patch: { order: number }) => updateBuilder(patch.order),
      }),
    },
  }
}

const ctxOf = (client: unknown) => ({ client: client as never })

describe('reorderCategoriesForProvisioning', () => {
  it('writes each category its index in the given order', async () => {
    // Arrange
    const { client, updates } = fakeClient(['a', 'b', 'c'])

    // Act
    await reorderCategoriesForProvisioning('t1', ['c', 'a', 'b'], ctxOf(client))

    // Assert
    expect(updates).toEqual([
      { id: 'c', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ])
  })

  it('refuses a partial list rather than interleaving the omitted categories', async () => {
    const { client, updates } = fakeClient(['a', 'b', 'c'])

    await expect(reorderCategoriesForProvisioning('t1', ['a', 'b'], ctxOf(client))).rejects.toThrow(
      /every category|complete|missing/i,
    )
    expect(updates).toEqual([])
  })

  it('refuses an id that does not belong to this tenant', async () => {
    const { client, updates } = fakeClient(['a', 'b'])

    await expect(
      reorderCategoriesForProvisioning('t1', ['a', 'b', 'intruder'], ctxOf(client)),
    ).rejects.toThrow(/not.*(belong|found)|unknown/i)
    expect(updates).toEqual([])
  })

  it('refuses a list containing the same id twice', async () => {
    const { client } = fakeClient(['a', 'b'])

    await expect(reorderCategoriesForProvisioning('t1', ['a', 'a'], ctxOf(client))).rejects.toThrow(
      /duplicate/i,
    )
  })

  it('reports a failed write instead of returning quietly', async () => {
    const { client } = fakeClient(['a', 'b'], { message: 'permission denied' })

    await expect(reorderCategoriesForProvisioning('t1', ['b', 'a'], ctxOf(client))).rejects.toThrow(
      /permission denied|failed/i,
    )
  })
})

describe('reorderMenuItemsForProvisioning', () => {
  it('writes each item its index within the category', async () => {
    const { client, updates } = fakeClient(['i1', 'i2'])

    await reorderMenuItemsForProvisioning('t1', 'cat1', ['i2', 'i1'], ctxOf(client))

    expect(updates).toEqual([
      { id: 'i2', order: 0 },
      { id: 'i1', order: 1 },
    ])
  })

  it('refuses a partial list of the category\'s items', async () => {
    const { client, updates } = fakeClient(['i1', 'i2', 'i3'])

    await expect(
      reorderMenuItemsForProvisioning('t1', 'cat1', ['i1', 'i2'], ctxOf(client)),
    ).rejects.toThrow(/every item|complete|missing/i)
    expect(updates).toEqual([])
  })

  it('refuses an empty ordering', async () => {
    const { client } = fakeClient([])

    await expect(reorderMenuItemsForProvisioning('t1', 'cat1', [], ctxOf(client))).rejects.toThrow()
  })
})
