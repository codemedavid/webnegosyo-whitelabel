/**
 * Class overrides for an address field drawn inside a themed page (the
 * customer checkout, whose colours are the `--co-*` variables). Absent, every
 * address field keeps the app's standard gray look, so admin and superadmin
 * screens render exactly as before.
 *
 * Only presentation: the same input, search, pin and handlers either way.
 */
export interface AddressFieldTheme {
  /** The answer box's own look (border, fill, text, focus). The left padding for the pin icon stays. */
  input: string
  /** The suggestions dropdown's surface. */
  dropdown: string
  /** One suggestion row (hover). */
  option: string
  /** The keyboard-highlighted suggestion row. */
  optionActive: string
  /** A suggestion's text. */
  optionText: string
  /** The pin / search icons. */
  icon: string
  /** The "use my location" / "pick on the map" buttons. */
  button: string
  /** The text links under the box and the strip on the map. */
  link: string
  /** The strip across a map that has no pin yet. */
  mapStrip: string
  /** Mistake lines (location refused, map failed, pin outside the country). */
  error: string
  /** Secondary lines ("Pin set — the rider goes here", preview failed). */
  muted: string
}

/** Part marks for a themed field, so the Page Designer can style it; nothing for an unthemed one. */
export function addressFieldPart(theme: AddressFieldTheme | undefined, part: 'field' | 'button-alt' | 'link' | 'error' | 'muted'): string | undefined {
  return theme ? part : undefined
}
