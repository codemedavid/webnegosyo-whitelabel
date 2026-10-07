/**
 * The slice of the MapKit JS 5 API this app uses, typed by hand so the global
 * `mapkit` object needs no extra dependency. Extend it when a new call is
 * needed; never widen anything to `any`.
 */

export interface MapKitCoordinate {
  latitude: number
  longitude: number
}

export interface MapKitCoordinateSpan {
  latitudeDelta: number
  longitudeDelta: number
}

export interface MapKitCoordinateRegion {
  center: MapKitCoordinate
  span: MapKitCoordinateSpan
}

/** A geocoder / search result. Every field but `coordinate` may be missing. */
export interface MapKitPlace {
  id?: string
  name?: string
  coordinate: MapKitCoordinate
  formattedAddress?: string
  fullThoroughfare?: string
  subLocality?: string
  locality?: string
  administrativeArea?: string
  postCode?: string
  country?: string
  countryCode?: string
  pointOfInterestCategory?: string
}

export interface MapKitAutocompleteResult {
  displayLines: string[]
  coordinate?: MapKitCoordinate
}

type Callback<T> = (error: Error | null, data: T) => void

export interface MapKitSearchOptions {
  language?: string
  getsUserLocation?: boolean
  region?: MapKitCoordinateRegion
  includeAddresses?: boolean
  includePointsOfInterest?: boolean
  includeQueries?: boolean
  limitToCountries?: string
}

export interface MapKitSearch {
  autocomplete(query: string, callback: Callback<{ results?: MapKitAutocompleteResult[] }>, options?: { region?: MapKitCoordinateRegion }): number
  search(query: string | MapKitAutocompleteResult, callback: Callback<{ places?: MapKitPlace[] }>, options?: { region?: MapKitCoordinateRegion }): number
  cancel(id: number): boolean
}

export interface MapKitGeocoder {
  lookup(place: string, callback: Callback<{ results?: MapKitPlace[] }>, options?: { limitToCountries?: string; region?: MapKitCoordinateRegion }): number
  reverseLookup(coordinate: MapKitCoordinate, callback: Callback<{ results?: MapKitPlace[] }>, options?: { language?: string }): number
  cancel(id: number): boolean
}

export interface MapKitEvent {
  type: string
  target?: unknown
  pointOnPage?: DOMPoint
  annotation?: MapKitAnnotation & { featureType?: string; title?: string }
}

type Listener = (event: MapKitEvent) => void

export interface MapKitEventTarget {
  addEventListener(type: string, listener: Listener): void
  removeEventListener(type: string, listener: Listener): void
}

export interface MapKitAnnotation extends MapKitEventTarget {
  coordinate: MapKitCoordinate
  title?: string
  selected?: boolean
  element?: HTMLElement
  data?: Record<string, unknown>
  /** Set on a cluster annotation only. */
  memberAnnotations?: MapKitAnnotation[] | null
  /** CSS px from the element's bottom centre; positive y moves the element up. */
  anchorOffset?: DOMPoint
  clusteringIdentifier?: string | null
}

export interface MapKitAnnotationOptions {
  title?: string
  color?: string
  glyphText?: string
  draggable?: boolean
  selected?: boolean
  animates?: boolean
  calloutEnabled?: boolean
  clusteringIdentifier?: string | null
  displayPriority?: number
  collisionMode?: string
  anchorOffset?: DOMPoint
  data?: Record<string, unknown>
}

export interface MapKitPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MapKitMapOptions {
  center?: MapKitCoordinate
  region?: MapKitCoordinateRegion
  cameraDistance?: number
  colorScheme?: string
  mapType?: string
  showsCompass?: string
  showsZoomControl?: boolean
  showsMapTypeControl?: boolean
  showsUserLocationControl?: boolean
  showsPointsOfInterest?: boolean
  isRotationEnabled?: boolean
  padding?: MapKitPadding
}

export interface MapKitMap extends MapKitEventTarget {
  center: MapKitCoordinate
  region: MapKitCoordinateRegion
  cameraDistance: number
  annotations: MapKitAnnotation[]
  selectedAnnotation: MapKitAnnotation | null
  selectableMapFeatures?: string[]
  annotationForCluster?: (cluster: MapKitAnnotation) => MapKitAnnotation | undefined
  setCenterAnimated(center: MapKitCoordinate, animate?: boolean): MapKitMap
  setRegionAnimated(region: MapKitCoordinateRegion, animate?: boolean): MapKitMap
  setCameraDistanceAnimated(distance: number, animate?: boolean): MapKitMap
  setRotationAnimated(degrees: number, animate?: boolean): MapKitMap | null
  showItems(items: MapKitAnnotation[], options?: { animate?: boolean; padding?: MapKitPadding; minimumSpan?: MapKitCoordinateSpan }): MapKitAnnotation[]
  addAnnotation(annotation: MapKitAnnotation): MapKitAnnotation
  addAnnotations(annotations: MapKitAnnotation[]): MapKitAnnotation[]
  removeAnnotation(annotation: MapKitAnnotation): MapKitAnnotation
  removeAnnotations(annotations: MapKitAnnotation[]): MapKitAnnotation[]
  convertPointOnPageToCoordinate(point: DOMPoint): MapKitCoordinate
  destroy(): void
}

export interface MapKit extends MapKitEventTarget {
  loadedLibraries?: string[]
  init(options: { authorizationCallback: (done: (token: string) => void) => void; language?: string }): void
  Coordinate: new (latitude: number, longitude: number) => MapKitCoordinate
  CoordinateSpan: new (latitudeDelta: number, longitudeDelta: number) => MapKitCoordinateSpan
  CoordinateRegion: new (center: MapKitCoordinate, span: MapKitCoordinateSpan) => MapKitCoordinateRegion
  Padding: new (top: number, right: number, bottom: number, left: number) => MapKitPadding
  Map: (new (parent: HTMLElement, options?: MapKitMapOptions) => MapKitMap) & {
    ColorSchemes: { Light: string; Dark: string }
    MapTypes: { Standard: string; MutedStandard: string; Hybrid: string; Satellite: string }
  }
  FeatureVisibility: { Adaptive: string; Hidden: string; Visible: string }
  MapFeatureType?: { PointOfInterest: string }
  MarkerAnnotation: new (coordinate: MapKitCoordinate, options?: MapKitAnnotationOptions) => MapKitAnnotation
  Annotation: new (
    coordinate: MapKitCoordinate,
    factory: (coordinate: MapKitCoordinate, options: MapKitAnnotationOptions) => HTMLElement,
    options?: MapKitAnnotationOptions,
  ) => MapKitAnnotation
  Search: new (options?: MapKitSearchOptions) => MapKitSearch
  Geocoder: new (options?: { language?: string; getsUserLocation?: boolean }) => MapKitGeocoder
}

declare global {
  interface Window {
    mapkit?: MapKit
  }
}
