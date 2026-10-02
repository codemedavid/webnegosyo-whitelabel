import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const checkCustomDomainAction = jest.fn()
const connectCustomDomainAction = jest.fn()
const disconnectCustomDomainAction = jest.fn()

jest.mock('@/app/actions/custom-domain', () => ({
  checkCustomDomainAction: (...args: unknown[]) => checkCustomDomainAction(...args),
  connectCustomDomainAction: (...args: unknown[]) => connectCustomDomainAction(...args),
  disconnectCustomDomainAction: (...args: unknown[]) => disconnectCustomDomainAction(...args),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

async function loadPanel() {
  const { CustomDomainPanel } = await import('@/components/admin/custom-domain/custom-domain-panel')
  return CustomDomainPanel
}

const EMPTY_VIEW = { domain: null, status: null, isDnsReady: false, verifiedAt: null, records: [] }
const PENDING_VIEW = {
  domain: 'order.bella.com',
  status: 'pending',
  isDnsReady: false,
  verifiedAt: null,
  records: [
    { type: 'CNAME', host: 'order', value: 'x.vercel-dns-017.com', purpose: 'routing' },
    { type: 'TXT', host: '_webnegosyo.order', value: 'webnegosyo-verification=tok', purpose: 'ownership' },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  checkCustomDomainAction.mockResolvedValue({ ok: true, isRoutingChanged: false, view: EMPTY_VIEW })
})

describe('CustomDomainPanel', () => {
  it('explains the feature is off when the platform is not configured', async () => {
    const CustomDomainPanel = await loadPanel()

    render(<CustomDomainPanel tenantId="t1" initialDomain={null} isAvailable={false} />)

    expect(screen.getByText(/not enabled on this platform/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/your domain/i)).not.toBeInTheDocument()
  })

  it('connects a domain and shows the DNS record to add', async () => {
    connectCustomDomainAction.mockResolvedValue({ ok: true, isRoutingChanged: false, view: PENDING_VIEW })
    const CustomDomainPanel = await loadPanel()
    render(<CustomDomainPanel tenantId="t1" initialDomain={null} isAvailable />)

    await userEvent.type(await screen.findByLabelText(/your domain/i), 'order.bella.com')
    await userEvent.click(screen.getByRole('button', { name: /connect domain/i }))

    expect(connectCustomDomainAction).toHaveBeenCalledWith('t1', 'order.bella.com')
    expect(await screen.findByText('Verifying ownership')).toBeInTheDocument()
    expect(screen.getByText('x.vercel-dns-017.com')).toBeInTheDocument()
    expect(screen.getByText('webnegosyo-verification=tok')).toBeInTheDocument()
  })

  it('shows the refusal message from the server', async () => {
    connectCustomDomainAction.mockResolvedValue({ ok: false, error: 'This domain is already connected to another store.' })
    const CustomDomainPanel = await loadPanel()
    render(<CustomDomainPanel tenantId="t1" initialDomain={null} isAvailable />)

    await userEvent.type(await screen.findByLabelText(/your domain/i), 'bella.com')
    await userEvent.click(screen.getByRole('button', { name: /connect domain/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/another store/i)
  })

  it('shows a pending claim on open even though the page knows no routed domain', async () => {
    checkCustomDomainAction.mockResolvedValue({ ok: true, isRoutingChanged: false, view: PENDING_VIEW })
    const CustomDomainPanel = await loadPanel()

    render(<CustomDomainPanel tenantId="t1" initialDomain={null} isAvailable />)

    expect(await screen.findByText('Verifying ownership')).toBeInTheDocument()
    expect(screen.queryByLabelText(/your domain/i)).not.toBeInTheDocument()
  })

  it('offers a retry when the first check fails', async () => {
    checkCustomDomainAction.mockResolvedValueOnce({ ok: false, error: 'Could not reach the domain service.' })
    const CustomDomainPanel = await loadPanel()
    render(<CustomDomainPanel tenantId="t1" initialDomain={null} isAvailable />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByLabelText(/your domain/i)).toBeInTheDocument()
  })

  it('checks an existing domain on open and shows it live', async () => {
    checkCustomDomainAction.mockResolvedValue({
      ok: true,
      isRoutingChanged: false,
      view: { domain: 'bella.com', status: 'active', isDnsReady: true, verifiedAt: '2026-09-29T00:00:00Z', records: [] },
    })
    const CustomDomainPanel = await loadPanel()

    render(<CustomDomainPanel tenantId="t1" initialDomain="bella.com" isAvailable />)

    expect(await screen.findByText('Live')).toBeInTheDocument()
    expect(checkCustomDomainAction).toHaveBeenCalledWith('t1')
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', 'https://bella.com')
  })

  it('removes a domain only after confirmation', async () => {
    checkCustomDomainAction.mockResolvedValue({ ok: true, isRoutingChanged: false, view: PENDING_VIEW })
    disconnectCustomDomainAction.mockResolvedValue({ ok: true, isRoutingChanged: false, view: EMPTY_VIEW })
    const CustomDomainPanel = await loadPanel()
    render(<CustomDomainPanel tenantId="t1" initialDomain="order.bella.com" isAvailable />)
    await screen.findByText('Verifying ownership')

    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }))
    expect(disconnectCustomDomainAction).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /yes, remove/i }))

    expect(disconnectCustomDomainAction).toHaveBeenCalledWith('t1')
    await waitFor(() => expect(screen.getByLabelText(/your domain/i)).toBeInTheDocument())
  })
})
