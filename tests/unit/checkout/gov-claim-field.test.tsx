import { describe, it, expect, jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import { GovClaimField } from '@/components/customer/checkout-templates/gov-claim-field'
import type { CheckoutGovClaimState } from '@/hooks/checkout/use-checkout-gov-claim'

const SETUP = {
  vatStatus: 'vat' as const,
  kinds: [
    { kind: 'senior' as const, label: 'Senior Citizen', code: 'SC', idLabel: 'OSCA / Senior Citizen ID no.', idPlaceholder: 'e.g. 12345' },
    { kind: 'pwd' as const, label: 'PWD', code: 'PWD', idLabel: 'PWD ID no.', idPlaceholder: 'e.g. 13-7404-000-0001234' },
  ],
}

function state(overrides: Partial<CheckoutGovClaimState> = {}): CheckoutGovClaimState {
  return {
    govSetup: SETUP,
    govClaim: null,
    govPreview: null,
    isCheckingGov: false,
    applyGovClaim: jest.fn(async () => undefined),
    removeGovClaim: jest.fn(),
    govLines: null,
    ...overrides,
  }
}

const peso = (amount: number) => `₱${amount.toFixed(2)}`

describe('GovClaimField', () => {
  it('shows nothing for a store without Senior/PWD set up', () => {
    const { container } = render(<GovClaimField state={state({ govSetup: null })} formatPrice={peso} accent="#000" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sends who is claiming — kind, name and ID — never an amount', () => {
    const applyGovClaim = jest.fn(async () => undefined)
    render(<GovClaimField state={state({ applyGovClaim })} formatPrice={peso} accent="#000" />)

    fireEvent.click(screen.getByText('Senior Citizen or PWD? Get your discount'))
    fireEvent.click(screen.getByRole('radio', { name: 'PWD' }))
    fireEvent.change(screen.getByLabelText('Name on the ID'), { target: { value: ' Ana Cruz ' } })
    fireEvent.change(screen.getByLabelText('PWD ID no.'), { target: { value: '13-7404-000-0001234' } })
    fireEvent.click(screen.getByText('Apply discount'))

    expect(applyGovClaim).toHaveBeenCalledWith({ kind: 'pwd', name: 'Ana Cruz', idNumber: '13-7404-000-0001234' })
  })

  it('shows the saving and the ID reminder once applied', () => {
    render(
      <GovClaimField
        state={state({
          govClaim: { kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345' },
          govPreview: { status: 'applied', reduction: 160, lines: [] },
        })}
        formatPrice={peso}
        accent="#000"
      />,
    )
    expect(screen.getByText(/−₱160.00 · show your ID/)).toBeTruthy()
  })

  it('explains when a voucher saves more and applies instead', () => {
    render(
      <GovClaimField
        state={state({
          govClaim: { kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345' },
          govPreview: { status: 'outranked', governmentReduction: 160, otherReduction: 400 },
        })}
        formatPrice={peso}
        accent="#000"
      />,
    )
    expect(screen.getByText(/Your voucher saves more/)).toBeTruthy()
  })
})
