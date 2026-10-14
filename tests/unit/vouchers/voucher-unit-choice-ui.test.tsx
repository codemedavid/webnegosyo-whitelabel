import { fireEvent, render, screen } from '@testing-library/react'
import { VoucherUnitChoice } from '@/components/customer/checkout-templates/voucher-unit-choice'

const voucher = {
  code: 'ONEHALF',
  name: 'Half off one',
  amount: 56,
  unitLimit: 1,
  eligibleLineIds: ['a', 'b'],
  items: [{ lineId: 'a', units: 1 }],
}

describe('VoucherUnitChoice', () => {
  it('says where the voucher landed and lets the customer move it', () => {
    const onChoose = jest.fn()
    render(<VoucherUnitChoice voucher={voucher} lineNames={{ a: 'Fries', b: 'Burger' }} onChoose={onChoose} />)

    expect(screen.getByText('Fries ×1')).toBeTruthy()
    fireEvent.click(screen.getByText('Change'))
    fireEvent.click(screen.getByLabelText('Fewer Fries'))
    fireEvent.click(screen.getByLabelText('More Burger'))
    fireEvent.click(screen.getByText('Use these'))

    expect(onChoose).toHaveBeenCalledWith('ONEHALF', { a: 0, b: 1 })
  })

  it('never lets the customer choose more than the limit', () => {
    render(<VoucherUnitChoice voucher={voucher} lineNames={{ a: 'Fries', b: 'Burger' }} onChoose={jest.fn()} />)
    fireEvent.click(screen.getByText('Change'))

    expect((screen.getByLabelText('More Burger') as HTMLButtonElement).disabled).toBe(true)
  })
})
