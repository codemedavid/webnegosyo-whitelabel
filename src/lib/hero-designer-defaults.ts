// ---------------------------------------------------------------------------
// Hero Section Designer — Element factory functions & defaults
// ---------------------------------------------------------------------------

import type {
  AnimatedBgProps,
  ButtonProps,
  CountdownProps,
  DividerProps,
  ElementAnimation,
  ElementLayout,
  HeroDesign,
  HeroElement,
  HeroElementType,
  IconProps,
  ImageProps,
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
  mobile: Partial<ElementLayout>,
): Omit<HeroElement, 'props'> {
  return {
    id: crypto.randomUUID(),
    type,
    label,
    visible: true,
    locked: false,
    zIndex: 0,
    desktop: defaultLayout(desktop),
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
    ...baseElement('text', 'Text', { width: 50, height: -1 }, { x: 5, width: 90, height: -1 }),
    props,
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
    ...baseElement('image', 'Image', { width: 40, height: 50 }, { x: 5, width: 90, height: 40 }),
    props,
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
    ...baseElement('button', 'Button', { width: 20, height: 6 }, { x: 10, width: 80, height: 8 }),
    props,
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
    ...baseElement('shape', 'Shape', { width: 20, height: 20 }, { width: 40, height: 20 }),
    props,
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
    ...baseElement('divider', 'Divider', { width: 60, height: 1 }, { x: 5, width: 90, height: 1 }),
    props,
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
    ...baseElement('icon', 'Icon', { width: 5, height: 8 }, { width: 10, height: 10 }),
    props,
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
    ),
    props,
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
      { x: 5, width: 90, height: 10 },
    ),
    props,
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
      { x: 10, width: 80, height: 5 },
    ),
    props,
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
    ),
    props,
    ...omitProps(overrides),
  }
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
}

// ── Blank design ───────────────────────────────────────────────────────────

export function createBlankDesign(): HeroDesign {
  return {
    version: 1,
    canvas: {
      desktop: { width: 1440, height: 600 },
      mobile: { width: 390, height: 500 },
    },
    backgroundColor: '#ffffff',
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
