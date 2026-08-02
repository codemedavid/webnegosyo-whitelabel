import {
  transferOwnership,
  type OwnershipStore,
} from '@/lib/tenant-ownership-service'
import type { OwnershipUser } from '@/lib/tenant-ownership'

interface Write {
  userId: string
  patch: Record<string, unknown>
}

function makeFakeStore(
  users: OwnershipUser[],
  failOn?: { userId: string; message: string }
): { store: OwnershipStore; writes: Write[] } {
  const writes: Write[] = []

  const store: OwnershipStore = {
    listTenantUsers: async () => users.map((user) => ({ ...user })),
    updateUserRow: async (userId, patch) => {
      if (failOn && failOn.userId === userId && !writes.some((w) => w.userId === userId)) {
        throw new Error(failOn.message)
      }
      writes.push({ userId, patch })
    },
  }

  return { store, writes }
}

const sittingOwner: OwnershipUser = {
  user_id: 'owner_1',
  role: 'admin',
  is_owner: true,
  outlet_id: null,
}

const branchAdmin: OwnershipUser = {
  user_id: 'admin_1',
  role: 'admin',
  is_owner: false,
  outlet_id: 'outlet_north',
}

describe('transferOwnership', () => {
  it('stands the sitting owner down before raising the new one', async () => {
    // Arrange — a unique-owner index must never see two owners at once
    const { store, writes } = makeFakeStore([sittingOwner, branchAdmin])

    // Act
    await transferOwnership(store, 'tenant-1', 'admin_1')

    // Assert
    expect(writes.map((w) => w.userId)).toEqual(['owner_1', 'admin_1'])
    expect(writes[0].patch).toEqual({ is_owner: false })
    expect(writes[1].patch).toMatchObject({ is_owner: true, permissions: null })
  })

  it('frees the new owner from the branch they were confined to', async () => {
    const { store, writes } = makeFakeStore([sittingOwner, branchAdmin])

    await transferOwnership(store, 'tenant-1', 'admin_1')

    expect(writes[1].patch.outlet_id).toBeNull()
  })

  it('writes once when the store had no owner to stand down', async () => {
    const { store, writes } = makeFakeStore([{ ...branchAdmin, outlet_id: null }])

    await transferOwnership(store, 'tenant-1', 'admin_1')

    expect(writes).toHaveLength(1)
    expect(writes[0].userId).toBe('admin_1')
  })

  it('rejects an account that does not belong to the store, writing nothing', async () => {
    const { store, writes } = makeFakeStore([sittingOwner, branchAdmin])

    await expect(transferOwnership(store, 'tenant-1', 'stranger')).rejects.toThrow(/not found/i)
    expect(writes).toHaveLength(0)
  })

  it('restores the sitting owner when the promotion fails', async () => {
    // Arrange — otherwise a failed handover leaves the store with nobody in charge
    const { store, writes } = makeFakeStore([sittingOwner, branchAdmin], {
      userId: 'admin_1',
      message: 'Staff limit reached',
    })

    // Act
    await expect(transferOwnership(store, 'tenant-1', 'admin_1')).rejects.toThrow(
      /Staff limit reached/
    )

    // Assert — demoted, then put back
    expect(writes.map((w) => w.userId)).toEqual(['owner_1', 'owner_1'])
    expect(writes[1].patch).toMatchObject({ is_owner: true })
  })

  it('reports both failures when the rollback itself cannot be written', async () => {
    const { store } = makeFakeStore([sittingOwner, branchAdmin], {
      userId: 'owner_1',
      message: 'connection lost',
    })

    // The first write to owner_1 is the demote; make that succeed and the
    // promote fail so the rollback is the one that breaks.
    const brokenStore: OwnershipStore = {
      listTenantUsers: store.listTenantUsers,
      updateUserRow: async (userId, patch) => {
        if (userId === 'admin_1') throw new Error('promote failed')
        if (patch.is_owner === true) throw new Error('rollback failed')
      },
    }

    await expect(transferOwnership(brokenStore, 'tenant-1', 'admin_1')).rejects.toThrow(
      /promote failed.*rollback failed/is
    )
  })
})
