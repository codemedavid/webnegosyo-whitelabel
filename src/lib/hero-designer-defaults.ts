// ---------------------------------------------------------------------------
// Hero Section Designer — Element factory functions & defaults
// ---------------------------------------------------------------------------

import type {
  AnimatedBgProps,
  Breakpoint,
  ButtonProps,
  ColumnProps,
  CountdownProps,
  DividerProps,
  ElementAnimation,
  ElementLayout,
  ElementProps,
  ElementVisibility,
  HeroDesign,
  HeroElement,
  HeroElementType,
  IconProps,
  ImageProps,
  RowProps,
  ShapeProps,
  SocialProofProps,
  Spacing,
  TextProps,
  VideoProps,
} from '@/types/hero-designer'

// ── Constants ──────────────────────────────────────────────────────────────

export const ZERO_SPACING: Spacing = { top: 0, right: 0, bottom: 0, left: 0 }

export const NO_ANIMATION: ElementAnimation = {
  type: 'none',
  duration: 400,
  delay: 0,
}

// ── Layout helper ──────────────────────────────────────────────────────────

export function defaultLayout(overrides?: Partial<ElementLayout>): ElementLayout {
  return {
    x: 10,
    y: 10,
    width: 30,
    height: 10,
    rotation: 0,
    padding: { ...ZERO_SPACING },
    margin: { ...ZERO_SPACING },
    ...overrides,
  }
}

// ── Factory helpers ────────────────────────────────────────────────────────

function baseElement(
  type: HeroElementType,
  label: string,
  desktop: Partial<ElementLayout>,
  tablet: Partial<ElementLayout>,
  mobile: Partial<ElementLayout>,
): Omit<HeroElement, 'props'> {
  return {
    id: crypto.randomUUID(),
    type,
    label,
    visibility: { desktop: true, tablet: true, mobile: true } satisfies ElementVisibility,
    locked: false,
    zIndex: 0,
    desktop: defaultLayout(desktop),
    tablet: defaultLayout(tablet),
    mobile: defaultLayout(mobile),
    animation: { ...NO_ANIMATION },
  }
}

// ── Element factories ──────────────────────────────────────────────────────

