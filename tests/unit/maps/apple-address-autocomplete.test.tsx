import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MapKit, MapKitAutocompleteResult } from '@/lib/maps/apple/mapkit-types'

jest.mock('@/lib/maps/apple/mapkit-loader', () => ({
  loadMapKit: jest.fn(),
  isMapKitUnconfiguredError: (error: unknown) => error instanceof Error && error.message === 'unconfigured',
}))

const greenbelt: MapKitAutocompleteResult = { displayLines: ['Greenbelt 5', 'Makati, Metro Manila'] }

interface FakeMap {
  center: { latitude: number; longitude: number }
  isScrollEnabled?: boolean
  mapType: string
  listeners: Record<string, (event: unknown) => void>
  annotations: Array<{ coordinate: { latitude: number; longitude: number } }>
}

function fakeMapKit(maps: FakeMap[] = []) {
  const autocomplete = jest.fn((_q: string, done: (e: Error | null, d: { results: MapKitAutocompleteResult[] }) => void) => {
    done(null, { results: [greenbelt] })
    return 1
  })
  const search = jest.fn((_r: unknown, done: (e: Error | null, d: unknown) => void) => {
    done(null, {
      places: [
        {
          name: 'Greenbelt 5',
          coordinate: { latitude: 14.5527, longitude: 121.0219 },
          formattedAddress: 'Legazpi St, Makati, 1223 Metro Manila, Philippines',
        },
      ],
    })
    return 2
  })
  const reverseLookup = jest.fn((_c: unknown, done: (e: Error | null, d: unknown) => void) => {
    done(null, { results: [{ coordinate: { latitude: 14.56, longitude: 121.03 }, formattedAddress: '6764 Ayala Avenue, Makati' }] })
    return 3
  })
  function Map(this: FakeMap & Record<string, unknown>, _parent: HTMLElement, options: { center: FakeMap['center']; isScrollEnabled?: boolean }) {
      Object.assign(this, {
        center: options.center,
        isScrollEnabled: options.isScrollEnabled,
        mapType: 'standard',
        listeners: {},
        annotations: [],
        addEventListener: (type: string, listener: (event: unknown) => void) => (this.listeners[type] = listener),
        addAnnotation: (annotation: FakeMap['annotations'][number]) => this.annotations.push(annotation),
        convertPointOnPageToCoordinate: () => ({ latitude: 14.56, longitude: 121.03 }),
        setCenterAnimated: jest.fn(),
        setCameraDistanceAnimated: jest.fn(),
        destroy: jest.fn(),
      })
      maps.push(this)
  }
  Map.MapTypes = { Standard: 'standard', MutedStandard: 'muted', Hybrid: 'hybrid', Satellite: 'satellite' }
  return {
    Map,
    MarkerAnnotation: function MarkerAnnotation(this: object, coordinate: unknown) {
      Object.assign(this, { coordinate, addEventListener: jest.fn() })
    },
    Coordinate: function Coordinate(this: object, latitude: number, longitude: number) {
      Object.assign(this, { latitude, longitude })
    },
    CoordinateSpan: function CoordinateSpan() {},
    CoordinateRegion: function CoordinateRegion() {},
    Search: function Search() {
      return { autocomplete, search, cancel: jest.fn() }
    },
    Geocoder: function Geocoder() {
      return { reverseLookup, lookup: jest.fn(), cancel: jest.fn() }
    },
  } as unknown as MapKit
}

interface RenderOptions {
  coordinates?: { lat: number; lng: number } | null
  biasCenter?: { lat: number; lng: number } | null
  value?: string
  check?: (point: { lat: number; lng: number }) => { isBlocked: boolean; message: string } | null
}

async function renderField(onChange = jest.fn(), options: RenderOptions = {}) {
  const { AppleAddressAutocomplete } = await import('@/components/shared/apple-maps/apple-address-autocomplete')
  function Harness() {
    return (
      <AppleAddressAutocomplete
        value={options.value ?? ''}
        onChange={onChange}
        coordinates={options.coordinates ?? null}
        biasCenter={options.biasCenter ?? null}
        check={options.check}
        fallback={<p>mapbox field</p>}
      />
    )
  }
  render(<Harness />)
  return onChange
}

beforeEach(() => jest.clearAllMocks())

it('asks the customer to confirm a searched place on the map before storing its pin', async () => {
  // Arrange
  const maps: FakeMap[] = []
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
  const onChange = await renderField()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())

  // Act: pick a suggestion
  fireEvent.focus(screen.getByRole('combobox'))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'greenbelt' } })
  const option = await screen.findByRole('option', { name: 'Greenbelt 5, Makati, Metro Manila' })
  await act(async () => {
    fireEvent.mouseDown(option)
  })

  // Assert: only text so far, and the confirm map opened on the place
  expect(onChange).toHaveBeenNthCalledWith(1, 'greenbelt')
  expect(onChange).toHaveBeenLastCalledWith('Greenbelt 5, Makati, Metro Manila')
  expect(await screen.findByRole('dialog', { name: 'Is this the exact spot?' })).toBeInTheDocument()
  await waitFor(() => expect(maps.length).toBeGreaterThan(0))
  expect(maps[maps.length - 1].center).toMatchObject({ latitude: 14.5527, longitude: 121.0219 })

  // Act: confirm without moving the map
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this spot' }))
  })

  // Assert: Apple's exact address, the pin, and that it was confirmed
  expect(onChange).toHaveBeenLastCalledWith(
    'Greenbelt 5, Legazpi St, Makati, 1223 Metro Manila, Philippines',
    { lat: 14.5527, lng: 121.0219 },
    { isConfirmed: true },
  )
})

