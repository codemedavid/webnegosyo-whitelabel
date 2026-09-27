import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoyaltyActivityPanel } from './loyalty-activity-panel'
import { callLoyaltyApi } from '@/lib/loyalty/browser-client'
jest.mock('@/lib/loyalty/browser-client', () => ({ callLoyaltyApi: jest.fn() }))
const api = jest.mocked(callLoyaltyApi)
const event = { id: 'one', kind: 'reward_consumed', occurredAt: '2026-09-26T10:30:12Z', customerKey: 'phone:+639171234567', programId: 'p', programName: 'Coffee card', delta: null, rewardId: 'r', rewardLabel: 'Free coffee', previousStatus: 'issued', status: 'consumed', orderBackend: 'convex', orderId: 'sale-42', outletId: null, actorId: null, note: 'Honoured at counter' }
beforeEach(() => api.mockReset())
it('shows claim details and appends the next page without losing the first', async () => {
 api.mockResolvedValueOnce({ events: [event], nextCursor: 'page-2' }).mockResolvedValueOnce({ events: [{ ...event, id: 'two', kind: 'earn', rewardLabel: null, delta: 1 }], nextCursor: null })
 render(<LoyaltyActivityPanel tenantId="store" />)
 expect(await screen.findByRole('heading', { name: 'Reward used' })).toBeInTheDocument()
 expect(screen.getByText('Not recorded')).toBeInTheDocument()
 expect(screen.getByText(/sale-42/)).toBeInTheDocument()
 expect(screen.getByText(/issued → consumed/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
 expect(await screen.findByRole('heading', { name: /Stamps or points earned/ })).toBeInTheDocument()
 expect(screen.getByRole('heading', { name: 'Reward used' })).toBeInTheDocument()
 expect(api).toHaveBeenLastCalledWith('/api/loyalty/activity', expect.objectContaining({query: expect.objectContaining({cursor:'page-2'})}))
})
it('normalizes phone searches and discards responses for the previous tenant', async () => {
 let resolveOld!: (value: unknown) => void
 api.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
 api.mockResolvedValue({ events: [], nextCursor: null })
 const view = render(<LoyaltyActivityPanel tenantId="old" />)
 view.rerender(<LoyaltyActivityPanel tenantId="new" />)
 await screen.findByText('No activity yet')
 await act(async () => resolveOld({ events: [event], nextCursor: null }))
 expect(screen.queryByRole('heading', { name: 'Reward used' })).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Customer phone'), { target: { value: '0917 123 4567' } })
 fireEvent.click(screen.getByRole('button', { name: 'Search' }))
 await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/loyalty/activity', expect.objectContaining({tenantId:'new',query:expect.objectContaining({customerKey:'phone:+639171234567'})})))
})
it('keeps failures distinct from an empty history and refreshes on reconnect', async () => {
 api.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue({events:[],nextCursor:null})
 render(<LoyaltyActivityPanel tenantId="store" customerKey="phone:+639171234567" />)
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted')
 expect(screen.queryByText('No matching activity')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', {name:'Retry'}))
 expect(await screen.findByText('No matching activity')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Activity type'), {target:{value:'reward_consumed'}})
 await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/loyalty/activity',expect.objectContaining({query:expect.objectContaining({kind:'reward_consumed', customerKey:'phone:+639171234567'})})))
 const before = api.mock.calls.length
 await act(async () => { window.dispatchEvent(new Event('online')) })
 expect(api.mock.calls.length).toBe(before+1)
})
