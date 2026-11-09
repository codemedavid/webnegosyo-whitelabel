import { act, fireEvent, render, screen } from '@testing-library/react'
import { PinMapSearch } from '@/components/shared/apple-maps/pin-map-search'
import { readPastedLocation, type PastedResult } from '@/lib/maps/read-pasted-location'

jest.mock('@/lib/maps/read-pasted-location', () => ({
  readPastedLocation: jest.fn(),
  UNREADABLE_LINK_MESSAGE: 'We could not read that link.',
}))

const mockedRead = readPastedLocation as jest.MockedFunction<typeof readPastedLocation>
const NEAR = { lat: 14.6, lng: 121 }

function deferred() {
  let resolve: (value: PastedResult | null) => void = () => undefined
  const promise = new Promise<PastedResult | null>((done) => { resolve = done })
  return { promise, resolve }
}

function renderSearch() {
  const onPlace = jest.fn()
  render(<PinMapSearch suggest={jest.fn(async () => [])} resolveSuggestion={jest.fn(async () => null)} near={NEAR} onPlace={onPlace} />)
  return { onPlace, input: screen.getByRole('combobox', { name: 'Search on the map' }) as HTMLInputElement }
}

describe('PinMapSearch', () => {
  beforeEach(() => mockedRead.mockReset())

  it('moves the map to a pasted spot', async () => {
    mockedRead.mockResolvedValue({ kind: 'point', point: { lat: 15.66, lng: 120.58 } })
    const { onPlace, input } = renderSearch()
    await act(async () => { fireEvent.change(input, { target: { value: '15.66, 120.58' } }) })
    expect(onPlace).toHaveBeenCalledWith({ point: { lat: 15.66, lng: 120.58 }, label: null, source: 'link' })
    expect(input.value).toBe('')
  })

  it('ignores a slow short-link answer once the customer has typed something else', async () => {
    const slow = deferred()
    mockedRead.mockReturnValueOnce(slow.promise).mockResolvedValue(null)
    const { onPlace, input } = renderSearch()

    await act(async () => { fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/AbC' } }) })
    await act(async () => { fireEvent.change(input, { target: { value: 'Camella Tanza' } }) })
    await act(async () => { slow.resolve({ kind: 'point', point: { lat: 15.66, lng: 120.58 } }) })

    expect(onPlace).not.toHaveBeenCalled()
    expect(input.value).toBe('Camella Tanza')
  })

  it('shows no stale "could not read" error over newer typing', async () => {
    const slow = deferred()
    mockedRead.mockReturnValueOnce(slow.promise).mockResolvedValue(null)
    const { input } = renderSearch()

    await act(async () => { fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/AbC' } }) })
    await act(async () => { fireEvent.change(input, { target: { value: 'Camella' } }) })
    await act(async () => { slow.resolve({ kind: 'unreadable' }) })

    expect(screen.queryByText('We could not read that link.')).toBeNull()
  })
})
