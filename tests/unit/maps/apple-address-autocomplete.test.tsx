import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MapKit, MapKitAutocompleteResult } from '@/lib/maps/apple/mapkit-types'

jest.mock('@/lib/maps/apple/mapkit-loader', () => ({
  loadMapKit: jest.fn(),
  isMapKitUnconfiguredError: (error: unknown) => error instanceof Error && error.message === 'unconfigured',
}))

const greenbelt: MapKitAutocompleteResult = { displayLines: ['Greenbelt 5', 'Makati, Metro Manila'] }

interface FakeMap {
  center: { latitude: number; longitude: number }
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
  return {
    Map: function Map(this: FakeMap & Record<string, unknown>, _parent: HTMLElement, options: { center: FakeMap['center'] }) {
      Object.assign(this, {
        center: options.center,
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
    },
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

async function renderField(onChange = jest.fn(), coordinates: { lat: number; lng: number } | null = null) {
  const { AppleAddressAutocomplete } = await import('@/components/shared/apple-maps/apple-address-autocomplete')
  function Harness() {
    return <AppleAddressAutocomplete value="" onChange={onChange} coordinates={coordinates} fallback={<p>mapbox field</p>} />
  }
  render(<Harness />)
  return onChange
}

beforeEach(() => jest.clearAllMocks())

it('resolves an autocomplete pick to Apple\'s exact address and coordinates', async () => {
  // Arrange
  const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
  jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit())
  const onChange = await renderField()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pick on the map' })).toBeEnabled())

  // Act
  fireEvent.focus(screen.getByRole('combobox'))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'greenbelt' } })
  const option = await screen.findByRole('option', { name: 'Greenbelt 5, Makati, Metro Manila' })
  await act(async () => {
    fireEvent.mouseDown(option)
  })

  // Assert
  expect(onChange).toHaveBeenNthCalledWith(1, 'greenbelt')
  expect(onChange).toHaveBeenNthCalledWith(2, 'Greenbelt 5, Makati, Metro Manila')
  expect(onChange).toHaveBeenLastCalledWith('Greenbelt 5, Legazpi St, Makati, 1223 Metro Manila, Philippines', {
    lat: 14.5527,
    lng: 121.0219,
  })
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
    expect(onChange).toHaveBeenLastCalledWith('Greenbelt 5, Legazpi St, Makati, 1223 Metro Manila, Philippines', {
      lat: 14.5527,
      lng: 121.0219,
    })
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

describe('inline pin map', () => {
  it('shows the saved location as a pin on a map under the field', async () => {
    // Arrange
    const maps: FakeMap[] = []
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))

    // Act
    await renderField(jest.fn(), { lat: 14.5527, lng: 121.0219 })

    // Assert
    expect(screen.getByRole('region', { name: 'Your location on the map' })).toBeInTheDocument()
    await waitFor(() => expect(maps).toHaveLength(1))
    expect(maps[0].center).toMatchObject({ latitude: 14.5527, longitude: 121.0219 })
    expect(maps[0].annotations).toHaveLength(1)
    expect(maps[0].annotations[0].coordinate).toMatchObject({ latitude: 14.5527, longitude: 121.0219 })
  })

  it('has no pin before a location is chosen, and a tap drops one with Apple\'s address', async () => {
    // Arrange
    const maps: FakeMap[] = []
    const { loadMapKit } = await import('@/lib/maps/apple/mapkit-loader')
    jest.mocked(loadMapKit).mockResolvedValue(fakeMapKit(maps))
    const onChange = await renderField()
    await waitFor(() => expect(maps).toHaveLength(1))
    expect(maps[0].annotations).toHaveLength(0)
    expect(screen.getByText('Tap the map to drop your pin')).toBeInTheDocument()

    // Act
    await act(async () => {
      maps[0].listeners['single-tap']({ pointOnPage: { x: 10, y: 10 } })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Assert
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith('6764 Ayala Avenue, Makati', { lat: 14.56, lng: 121.03 }),
    )
    expect(maps[0].annotations).toHaveLength(1)
    expect(screen.queryByText('Tap the map to drop your pin')).toBeNull()
  })
})
