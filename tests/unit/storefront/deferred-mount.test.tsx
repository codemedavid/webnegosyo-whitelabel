import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { DeferredMount } from '@/storefront/runtime/deferred-mount'

it('defers overlay effects until first open and preserves its state for close animations/reopening', () => {
  const mount = jest.fn()
  function Overlay({ open }: { open: boolean }) {
    const [identity] = useState(() => Math.random())
    useEffect(() => { mount() }, [])
    return <span data-testid="overlay" data-open={open}>{identity}</span>
  }
  const { rerender } = render(<DeferredMount active={false}><Overlay open={false} /></DeferredMount>)
  expect(mount).not.toHaveBeenCalled()
  rerender(<DeferredMount active><Overlay open /></DeferredMount>)
  const identity = screen.getByTestId('overlay').textContent
  rerender(<DeferredMount active={false}><Overlay open={false} /></DeferredMount>)
  expect(screen.getByTestId('overlay')).toHaveAttribute('data-open', 'false')
  rerender(<DeferredMount active><Overlay open /></DeferredMount>)
  expect(screen.getByTestId('overlay').textContent).toBe(identity)
  expect(mount).toHaveBeenCalledTimes(1)
})
