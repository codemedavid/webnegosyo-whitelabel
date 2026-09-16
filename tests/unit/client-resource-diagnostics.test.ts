import { installResourceFailureDiagnostics, getResourceFailureContext } from '@/lib/client-resource-diagnostics'

it('records a failed app chunk without URL credentials and expires stale evidence', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-16T10:00:00Z'))
  const cleanup = installResourceFailureDiagnostics()
  const script = document.createElement('script')
  script.src = '/_next/static/chunks/menu.js?token=private#secret'
  document.body.appendChild(script)
  script.dispatchEvent(new Event('error'))
  expect(getResourceFailureContext()).toEqual(expect.objectContaining({
    online: true,
    failedResource: '/_next/static/chunks/menu.js',
  }))
  expect(JSON.stringify(getResourceFailureContext())).not.toMatch(/private|secret/)
  jest.advanceTimersByTime(60_001)
  expect(getResourceFailureContext()).not.toHaveProperty('failedResource')
  cleanup()
  script.remove()
  jest.useRealTimers()
})
