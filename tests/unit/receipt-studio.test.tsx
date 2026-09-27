/**
 * Receipt Studio, as a merchant uses it: click a line on the paper, make it
 * bigger or bold, and publish. The guarantees are about the WIRE — the
 * preview draws the style the printer will print, and Publish sends the
 * styled layout (or the untouched template's name) to the save action.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ReceiptEditor } from '@/components/admin/receipt-editor/receipt-editor'

const saveReceiptLayoutAction = jest.fn()
jest.mock('@/app/actions/receipt', () => ({
  saveReceiptLayoutAction: (...args: unknown[]) => saveReceiptLayoutAction(...args),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn() }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

beforeEach(() => {
  saveReceiptLayoutAction.mockReset()
  saveReceiptLayoutAction.mockResolvedValue({ success: true })
})

function renderStudio(initialLayout: unknown = null) {
  return render(
    <ReceiptEditor
      tenantId="t-1"
      tenantSlug="kape"
      storeName="Kape Co"
      logoUrl={null}
      initialLayout={initialLayout}
    />,
  )
}

/** The block's box on the paper preview. */
function paperBlock(label: string): HTMLElement {
  return screen.getAllByRole('button', { name: `Edit ${label}` })[0]!
}

function publishButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Publish' })
}

describe('Receipt Studio', () => {
  it('draws the Modern business name double size and bold on the paper', () => {
    renderStudio()
    const name = within(paperBlock('Business name')).getByText('KAPE CO')
    expect(name).toHaveStyle({ fontWeight: '700', fontSize: '2em' })
    expect(publishButton()).toBeDisabled()
  })

  it('opens a block from the paper and restyles it', () => {
    renderStudio()
    fireEvent.click(paperBlock('Customer name'))

    fireEvent.click(screen.getByRole('radio', { name: /Large/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))

    const line = within(paperBlock('Customer name')).getByText('Maria', { exact: false })
    expect(line).toHaveStyle({ fontWeight: '700', fontSize: '2em' })
    expect(publishButton()).toBeEnabled()
    expect(screen.getByText(/started from Modern/)).toBeInTheDocument()
  })

  it('publishes the styled layout and the whole-receipt bold switch', async () => {
    renderStudio()
    fireEvent.click(paperBlock('Business name'))
    fireEvent.click(screen.getByRole('radio', { name: /Tall/ }))
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(publishButton())

    await waitFor(() => expect(saveReceiptLayoutAction).toHaveBeenCalledTimes(1))
    const [tenantId, payload] = saveReceiptLayoutAction.mock.calls[0]!
    expect(tenantId).toBe('t-1')
    expect(payload).toMatchObject({ version: 1, theme: 'modern', bold: true })
    expect(payload.blocks).toContainEqual({ kind: 'businessName', style: { size: 'tall' } })
    await waitFor(() => expect(publishButton()).toBeDisabled())
  })

  it('publishes an untouched template by name', async () => {
    renderStudio()
    fireEvent.click(screen.getByRole('button', { name: /Classic.*ruled slip/ }))
    fireEvent.click(publishButton())
    await waitFor(() => expect(saveReceiptLayoutAction).toHaveBeenCalledWith('t-1', 'classic'))
  })

  it('discards back to what was published', () => {
    renderStudio('classic')
    fireEvent.click(screen.getByRole('switch'))
    expect(publishButton()).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(publishButton()).toBeDisabled()
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it('adds a block below the selected one, ready to edit', () => {
    renderStudio()
    fireEvent.click(paperBlock('Business name'))
    fireEvent.click(screen.getByRole('button', { name: /Add a block below Business name/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Custom text Subtitle/ }))

    const boxes = screen.getAllByRole('button', { name: /^Edit / }).map((el) => el.getAttribute('aria-label'))
    const nameAt = boxes.indexOf('Edit Business name')
    expect(boxes[nameAt + 1]).toBe('Edit Custom text')
    expect(screen.getAllByRole('textbox', { name: 'Custom text' })[0]).toHaveValue('Your note here')
  })
})