it('uses the address under the pin once the customer moves the map away from the searched place', async () => {
  // Arrange
  const maps: FakeMap[] = []
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
  const onChange = await renderField()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())
  fireEvent.focus(screen.getByRole('combobox'))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'greenbelt' } })
  const option = await screen.findByRole('option', { name: 'Greenbelt 5, Makati, Metro Manila' })
  await act(async () => {
    fireEvent.mouseDown(option)
  })
  await waitFor(() => expect(maps.length).toBeGreaterThan(0))
  const map = maps[maps.length - 1]

  // Act: the map comes to rest ~900 m away, then Confirm
  await act(async () => {
    map.center = { latitude: 14.56, longitude: 121.03 }
    map.listeners['region-change-end']({})
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this spot' }))
  })

  // Assert
  expect(onChange).toHaveBeenLastCalledWith('6764 Ayala Avenue, Makati', { lat: 14.56, lng: 121.03 }, { isConfirmed: true })
})

it('opens the map on the store, not Manila, when there is no pin yet', async () => {
  const maps: FakeMap[] = []
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
  await renderField(jest.fn(), { biasCenter: { lat: 7.0474, lng: 125.5909 } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())

  fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }))

  await waitFor(() => expect(maps.length).toBeGreaterThan(0))
  expect(maps[maps.length - 1].center).toMatchObject({ latitude: 7.0474, longitude: 125.5909 })
})

it('shows the check\'s warning on the map and asks for an explicit yes, and blocks a refused spot', async () => {
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit())
  const check = jest.fn(() => ({ isBlocked: false, message: 'This pin is 34 km from Brew Café. Is that right?' }))
  await renderField(jest.fn(), { check })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())

  fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }))

  expect(await screen.findByText('This pin is 34 km from Brew Café. Is that right?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Yes, this is the right spot' })).toBeEnabled()

  check.mockReturnValue({ isBlocked: true, message: 'We only deliver within the Philippines.' })
  fireEvent.click(screen.getByRole('button', { name: 'Satellite' }))
  expect(await screen.findByText('We only deliver within the Philippines.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm this spot' })).toBeDisabled()
})

it('shows the Mapbox field when this deployment has no Apple Maps key', async () => {
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockRejectedValue(new Error('unconfigured'))

  await renderField()

  expect(await screen.findByText('mapbox field')).toBeInTheDocument()
})

it('degrades to a plain text field when MapKit fails to load', async () => {
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockRejectedValue(new Error('network'))
  jest.spyOn(console, 'error').mockImplementation(() => undefined)

  const onChange = await renderField()
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Pick on the map' })).toBeNull())
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '12 Rizal St' } })

  expect(onChange).toHaveBeenCalledWith('12 Rizal St')
})

it('answers what was typed before Apple Maps finished loading', async () => {
  // Arrange: MapKit resolves only after the diner has typed.
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  let finishLoading: (mapkit: MapKit) => void = () => undefined
  jest.mocked(loadMapKit).mockReturnValue(new Promise((resolve) => (finishLoading = resolve)))
  await renderField()

  // Act
  fireEvent.focus(screen.getByRole('combobox'))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'greenbelt' } })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    finishLoading(fakeMapKit())
  })

  // Assert
  expect(await screen.findByRole('option', { name: 'Greenbelt 5, Makati, Metro Manila' })).toBeInTheDocument()
})

describe('suggestion list', () => {
  it('can be driven from the keyboard: arrows highlight, Enter picks', async () => {
    // Arrange
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit())
    const onChange = await renderField()
    const input = await screen.findByRole('combobox')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'greenbelt' } })
    const option = await screen.findByRole('option', { name: 'Greenbelt 5, Makati, Metro Manila' })
    expect(input).toHaveAttribute('aria-expanded', 'true')

    // Act
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // Assert: highlighted and announced
    expect(option).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', option.id)

    // Act
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    // Assert
    expect(await screen.findByRole('dialog', { name: 'Is this the exact spot?' })).toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith('Greenbelt 5, Makati, Metro Manila')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('drops a late answer to text the diner has since cleared', async () => {
    // Arrange: Apple answers only when told to.
    const mapkit = fakeMapKit()
    let answer: () => void = () => undefined
    const search = new (mapkit.Search as unknown as new () => { autocomplete: jest.Mock })()
    search.autocomplete.mockImplementation((_q: string, done: (e: null, d: { results: MapKitAutocompleteResult[] }) => void) => {
      answer = () => done(null, { results: [greenbelt] })
      return 7
    })
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(mapkit)
    await renderField()
    const input = await screen.findByRole('combobox')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'greenbelt' } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    // Act: the diner clears the field, then the old answer arrives.
    fireEvent.change(input, { target: { value: 'gr' } })
    await act(async () => {
      answer()
    })

    // Assert
    expect(screen.queryByRole('option')).toBeNull()
  })
})