export function createTextElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<TextProps> },
): HeroElement {
  const props: TextProps = {
    kind: 'text',
    content: 'Your heading here',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#1a1a1a',
    textAlign: 'center',
    textShadow: '',
    bold: false,
    italic: false,
    underline: false,
    ...overrides?.props,
  }

  return {
    ...baseElement('text', 'Text', { width: 50, height: -1 }, { x: 5, width: 80, height: -1 }, { x: 5, width: 90, height: -1 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createImageElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<ImageProps> },
): HeroElement {
  const props: ImageProps = {
    kind: 'image',
    src: '',
    alt: '',
    objectFit: 'cover',
    borderRadius: 0,
    opacity: 1,
    ...overrides?.props,
  }

  return {
    ...baseElement('image', 'Image', { width: 40, height: 50 }, { x: 5, width: 70, height: 45 }, { x: 5, width: 90, height: 40 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createButtonElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<ButtonProps> },
): HeroElement {
  const props: ButtonProps = {
    kind: 'button',
    text: 'Order Now',
    linkUrl: '',
    linkTarget: '_self',
    backgroundColor: '#FF3B30',
    textColor: '#ffffff',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 8,
    hoverEffect: 'darken',
    fontSize: 18,
    fontWeight: 600,
    ...overrides?.props,
  }

  return {
    ...baseElement('button', 'Button', { width: 20, height: 6 }, { x: 10, width: 60, height: 7 }, { x: 10, width: 80, height: 8 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createShapeElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<ShapeProps> },
): HeroElement {
  const props: ShapeProps = {
    kind: 'shape',
    shapeType: 'rectangle',
    fillColor: '#e5e7eb',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    opacity: 1,
    ...overrides?.props,
  }

  return {
    ...baseElement('shape', 'Shape', { width: 20, height: 20 }, { width: 30, height: 20 }, { width: 40, height: 20 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createDividerElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<DividerProps> },
): HeroElement {
  const props: DividerProps = {
    kind: 'divider',
    orientation: 'horizontal',
    thickness: 2,
    color: '#d1d5db',
    style: 'solid',
    ...overrides?.props,
  }

  return {
    ...baseElement('divider', 'Divider', { width: 60, height: 1 }, { x: 5, width: 80, height: 1 }, { x: 5, width: 90, height: 1 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createIconElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<IconProps> },
): HeroElement {
  const props: IconProps = {
    kind: 'icon',
    iconName: 'Star',
    size: 32,
    color: '#1a1a1a',
    ...overrides?.props,
  }

  return {
    ...baseElement('icon', 'Icon', { width: 5, height: 8 }, { width: 8, height: 9 }, { width: 10, height: 10 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createVideoElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<VideoProps> },
): HeroElement {
  const props: VideoProps = {
    kind: 'video',
    videoUrl: '',
    autoplay: true,
    muted: true,
    loop: true,
    posterImage: '',
    ...overrides?.props,
  }

  return {
    ...baseElement(
      'video',
      'Video',
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
    ),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createCountdownElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<CountdownProps> },
): HeroElement {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const props: CountdownProps = {
    kind: 'countdown',
    targetDate: tomorrow.toISOString(),
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
    fontSize: 32,
    color: '#1a1a1a',
    separatorColor: '#6b7280',
    ...overrides?.props,
  }

  return {
    ...baseElement(
      'countdown',
      'Countdown',
      { width: 40, height: 10 },
      { x: 5, width: 70, height: 10 },
      { x: 5, width: 90, height: 10 },
    ),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createSocialProofElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<SocialProofProps> },
): HeroElement {
  const props: SocialProofProps = {
    kind: 'social-proof',
    presetType: 'orders',
    text: 'Orders Completed',
    number: 1000,
    iconName: 'ShoppingBag',
    badgeStyle: 'pill',
    backgroundColor: '#f3f4f6',
    textColor: '#1a1a1a',
    ...overrides?.props,
  }

  return {
    ...baseElement(
      'social-proof',
      'Social Proof',
      { width: 20, height: 5 },
      { x: 10, width: 60, height: 5 },
      { x: 10, width: 80, height: 5 },
    ),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

export function createAnimatedBgElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<AnimatedBgProps> },
): HeroElement {
  const props: AnimatedBgProps = {
    kind: 'animated-bg',
    gradientType: 'linear',
    gradientColors: ['#667eea', '#764ba2'],
    gradientAngle: 135,
    patternType: 'none',
    patternOpacity: 0,
    parallax: false,
    ...overrides?.props,
  }

  return {
    ...baseElement(
      'animated-bg',
      'Animated Background',
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
    ),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
}

// ── Container factories ───────────────────────────────────────────────────

export function createRowElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<RowProps> },
): HeroElement {
  const props: RowProps = {
    kind: 'row',
    gap: 16,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    wrap: false,
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    ...overrides?.props,
  }

  const element: HeroElement = {
    ...baseElement('row', 'Row', { x: 5, y: 10, width: 90, height: 30 }, { x: 2, y: 10, width: 96, height: 30 }, { x: 2, y: 10, width: 96, height: 30 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
  return element
}

export function createColumnElement(
  overrides?: Partial<Omit<HeroElement, 'props'>> & { props?: Partial<ColumnProps> },
): HeroElement {
  const props: ColumnProps = {
    kind: 'column',
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 8,
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 8,
    ...overrides?.props,
  }

  const element: HeroElement = {
    ...baseElement('column', 'Column', { width: 30, height: -1 }, { width: 50, height: -1 }, { width: 100, height: -1 }),
    props,
    mobileProps: structuredClone(props),
    ...omitProps(overrides),
  }
  return element
}

// ── Breakpoint-aware props helper ─────────────────────────────────────────

/** Returns the active props for the given breakpoint, with fallback to desktop `props`. */
export function getActiveProps(element: HeroElement, breakpoint: Breakpoint): ElementProps {
  if (breakpoint === 'mobile') {
    return element.mobileProps ?? element.tabletProps ?? element.props
  }
  if (breakpoint === 'tablet') {
    return element.tabletProps ?? element.props
  }
  return element.props
}

/** Returns true if the element has a breakpoint-specific props override. */
export function hasPropsOverride(element: HeroElement, breakpoint: Breakpoint): boolean {
  if (breakpoint === 'desktop') return false
  if (breakpoint === 'tablet') return !!element.tabletProps
  return !!element.mobileProps
}

// ── Migration helper ──────────────────────────────────────────────────────

/** Migrate v1/v2 designs to v3 (adds tablet breakpoint + converts visible → visibility). */
export function migrateDesign(design: HeroDesign): HeroDesign {
  if (design.version === 3) return design

  // First ensure v2
  let d = design
  if (d.version === 1) {
    d = {
      ...d,
      version: 2,
      elements: d.elements.map((el) => ({
        ...el,
        mobileProps: el.mobileProps ?? structuredClone(el.props),
        parentId: el.parentId ?? null,
      })),
    }
  }

  // v2 → v3: add tablet, convert visible → visibility
  const canvas = d.canvas as unknown as Record<string, { width: number; height: number }>
  return {
    ...d,
    version: 3,
    canvas: {
      desktop: d.canvas.desktop,
      tablet: canvas.tablet ?? { width: 768 as const, height: d.canvas.mobile.height },
      mobile: d.canvas.mobile,
    },
    elements: d.elements.map((el) => {
      const oldVisible = (el as unknown as Record<string, unknown>).visible
      const wasVisible = oldVisible !== false

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { visible: _v, ...rest } = el as HeroElement & { visible?: boolean }
      return {
        ...rest,
        visibility: el.visibility ?? { desktop: wasVisible, tablet: wasVisible, mobile: wasVisible },
        tablet: el.tablet ?? structuredClone(el.desktop),
        tabletProps: el.tabletProps ?? undefined,
        mobileProps: el.mobileProps ?? structuredClone(el.props),
        parentId: el.parentId ?? null,
      }
    }),
  } as HeroDesign
}

// ── Element type → factory map ─────────────────────────────────────────────

export const elementFactories: Record<HeroElementType, () => HeroElement> = {
  'text': createTextElement,
  'image': createImageElement,
  'button': createButtonElement,
  'shape': createShapeElement,
  'divider': createDividerElement,
  'icon': createIconElement,
  'video': createVideoElement,
  'countdown': createCountdownElement,
  'social-proof': createSocialProofElement,
  'animated-bg': createAnimatedBgElement,
  'row': createRowElement,
  'column': createColumnElement,
}

// ── Blank design ───────────────────────────────────────────────────────────

export function createBlankDesign(): HeroDesign {
  return {
    version: 3,
    canvas: {
      desktop: { width: 1440, height: 600 },
      tablet: { width: 768, height: 500 },
      mobile: { width: 390, height: 500 },
    },
    backgroundColor: '#ffffff',
    layoutMode: 'boxed',
    elements: [],
  }
}

// ── Internal util ──────────────────────────────────────────────────────────

/** Strip `props` from an overrides object so it doesn't clobber the typed props. */
function omitProps<T extends { props?: unknown }>(
  obj: T | undefined,
): Omit<T, 'props'> | undefined {
  if (!obj) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { props: _props, ...rest } = obj
  return rest as Omit<T, 'props'>
}

