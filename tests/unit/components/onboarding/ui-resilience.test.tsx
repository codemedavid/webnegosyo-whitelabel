import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'

const mockFetchLaunchCombos = jest.fn()
const mockRequestMenuRead = jest.fn()
const mockTickAction = jest.fn()
const mockToastError = jest.fn()

jest.mock('@/components/onboarding/onboarding-api', () => ({
  fetchLaunchCombos: (...args: unknown[]) => mockFetchLaunchCombos(...args),
  decideLaunchCombo: jest.fn(),
  requestMenuRead: (...args: unknown[]) => mockRequestMenuRead(...args),
}))
jest.mock('@/app/actions/start-here', () => ({ setStartStepTickAction: (...args: unknown[]) => mockTickAction(...args) }))
jest.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args), success: jest.fn() } }))

describe('onboarding UI resilience', () => {
  beforeEach(() => jest.clearAllMocks())

  test('combo choice offers retry and skip instead of an endless spinner when the read fails', async () => {
    const { ComboChoice } = await import('@/components/onboarding/reveal-choices')
    mockFetchLaunchCombos.mockResolvedValueOnce({ ok: false, error: 'offline' })
    const onDone = jest.fn()
    render(<ComboChoice token="t" initialCombos={null} eyebrow="Choice 1 of 3" boostHref="/b" onDone={onDone} />)

    expect(await screen.findByText('offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(onDone).toHaveBeenCalledWith(0)

    mockFetchLaunchCombos.mockResolvedValueOnce({ ok: true, data: [] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(mockFetchLaunchCombos).toHaveBeenCalledTimes(2))
  })

  test('menu read marks the view failed when the fetch throws', async () => {
    const { useMenuRead } = await import('@/components/onboarding/use-menu-read')
    mockRequestMenuRead.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useMenuRead('t', 'burger 100', [], true))
    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  test('menu read gives up as failed once it is still reading after the last poll', async () => {
    jest.useFakeTimers()
    try {
      const { useMenuRead } = await import('@/components/onboarding/use-menu-read')
      mockRequestMenuRead.mockResolvedValue({ ok: true, data: { status: 'reading', dishes: [] } })
      const { result } = renderHook(() => useMenuRead('t', 'burger 100', [], true))
      for (let i = 0; i < 95; i += 1) await act(async () => { await jest.advanceTimersByTimeAsync(3000) })
      expect(result.current.status).toBe('failed')
    } finally {
      jest.useRealTimers()
    }
  })

  test('a rejected tick action toasts instead of reaching the error boundary', async () => {
    const { TickButton } = await import('@/components/admin/start-here/tick-button')
    mockTickAction.mockRejectedValue(new Error('timeout'))
    render(<TickButton tenantId="t" tenantSlug="s" stepId="x" />)
    fireEvent.click(screen.getByRole('button', { name: /i did it/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
  })

  test('arrow keys move focus along a radio group without choosing', async () => {
    const { TapCard, handleRadioGroupKeyDown } = await import('@/components/onboarding/onboarding-ui')
    const onPick = jest.fn()
    render(
      <div role="radiogroup" aria-label="g" onKeyDown={handleRadioGroupKeyDown}>
        <TapCard title="A" isSelected={false} onClick={onPick} />
        <TapCard title="B" isSelected={false} onClick={onPick} />
      </div>,
    )
    const [first, second] = screen.getAllByRole('radio')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(second).toHaveFocus()
    expect(onPick).not.toHaveBeenCalled()
  })
})