describe('pin preview', () => {
  it('shows the saved location as a fixed, non-interactive preview with a way to change it', async () => {
    const maps: FakeMap[] = []
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))

    await renderField(jest.fn(), { coordinates: { lat: 14.5527, lng: 121.0219 }, value: 'Greenbelt 5' })

    expect(screen.getByRole('region', { name: 'Your location on the map' })).toBeInTheDocument()
    await waitFor(() => expect(maps).toHaveLength(1))
    expect(maps[0].center).toMatchObject({ latitude: 14.5527, longitude: 121.0219 })
    expect(maps[0].isScrollEnabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Change pin' })).toBeInTheDocument()
  })

  it('asks for a pin when an address was typed but never placed', async () => {
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit())

    await renderField(jest.fn(), { value: 'Purok 3, near the chapel' })

    expect(await screen.findByText('Set your exact spot on the map so the rider finds you.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set pin on map' }))
    expect(await screen.findByRole('dialog', { name: 'Is this the exact spot?' })).toBeInTheDocument()
  })
})

describe('what a confirmed pin writes into the address', () => {
  async function renderControlled(onChange = jest.fn(), initialValue = '') {
    const React = await import('react')
    const { AppleAddressAutocomplete } = await import('@/components/shared/apple-maps/apple-address-autocomplete')
    function Controlled() {
      const [value, setValue] = React.useState(initialValue)
      const [pin, setPin] = React.useState<{ lat: number; lng: number } | null>(null)
      return (
        <AppleAddressAutocomplete
          value={value}
          coordinates={pin}
          onChange={(address, coordinates, meta) => {
            setValue(address)
            setPin(coordinates ?? null)
            onChange(address, coordinates, meta)
          }}
          fallback={<p>mapbox field</p>}
        />
      )
    }
    render(<Controlled />)
    return onChange
  }

  it('keeps an address the customer typed when they set the pin on the map', async () => {
    // Arrange
    const maps: FakeMap[] = []
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
    const onChange = await renderField(jest.fn(), { value: 'Blk 4 Lot 12, Mabuhay Homes' })
    fireEvent.click(await screen.findByRole('button', { name: 'Set pin on map' }))
    await waitFor(() => expect(maps.length).toBeGreaterThan(0))
    const map = maps[maps.length - 1]

    // Act: drag the map somewhere, then Confirm
    await act(async () => {
      map.center = { latitude: 14.56, longitude: 121.03 }
      map.listeners['region-change-end']({})
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm this spot' }))
    })

    // Assert: their words, not the reverse-geocoded "6764 Ayala Avenue"
    expect(onChange).toHaveBeenLastCalledWith('Blk 4 Lot 12, Mabuhay Homes', { lat: 14.56, lng: 121.03 }, { isConfirmed: true })
  })

  it('keeps typed words through a later "Change pin" too', async () => {
    const maps: FakeMap[] = []
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
    const onChange = await renderControlled(jest.fn(), 'Purok 3, near the chapel')
    fireEvent.click(await screen.findByRole('button', { name: 'Set pin on map' }))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm this spot' }))
    })
    expect(onChange).toHaveBeenLastCalledWith('Purok 3, near the chapel', expect.any(Object), { isConfirmed: true })

    fireEvent.click(await screen.findByRole('button', { name: 'Change pin' }))
    await waitFor(() => expect(maps.length).toBeGreaterThan(1))
    const map = maps[maps.length - 1]
    await act(async () => {
      map.center = { latitude: 14.56, longitude: 121.03 }
      map.listeners['region-change-end']({})
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm this spot' }))
    })
    expect(onChange).toHaveBeenLastCalledWith('Purok 3, near the chapel', { lat: 14.56, lng: 121.03 }, { isConfirmed: true })
  })

  it('still names the new spot when the address came from a search, not the customer', async () => {
    // Arrange: pick a searched place and confirm it
    const maps: FakeMap[] = []
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
    const onChange = await renderControlled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'greenbelt' } })
    const option = await screen.findByRole('option', { name: 'Greenbelt 5, Makati, Metro Manila' })
    await act(async () => {
      fireEvent.mouseDown(option)
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm this spot' }))
    })
    fireEvent.blur(screen.getByRole('combobox'))

    // Act: Change pin, move ~900 m, Confirm
    fireEvent.click(await screen.findByRole('button', { name: 'Change pin' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Is this the exact spot?' })).toBeInTheDocument())
    const map = maps[maps.length - 1]
    await act(async () => {
      map.center = { latitude: 14.56, longitude: 121.03 }
      map.listeners['region-change-end']({})
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm this spot' }))
    })

    // Assert
    expect(onChange).toHaveBeenLastCalledWith('6764 Ayala Avenue, Makati', { lat: 14.56, lng: 121.03 }, { isConfirmed: true })
  })
})
