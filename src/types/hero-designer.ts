// ---------------------------------------------------------------------------
// Hero Section Designer — Type definitions
// ---------------------------------------------------------------------------

// ── Primitives ──────────────────────────────────────────────────────────────

export interface Spacing {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ElementVisibility {
  desktop: boolean
  tablet: boolean
  mobile: boolean
}

export interface ElementLayout {
  /** Percentage from left edge of canvas */
  x: number
  /** Percentage from top edge of canvas */
  y: number
  /** Percentage of canvas width (-1 for auto) */
  width: number
  /** Percentage of canvas height (-1 for auto) */
  height: number
  /** Rotation in degrees */
  rotation: number
  padding: Spacing
  margin: Spacing
}

// ── Animation ───────────────────────────────────────────────────────────────

export type AnimationType =
  | 'fadeIn'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scaleIn'
  | 'bounce'
  | 'none'

export interface ElementAnimation {
  type: AnimationType
  /** Duration in milliseconds */
  duration: number
  /** Delay in milliseconds */
  delay: number
}

// ── Element Prop Types (discriminated on `kind`) ────────────────────────────

export interface TextProps {
  kind: 'text'
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  color: string
  textAlign: 'left' | 'center' | 'right'
  textShadow: string
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface ImageProps {
  kind: 'image'
  src: string
  alt: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius: number
  opacity: number
}

export interface ButtonProps {
  kind: 'button'
  text: string
  linkUrl: string
  linkTarget: '_blank' | '_self'
  backgroundColor: string
  textColor: string
  borderWidth: number
  borderColor: string
  borderRadius: number
  hoverEffect: 'darken' | 'lighten' | 'scale' | 'none'
  fontSize: number
  fontWeight: number
}

export interface ShapeProps {
  kind: 'shape'
  shapeType: 'rectangle' | 'circle' | 'rounded-rect'
  fillColor: string
  borderWidth: number
  borderColor: string
  borderRadius: number
  opacity: number
}

export interface DividerProps {
  kind: 'divider'
  orientation: 'horizontal' | 'vertical'
  thickness: number
  color: string
  style: 'solid' | 'dashed' | 'dotted'
}

export interface IconProps {
  kind: 'icon'
  iconName: string
  size: number
  color: string
}

export interface VideoProps {
  kind: 'video'
  videoUrl: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  posterImage: string
}

export interface CountdownProps {
  kind: 'countdown'
  /** ISO 8601 date string */
  targetDate: string
  showDays: boolean
  showHours: boolean
  showMinutes: boolean
  showSeconds: boolean
  fontSize: number
  color: string
  separatorColor: string
}

export interface SocialProofProps {
  kind: 'social-proof'
  presetType: 'orders' | 'merchants' | 'custom'
  text: string
  number: number
  iconName: string
  badgeStyle: 'pill' | 'rounded' | 'square'
  backgroundColor: string
  textColor: string
}

export interface AnimatedBgProps {
  kind: 'animated-bg'
  gradientType: 'linear' | 'radial' | 'none'
  gradientColors: string[]
  gradientAngle: number
  patternType: 'dots' | 'lines' | 'grid' | 'none'
  patternOpacity: number
  parallax: boolean
}

/** Discriminated union of every element's props */
export type ElementProps =
  | TextProps
  | ImageProps
  | ButtonProps
  | ShapeProps
  | DividerProps
  | IconProps
  | VideoProps
  | CountdownProps
  | SocialProofProps
  | AnimatedBgProps
  | RowProps
  | ColumnProps

/** Shorthand for the element kind string union */
export type HeroElementType = ElementProps['kind']

// ── Hero Element ────────────────────────────────────────────────────────────

export interface RowProps {
  kind: 'row'
  gap: number
  alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch'
  justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
  wrap: boolean
  backgroundColor: string
  borderRadius: number
  padding: number
}

export interface ColumnProps {
  kind: 'column'
  flex: number
  alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch'
  justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between'
  gap: number
  backgroundColor: string
  borderRadius: number
  padding: number
}

export interface HeroElement {
  id: string
  type: HeroElementType
  label: string
  /** @deprecated Use visibility instead. Kept for v2 backward compat at read time. */
  visible?: boolean
  visibility: ElementVisibility
  locked: boolean
  zIndex: number
  desktop: ElementLayout
  tablet: ElementLayout
  mobile: ElementLayout
  props: ElementProps
  tabletProps?: ElementProps
  /** Breakpoint-specific props for mobile (falls back to `props` if absent) */
  mobileProps?: ElementProps
  animation: ElementAnimation
  /** Parent container ID for elements inside rows/columns */
  parentId?: string | null
}

// ── Canvas & Design ─────────────────────────────────────────────────────────

export type HeroLayoutMode = 'fullscreen' | 'boxed'

export interface CanvasConfig {
  desktop: { width: 1440; height: number }
  tablet: { width: 768; height: number }
  mobile: { width: 390; height: number }
}

export interface HeroDesign {
  version: 1 | 2 | 3
  canvas: CanvasConfig
  backgroundColor: string
  backgroundImage?: {
    url: string
    opacity: number
    objectFit: 'cover' | 'contain' | 'fill'
  }
  /** Whether the hero spans the full viewport width or stays within the container */
  layoutMode?: HeroLayoutMode
  elements: HeroElement[]
}

// ── Designer UI State ───────────────────────────────────────────────────────

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export interface DesignerState {
  design: HeroDesign
  selectedElementId: string | null
  activeBreakpoint: Breakpoint
  zoom: number
  showGrid: boolean
  history: HeroDesign[]
  historyIndex: number
}
