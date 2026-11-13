import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AppBuildView, AppBuildsOverview } from '@/lib/app-builds/service'

const getAppBuildsAction = jest.fn()
const startAppBuildsAction = jest.fn()
jest.mock('@/app/actions/app-builds', () => ({
  getAppBuildsAction: (...args: unknown[]) => getAppBuildsAction(...args),
  startAppBuildsAction: (...args: unknown[]) => startAppBuildsAction(...args),
}))

import { BuildsTab } from '@/components/superadmin/app-studio/builds-tab'

const TENANT = '00000000-0000-4000-8000-000000000001'

const build = (patch: Partial<AppBuildView>): AppBuildView => ({
  id: 'b1',
  platform: 'ios',
  status: 'finished',
  submitStatus: 'none',
  easBuildId: null,
  appVersion: null,
  buildNumber: null,
  artifactUrl: null,
  error: null,
  sendsToTesters: true,
  createdBy: null,
  createdAt: '2026-11-13T10:00:00Z',
  updatedAt: '2026-11-13T10:00:00Z',
  finishedAt: null,
  ...patch,
})

const overview = (patch: Partial<AppBuildsOverview> = {}): AppBuildsOverview => ({
  builds: [],
  missingEnv: [],
  problems: [],
  dryRun: false,
  submitNotes: { ios: null, android: null },
  ...patch,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useRealTimers()
})

describe('App Studio → Builds', () => {
  it('explains a deployment that is not set up and keeps Build off', async () => {
    getAppBuildsAction.mockResolvedValue({ ok: true, data: overview({ missingEnv: ['GITHUB_DISPATCH_TOKEN', 'EAS_WEBHOOK_SECRET'] }) })
    render(<BuildsTab tenantId={TENANT} canEdit />)
    expect(await screen.findByText(/build pipeline isn’t set up/)).toBeInTheDocument()
    expect(screen.getByText(/GITHUB_DISPATCH_TOKEN, EAS_WEBHOOK_SECRET/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Build iOS \+ Android/ })).toBeDisabled()
  })

  it('names what the identity is missing', async () => {
    getAppBuildsAction.mockResolvedValue({ ok: true, data: overview({ problems: ['Add an app icon (Identity tab).'] }) })
    render(<BuildsTab tenantId={TENANT} canEdit />)
    expect(await screen.findByText('Add an app icon (Identity tab).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Build iOS \+ Android/ })).toBeDisabled()
  })

  it('starts a build and shows it; a running platform cannot be started twice', async () => {
    getAppBuildsAction.mockResolvedValueOnce({ ok: true, data: overview({ submitNotes: { ios: 'Not sent to TestFlight: add the App Store Connect app id under Release first.', android: null } }) })
    render(<BuildsTab tenantId={TENANT} canEdit />)
    expect(await screen.findByText(/iOS: Not sent to TestFlight/)).toBeInTheDocument()

    startAppBuildsAction.mockResolvedValue({ ok: true, data: [] })
    getAppBuildsAction.mockResolvedValue({ ok: true, data: overview({ builds: [build({ id: 'a1', platform: 'android', status: 'building' })] }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Android only' }))
    })
    expect(startAppBuildsAction).toHaveBeenCalledWith(TENANT, ['android'])
    expect(await screen.findByText('Building on EAS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Android only' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Build iOS \+ Android/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'iOS only' })).toBeEnabled()
  })

  it('shows outcomes: version, tester status, failure reason, download link', async () => {
    getAppBuildsAction.mockResolvedValue({
      ok: true,
      data: overview({
        builds: [
          build({ id: 'f1', status: 'finished', submitStatus: 'submitted', appVersion: '1.0.0', buildNumber: '7', artifactUrl: 'https://expo.dev/a.ipa' }),
          build({ id: 'e1', platform: 'android', status: 'errored', error: 'The build didn’t start: the build workflow never reported back.' }),
        ],
      }),
    })
    render(<BuildsTab tenantId={TENANT} canEdit />)
    expect(await screen.findByText('In TestFlight')).toBeInTheDocument()
    expect(screen.getByText('v1.0.0 (7)')).toBeInTheDocument()
    expect(screen.getByText(/never reported back/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Download/ })).toHaveAttribute('href', 'https://expo.dev/a.ipa')
  })

  it('shows the refusal when starting fails, and hides Build from view-only staff', async () => {
    getAppBuildsAction.mockResolvedValue({ ok: true, data: overview() })
    startAppBuildsAction.mockResolvedValue({ ok: false, error: 'An iOS build is already running for this app.' })
    const { unmount } = render(<BuildsTab tenantId={TENANT} canEdit />)
    const iosOnly = await screen.findByRole('button', { name: 'iOS only' })
    await act(async () => {
      fireEvent.click(iosOnly)
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('An iOS build is already running for this app.'))
    unmount()

    render(<BuildsTab tenantId={TENANT} canEdit={false} />)
    expect(await screen.findByText('No builds yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Build/ })).toBeNull()
  })
})
