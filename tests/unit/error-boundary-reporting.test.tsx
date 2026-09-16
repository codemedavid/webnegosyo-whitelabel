import { fireEvent, render, screen } from '@testing-library/react'
import * as Sentry from '@sentry/nextjs'
import AdminError from '@/app/[tenant]/admin/error'
import TenantError from '@/app/[tenant]/error'
import AppError from '@/app/error'

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

it('reports an admin crash with its boundary and server digest, and lets the user retry', () => {
  const error = Object.assign(new Error('Dashboard failed'), { digest: 'server-error-123' })
  const reset = jest.fn()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  render(<AdminError error={error} reset={reset} />)
  expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
    tags: expect.objectContaining({ errorBoundary: 'admin' }),
    contexts: expect.objectContaining({ nextjs: { digest: 'server-error-123' } }),
  }))
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalledTimes(1)
  jest.restoreAllMocks()
})

it.each([
  ['tenant', TenantError],
  ['app', AppError],
] as const)('reports %s failures and exposes retry and reload recovery', (boundary, ErrorPage) => {
  const error = new Error('Could not load page')
  const reset = jest.fn()
  render(<ErrorPage error={error} reset={reset} />)
  expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
    tags: { errorBoundary: boundary },
  }))
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
})

it('keeps recovery usable if error reporting throws', () => {
  jest.mocked(Sentry.captureException).mockImplementationOnce(() => { throw new Error('SDK unavailable') })
  const reset = jest.fn()
  render(<TenantError error={new Error('Storefront failed')} reset={reset} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalledTimes(1)
})
