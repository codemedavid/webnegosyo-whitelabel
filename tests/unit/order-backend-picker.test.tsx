import { describe, it, expect, jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { OrderBackendPicker } from '@/components/superadmin/order-backend-picker'

describe('OrderBackendPicker', () => {
  it('offers automatic, convex and platform', () => {
    render(
      <OrderBackendPicker value="auto" onChange={jest.fn()} hasConvexUrl isPending={false} />
    )

    expect(screen.getByRole('radio', { name: /^Automatic/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Convex/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Platform database/ })).toBeInTheDocument()
  })

  it('selects automatic by default', () => {
    render(
      <OrderBackendPicker value="auto" onChange={jest.fn()} hasConvexUrl isPending={false} />
    )
    expect(screen.getByRole('radio', { name: /^Automatic/ })).toBeChecked()
  })

  it('reports the chosen backend', () => {
    const onChange = jest.fn()
    render(<OrderBackendPicker value="auto" onChange={onChange} hasConvexUrl isPending={false} />)

    fireEvent.click(screen.getByRole('radio', { name: /^Platform database/ }))

    expect(onChange).toHaveBeenCalledWith('platform')
  })

  it('cannot pin to convex before a deployment url is entered', () => {
    render(
      <OrderBackendPicker
        value="auto"
        onChange={jest.fn()}
        hasConvexUrl={false}
        isPending={false}
      />
    )
    expect(screen.getByRole('radio', { name: /^Convex/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Platform database/ })).toBeEnabled()
  })

  it('locks every option while a save is in flight', () => {
    render(<OrderBackendPicker value="auto" onChange={jest.fn()} hasConvexUrl isPending />)
    expect(screen.getByRole('radio', { name: /^Automatic/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Platform database/ })).toBeDisabled()
  })

  it('always warns that existing orders stay behind', () => {
    render(<OrderBackendPicker value="auto" onChange={jest.fn()} hasConvexUrl isPending={false} />)
    expect(screen.getByText(/does not move existing orders/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('asks for a confirmation only when the save would move orders', () => {
    const onConfirm = jest.fn()
    render(
      <OrderBackendPicker value="platform" onChange={jest.fn()} hasConvexUrl isPending={false}
        isMovingOrders onMoveConfirmedChange={onConfirm} />
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })
})
