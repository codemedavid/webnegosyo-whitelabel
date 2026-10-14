/**
 * Smoke-renders the Texts page client against fixture data: every tab and
 * sheet mounts, reads the URL, and calls the server actions by their agreed
 * names with the agreed shapes.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CampaignListItem, SenderSummary, TextsPageData } from '@/lib/texts/types'

let search = new URLSearchParams()

const actions = {
  saveCampaignAction: jest.fn(async () => ({ ok: true, value: { id: 'c-new' } })),
  previewCampaignAudienceAction: jest.fn(async () => ({
    ok: true,
    value: { reach: 148, skipped: { no_consent: 31 }, samples: [{ label: 'Ana R.', body: 'Hi Ana' }], segmentsPerGuest: 1, textsUsed: 148, finishAt: null, waitingAhead: 0, daysToFinish: 1, dailyLimit: 100 },
  })),
  scheduleCampaignAction: jest.fn(async () => ({ ok: true, value: { displayState: 'scheduled' } })),
  sendCampaignNowAction: jest.fn(async () => ({ ok: true, value: { queued: 148, finishAt: null } })),
  pauseCampaignAction: jest.fn(async () => ({ ok: true, value: null })),
  resumeCampaignAction: jest.fn(async () => ({ ok: true, value: null })),
  archiveCampaignAction: jest.fn(async () => ({ ok: true, value: null })),
  unarchiveCampaignAction: jest.fn(async () => ({ ok: true, value: null })),
  deleteCampaignDraftAction: jest.fn(async () => ({ ok: true, value: null })),
  switchToAutomaticAction: jest.fn(async () => ({ ok: true, value: null })),
  duplicateCampaignAction: jest.fn(async () => ({ ok: true, value: { id: 'c-copy' } })),
  getCampaignReportAction: jest.fn(),
  writeCampaignMessagesAction: jest.fn(async () => ({ ok: true, value: { messages: ['Hi'] } })),
  renamePhoneAction: jest.fn(async () => ({ ok: true, value: null })),
  disconnectPhoneAction: jest.fn(async () => ({ ok: true, value: null })),
  automationsAction: jest.fn(async () => ({ ok: true, value: { items: [], nextCursor: null } })),
}

jest.mock('@/app/actions/texts', () => actions)
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/kape/admin/texts',
  useSearchParams: () => search,
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))

const NOW = '2026-10-14T06:10:00.000Z'

function sender(): SenderSummary {
  const phone = {
    deviceId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: "Juan's Galaxy A15", hasCustomName: true, model: null, appVersion: '1.0.14',
    isAppOld: false, state: 'ready' as const, lastSeenAt: '2026-10-14T06:09:00.000Z', ageSeconds: 60, isInactive: false,
    connectedAt: '2026-10-03T02:00:00.000Z', connectedBy: 'Ana', sentToday: 37, failedToday: 0, sendingNow: 2,
    smsPermission: null, isBatteryUnrestricted: null,
  }
  return {
    heroState: 'ready', primary: phone, phones: [phone], maxPhones: 5, waiting: 0, sentToday: 37, dailyLimit: 100,
    isQuietNow: false, quietUntil: null, allOutBy: null, sending: null, now: NOW,
  }
}

const SENT: CampaignListItem = {
  id: '11111111-2222-4333-8444-555555555555', name: 'Thank you, suki', messageTemplate: 'Hi {{firstName}}', messagePreview: 'Hi {{firstName}}',
  audience: { minOrderCount: 3 }, audiencePreset: 'regulars', audienceLabel: 'Regulars',
  schedule: { kind: 'one_off', time: '10:00', date: '2026-10-02', intervalDays: null, weekdays: [], endsOn: null },
  status: 'scheduled', delivery: 'server', displayState: 'sent', pauseReason: null, whenLabel: 'Sent Oct 2, 10:00 AM', nextSendAt: null,
  progress: null, results: { sent: 148, notSent: 2, cameBack: 18, sales: 6420, isFinal: true, finalOn: null, isApproximate: false },
  isEditable: false, updatedAt: NOW, createdAt: NOW,
}

function data(overrides: Partial<TextsPageData> = {}): TextsPageData {
  return {
    tenantId: '9f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', tenantSlug: 'kape', storeName: 'Kape', isOwner: true, isDemo: false,
    live: { sender: sender(), attention: [], progress: {} },
    thirtyDays: { sent: 412, cameBack: 37, sales: 9860 },
    campaigns: [SENT],
    automations: {
      automations: [],
      recipes: [{
        id: 'win_back', moment: 'bring_back', title: 'Win back', pitch: 'p', defaults: { inactiveDays: 30 }, limits: { inactiveDays: [7, 180] },
        defaultReentryDays: 60, needsLoyalty: false, needsReviewLink: false, defaultMessage: 'Hi {{firstName}}', defaultMessageTl: 'Hi',
        variables: ['firstName'], description: 'd',
      }],
      settings: { quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null },
      sender: { enrolled: 1, online: true, lastSeenAt: NOW },
      outlook: { waiting: 0, sentToday: 37, dailyLimit: 100, finishAt: null },
      loyaltyOn: true,
    } as unknown as TextsPageData['automations'],
    optOutLine: null,
    ...overrides,
  }
}

async function renderPage(query: string, page: TextsPageData = data()) {
  search = new URLSearchParams(query)
  const { TextsWorkspace } = await import('@/components/admin/texts/texts-workspace')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => page.live })) as unknown as typeof fetch
  return render(<QueryClientProvider client={client}><TextsWorkspace data={page} downloadUrl="https://webnegosyo.com/download" /></QueryClientProvider>)
}

describe('Texts workspace', () => {
  beforeEach(() => jest.clearAllMocks())

  test('header, hero and the campaign list', async () => {
    await renderPage('')
    expect(screen.getByRole('heading', { name: 'Texts' })).toBeInTheDocument()
    expect(screen.getByText('Last 30 days: 412 sent · 37 came back · ₱9,860 in orders')).toBeInTheDocument()
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Thank you, suki').length).toBeGreaterThan(0)
    expect(screen.getAllByText('18 · ₱6,420').length).toBeGreaterThan(0)
  })

  test('empty store shows the preset grid', async () => {
    await renderPage('', data({ campaigns: [] }))
    expect(screen.getByText('Send your first campaign')).toBeInTheDocument()
    expect(screen.getByText('We miss you')).toBeInTheDocument()
  })

  test('composer from a preset counts the audience and reviews', async () => {
    const user = userEvent.setup()
    await renderPage('campaign=new&preset=thank_regulars')
    expect(await screen.findByDisplayValue('Thank your regulars')).toBeInTheDocument()
    await waitFor(() => expect(actions.previewCampaignAudienceAction).toHaveBeenCalledWith(
      '9f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', { audience: { minOrderCount: 3 }, messageTemplate: expect.stringContaining('{{orderCount}}') },
    ), { timeout: 2000 })
    expect(await screen.findByText('148 guests will get this, 31 skipped')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Review/ }))
    expect(await screen.findByText(/Text 148 regulars/)).toBeInTheDocument()
  })

  test('chooser on a bare new campaign', async () => {
    await renderPage('campaign=new')
    expect(await screen.findByText('Blank text')).toBeInTheDocument()
  })

  test('report sheet loads the report', async () => {
    actions.getCampaignReportAction.mockResolvedValue({
      ok: true, value: { campaign: SENT, totals: SENT.results, runs: [], guests: [{ label: 'Maria S. · ending 4567', status: 'sent', reason: null, sentAt: NOW, orderedAt: null, orderTotal: null }], nextCursor: null },
    })
    await renderPage(`campaign=${SENT.id}`)
    expect(await screen.findByText('Maria S. · ending 4567')).toBeInTheDocument()
    expect(actions.getCampaignReportAction).toHaveBeenCalledWith('9f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', SENT.id, null)
  })

  test('automatic, activity and rules tabs mount', async () => {
    const { unmount } = await renderPage('tab=automatic')
    expect(screen.getByText('We miss you')).toBeInTheDocument()
    unmount()
    const activity = await renderPage('tab=activity&show=waiting')
    await waitFor(() => expect(actions.automationsAction).toHaveBeenCalledWith(
      '9f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', expect.objectContaining({ action: 'activity', statuses: ['queued', 'claimed'] }),
    ))
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument()
    activity.unmount()
    await renderPage('tab=rules')
    expect(screen.getByText(/25 every 30 minutes/)).toBeInTheDocument()
    expect(screen.queryByText(/opt-out/i)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/STOP/)
  })

  test('phones sheet lists the phone', async () => {
    await renderPage('phones=1')
    expect(await screen.findByText('Sending phones')).toBeInTheDocument()
    expect(screen.getByText('Connected Oct 3 by Ana · App 1.0.14')).toBeInTheDocument()
  })

  test('install links go to the platform download page, never the Play Store', async () => {
    const empty = data()
    await renderPage('phones=1', { ...empty, live: { ...empty.live, sender: { ...empty.live.sender, heroState: 'none', primary: null, phones: [] } } })
    const link = await screen.findByRole('link', { name: 'Download the Android app' })
    expect(link).toHaveAttribute('href', 'https://webnegosyo.com/download')
    expect(document.body.innerHTML).not.toMatch(/play\.google/)
  })

  test('Review stays tappable and points at what to fix', async () => {
    const user = userEvent.setup()
    await renderPage('campaign=new&preset=blank')
    await user.click(await screen.findByRole('button', { name: /Review/ }))
    expect(await screen.findByText('Write a message first.')).toBeInTheDocument()
  })

  test('view=report opens the report for a campaign that would open in the editor', async () => {
    const scheduled = { ...SENT, displayState: 'scheduled' as const, isEditable: true, results: null }
    actions.getCampaignReportAction.mockResolvedValue({ ok: true, value: { campaign: scheduled, totals: null, runs: [], guests: [], nextCursor: null } })
    await renderPage(`campaign=${SENT.id}&view=report`, data({ campaigns: [scheduled] }))
    expect(await screen.findByText(/Shown with a sample guest/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Campaign name/)).not.toBeInTheDocument()
  })

  test('a deleted campaign says so instead of retrying forever', async () => {
    actions.getCampaignReportAction.mockResolvedValue({ ok: false, error: 'That campaign no longer exists.', code: 'not_found' })
    await renderPage('campaign=99999999-2222-4333-8444-555555555555', data({ campaigns: [] }))
    expect(await screen.findByText('This campaign was deleted.')).toBeInTheDocument()
  })
})
