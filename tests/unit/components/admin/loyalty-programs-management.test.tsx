import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoyaltyProgramsManagement } from '@/components/admin/loyalty-programs-management'
jest.mock('@/components/admin/loyalty-sync-status', () => ({ LoyaltySyncStatus: () => null }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { access_token: 'session' } } }) },
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, order: async () => ({ data: table === 'menu_items' ? [{ id: 'coffee', name: 'Coffee' }, { id: 'presell', name: 'Presell', presell_enabled: true }] : [], error: null }) }
    return query
  },
}) }))
it('revises a missing reward into a selected item using the displayed rules version', async () => {
  const programs = [{ id: 'program', name: 'Visits', earnMode: 'stamp', scope: 'business', status: 'draft', rules: null, versionNumber: null, members: 0, rewardsOutstanding: 0 }]
  const fetcher = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => ({ ok: true, json: async () => init.method === 'GET' ? { programs, loyalty: { isShadow: false } } : { success: true } }))
  global.fetch = fetcher
  render(<LoyaltyProgramsManagement tenantId="tenant" tenantSlug="shop" />)
  fireEvent.click(await screen.findByText('Edit reward & rules'))
  fireEvent.change(screen.getByLabelText('Reward type'), { target: { value: 'free_item' } })
  await screen.findByRole('option', { name: 'Coffee' })
  expect(screen.queryByRole('option', { name: 'Presell' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Free menu item'), { target: { value: 'coffee' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save new rules' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/loyalty/programs', expect.objectContaining({ method: 'POST', body: expect.any(String) })))
  const write = fetcher.mock.calls.find(([, init]) => init.method === 'POST')
  expect(JSON.parse(write![1].body)).toMatchObject({ tenantId: 'tenant', action: 'revise', programId: 'program', expectedVersion: null, rules: { reward: { type: 'free_item', menuItemId: 'coffee', itemName: 'Coffee' } } })
})
