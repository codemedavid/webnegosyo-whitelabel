/**
 * The new Owl panel pieces, rendered: the owner's "Who can use Owl" switches
 * save one key through the staff writer; lesson cards play only real lesson
 * videos and link only inside the admin; a confirm card shows the hosted QR.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockList = jest.fn()
const mockUpdate = jest.fn()
jest.mock('@/app/actions/staff', () => ({
  listStaffAction: (...a: unknown[]) => mockList(...a),
  updateStaffPermissionsAction: (...a: unknown[]) => mockUpdate(...a),
}))
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

import { OwlAccessView } from '@/components/admin/assistant/owl-access-view'
import { LessonsCardView } from '@/components/admin/assistant/lessons-card'
import { STAFF_PERMISSION_KEYS, isGrantedByFullAccess } from '@/lib/staff-permissions'

beforeEach(() => jest.clearAllMocks())

test('switching Owl on for a legacy full-access account saves its real grants plus Owl, nothing more', async () => {
  mockList.mockResolvedValue({
    success: true,
    data: [
      { user_id: 'owner', is_owner: true, role: 'admin', permissions: null, display_name: 'Owner', email: null, outlet_id: null },
      { user_id: 'ana', is_owner: false, role: 'admin', permissions: null, display_name: 'Ana', email: null, outlet_id: null },
    ],
  })
  mockUpdate.mockResolvedValue({ success: true })
  render(<OwlAccessView tenantId="t" tenantSlug="s" onBack={() => {}} />)

  const toggle = await screen.findByRole('switch', { name: 'Ana can use Owl' })
  expect(screen.queryByText('Owner')).toBeNull()
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t', 's', 'ana', [...STAFF_PERMISSION_KEYS.filter(isGrantedByFullAccess), 'assistant']))
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Ana can use Owl' })).toHaveAttribute('aria-checked', 'true'))
})

test('the switch builds the list from a fresh read, so a Staff edit made meanwhile is not overwritten', async () => {
  const ben = { user_id: 'ben', is_owner: false, role: 'admin', display_name: 'Ben', email: null, outlet_id: null }
  mockList
    .mockResolvedValueOnce({ success: true, data: [{ ...ben, permissions: ['pos', 'menu'] }] })
    // Meanwhile, in Staff, the owner took Menu away.
    .mockResolvedValueOnce({ success: true, data: [{ ...ben, permissions: ['pos'] }] })
  mockUpdate.mockResolvedValue({ success: true })
  render(<OwlAccessView tenantId="t" tenantSlug="s" onBack={() => {}} />)
  fireEvent.click(await screen.findByRole('switch', { name: 'Ben can use Owl' }))
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t', 's', 'ben', ['pos', 'assistant']))
})

test('a refused save leaves the switch where it was and says why', async () => {
  mockList.mockResolvedValue({ success: true, data: [{ user_id: 'ben', is_owner: false, role: 'admin', permissions: ['pos'], display_name: 'Ben', email: null, outlet_id: null }] })
  mockUpdate.mockResolvedValue({ success: false, error: 'Only the store owner can change staff access' })
  render(<OwlAccessView tenantId="t" tenantSlug="s" onBack={() => {}} />)
  fireEvent.click(await screen.findByRole('switch', { name: 'Ben can use Owl' }))
  expect(await screen.findByText('Only the store owner can change staff access')).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: 'Ben can use Owl' })).toHaveAttribute('aria-checked', 'false')
})

test('a lesson card plays the YouTube lesson in place and links inside the admin only', () => {
  const { container } = render(
    <LessonsCardView
      adminBasePath="/demo/admin"
      card={{
        type: 'lessons',
        title: 'Watch how it works',
        lessons: [
          { title: 'Connecting Sa Printer', detail: '3 min', path: '/learn/getting-started/connecting-sa-printer', embedUrl: null, watchUrl: 'https://www.youtube.com/watch?v=bcdefghijkl', thumbnailUrl: null },
          { title: 'Evil', detail: '', path: 'https://evil.example/x', embedUrl: null, watchUrl: null, thumbnailUrl: null },
        ],
      }}
    />,
  )
  expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/bcdefghijkl?rel=0')
  expect(screen.getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/demo/admin/learn/getting-started/connecting-sa-printer')
  expect(screen.queryByText('Evil')).toBeNull()
})

test('a lesson whose video is not a known host gets no player', () => {
  const { container } = render(
    <LessonsCardView
      adminBasePath="/demo/admin"
      card={{ type: 'lessons', title: 'x', lessons: [{ title: 'Odd', detail: '', path: '/learn/a/b', embedUrl: 'https://evil.example/embed', watchUrl: 'https://evil.example/v', thumbnailUrl: null }] }}
    />,
  )
  expect(container.querySelector('iframe')).toBeNull()
})
