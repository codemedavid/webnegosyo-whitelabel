/** @jest-environment node */

import { getReceiptContext, saveReceiptLayoutAction } from '@/app/actions/receipt'
import { hasPermission } from '@/lib/staff-permissions'

let mockPermissions: string[] = []
const mockUpdate = jest.fn()
const mockAdmin = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn().mockResolvedValue({ userRole: { role: 'admin' } }),
  verifyTenantPermission: async (_tenant: string, permission: 'store_setup') => {
    if (!hasPermission({ role: 'admin', permissions: mockPermissions }, permission)) {
      throw new Error('Unauthorized: Missing permission for this feature')
    }
  },
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockAdmin() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockPermissions = ['orders']
  mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
  mockAdmin.mockReturnValue({ from: () => ({
    update: mockUpdate,
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Store', receipt_layout: 'classic' } }) }) }),
  }) })
})

it('refuses a direct receipt layout save by staff without store_setup before service-role access', async () => {
  expect(await saveReceiptLayoutAction('tenant-a', 'classic')).toEqual({ success: false, error: 'Not authorized' })
  expect(mockAdmin).not.toHaveBeenCalled()
})

it('allows staff with store_setup to publish a valid layout', async () => {
  mockPermissions = ['store_setup']
  expect(await saveReceiptLayoutAction('tenant-a', 'classic')).toEqual({ success: true })
  expect(mockUpdate).toHaveBeenCalledWith({ receipt_layout: 'classic' })
})

it('keeps receipt printing available to order staff', async () => {
  expect(await getReceiptContext('tenant-a')).toEqual({ storeName: 'Store', receiptLayout: 'classic' })
})
