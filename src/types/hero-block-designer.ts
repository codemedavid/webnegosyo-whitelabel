// ---------------------------------------------------------------------------
// Hero Block Designer v4 — Type definitions
// ---------------------------------------------------------------------------

// ── Shared Primitives ─────────────────────────────────────────────────────

export interface SpacingValue {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MarginValue {
  top: number
  bottom: number
}

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export interface ElementVisibility {
  desktop: boolean
  tablet: boolean
  mobile: boolean
}

// ── Animation ─────────────────────────────────────────────────────────────

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

// ── Widget Props (discriminated union on `kind`) ──────────────────────────

export interface TextWidgetProps {
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

export interface ImageWidgetProps {
  kind: 'image'
  src: string
  alt: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius: number
  opacity: number
}

export interface ButtonWidgetProps {
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

export interface ShapeWidgetProps {
  kind: 'shape'
  shapeType: 'rectangle' | 'circle' | 'rounded-rect'
  fillColor: string
  borderWidth: number
  borderColor: string
  borderRadius: number
  opacity: number
}

export interface DividerWidgetProps {
  kind: 'divider'
  orientation: 'horizontal' | 'vertical'
  thickness: number
  color: string
  style: 'solid' | 'dashed' | 'dotted'
}

export interface SpacerWidgetProps {
  kind: 'spacer'
  height: number
}

export interface IconWidgetProps {
  kind: 'icon'
  iconName: string
  size: number
  color: string
}

export interface VideoWidgetProps {
  kind: 'video'
  videoUrl: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  posterImage: string
}

export interface CountdownWidgetProps {
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

export interface SocialProofWidgetProps {
  kind: 'social-proof'
  presetType: 'orders' | 'merchants' | 'custom'
  text: string
  number: number
  iconName: string
  badgeStyle: 'pill' | 'rounded' | 'square'
  backgroundColor: string
  textColor: string
}

export interface AnimatedBgWidgetProps {
  kind: 'animated-bg'
  gradientType: 'linear' | 'radial' | 'none'
  gradientColors: string[]
  gradientAngle: number
  patternType: 'dots' | 'lines' | 'grid' | 'none'
  patternOpacity: number
  parallax: boolean
}

/** Discriminated union of every widget's props */
export type WidgetProps =
  | TextWidgetProps
  | ImageWidgetProps
  | ButtonWidgetProps
  | ShapeWidgetProps
  | DividerWidgetProps
  | SpacerWidgetProps
  | IconWidgetProps
  | VideoWidgetProps
  | CountdownWidgetProps
  | SocialProofWidgetProps
  | AnimatedBgWidgetProps

/** Shorthand for the widget kind string union */
export type BlockWidgetType = WidgetProps['kind']

// ── Widget Overrides ──────────────────────────────────────────────────────

export interface WidgetOverrides {
  alignment?: 'left' | 'center' | 'right'
  width?: string
  margin?: MarginValue
  padding?: SpacingValue
  props?: Partial<WidgetProps>
}

// ── Block Widget ──────────────────────────────────────────────────────────

export interface BlockWidget {
  id: string
  type: BlockWidgetType
  label: string
  alignment: 'left' | 'center' | 'right'
  width: string
  margin: MarginValue
  padding: SpacingValue
  props: WidgetProps
  animation: ElementAnimation
  visibility: ElementVisibility
  responsiveOverrides?: Partial<Record<Breakpoint, WidgetOverrides>>
}

// ── Column ────────────────────────────────────────────────────────────────

export interface ColumnSettings {
  verticalAlign: 'top' | 'center' | 'bottom'
  horizontalAlign: 'left' | 'center' | 'right'
  padding: SpacingValue
  background: string
  borderRadius: number
}

export interface BlockColumn {
  id: string
  width: number
  widgets: BlockWidget[]
  settings: ColumnSettings
  responsiveOverrides?: Partial<Record<Breakpoint, Partial<ColumnSettings>>>
}

// ── Section ───────────────────────────────────────────────────────────────

export interface SectionBackground {
  type: 'color' | 'image' | 'gradient' | 'video'
  color?: string
  image?: string
  gradient?: string
  video?: string
}

export interface SectionSettings {
  contentWidth: number
  horizontalAlign: 'left' | 'center' | 'right'
  minHeight: number
  background: SectionBackground
  padding: SpacingValue
  margin: MarginValue
}

export interface BlockSection {
  id: string
  label: string
  columns: BlockColumn[]
  settings: SectionSettings
  responsiveOverrides?: Partial<Record<Breakpoint, Partial<SectionSettings>>>
}

// ── Top-level Design ──────────────────────────────────────────────────────

export interface GlobalStyles {
  backgroundColor: string
  backgroundImage?: string
  maxWidth: number
}

export interface HeroBlockDesign {
  version: 4
  sections: BlockSection[]
  globalStyles: GlobalStyles
}

// ── Editor State ──────────────────────────────────────────────────────────

export type BlockSelectionType = 'section' | 'column' | 'widget' | null

export interface BlockSelection {
  type: BlockSelectionType
  sectionId: string
  columnId?: string
  widgetId?: string
}

export interface BlockDesignerState {
  design: HeroBlockDesign
  selection: BlockSelection | null
  history: HeroBlockDesign[]
  historyIndex: number
  activeBreakpoint: Breakpoint
}

export interface ColumnPreset {
  id: string
  label: string
  widths: number[]
}
