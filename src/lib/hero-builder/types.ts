// ---------------------------------------------------------------------------
// Hero Builder v5 — the design document a merchant builds and the storefront
// renders. Flow layout only (section → columns → widgets): nothing is
// absolutely positioned, so a design cannot overlap or overflow on a phone.
//
// Responsive model: every node carries a desktop `style` plus optional
// `tablet` / `mobile` partial overrides. The cascade is desktop → tablet →
// mobile, exactly like CSS max-width media queries (a tablet override also
// applies on mobile unless mobile overrides it again).
// ---------------------------------------------------------------------------

export type Device = 'desktop' | 'tablet' | 'mobile'

export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

export type BackgroundType = 'none' | 'color' | 'gradient' | 'image' | 'video'

export interface Gradient {
  kind: 'linear' | 'radial'
  from: string
  to: string
  /** Degrees, linear only. */
  angle: number
}

export interface BackgroundImage {
  url: string
  size: 'cover' | 'contain' | 'auto'
  position: 'center' | 'top' | 'bottom' | 'left' | 'right'
}

export interface Background {
  type: BackgroundType
  color?: string
  gradient?: Gradient
  image?: BackgroundImage
  /** Sections only: a muted, looping mp4 behind the content. */
  videoUrl?: string
  /** Tint over an image/video so text stays readable. */
  overlay?: { color: string; opacity: number }
}

export type Align = 'start' | 'center' | 'end' | 'stretch'
export type VerticalAlign = 'start' | 'center' | 'end' | 'between'
export type ShadowPreset = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type AspectRatio = 'auto' | '1/1' | '4/3' | '3/2' | '16/9' | '21/9' | '3/4' | '9/16'

/**
 * Every visual knob, all optional. Which keys a node honours depends on its
 * kind (see css.ts) — unused keys are ignored, never an error.
 */
export interface NodeStyle {
  hidden?: boolean
  // Box
  padding?: Box
  margin?: Box
  background?: Background
  borderWidth?: number
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  borderColor?: string
  radius?: number
  shadow?: ShadowPreset
  /** 0–100 */
  opacity?: number
  // Typography (inherited by children, like CSS)
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  italic?: boolean
  // Layout
  /** Percent of the parent (widgets) or relative share (columns). */
  width?: number
  maxWidth?: number
  minHeight?: number
  /** Sections: fill the visible screen height. */
  fullHeight?: boolean
  /** Sections: boxed content width in px; 0 = full width. */
  contentWidth?: number
  align?: Align
  verticalAlign?: VerticalAlign
  gap?: number
  /** Sections: put columns under each other. */
  stack?: boolean
  /** Sections: reverse column order while stacked. */
  reverse?: boolean
  // Widget visuals
  /** Icon size, spacer height, divider thickness, list icon size. */
  size?: number
  aspectRatio?: AspectRatio
  objectFit?: 'cover' | 'contain'
  /** Gallery grid columns. */
  columns?: number
  /** Buttons background, icon badge, countdown boxes, list icons. */
  accentColor?: string
  /** Text drawn on top of accentColor. */
  accentTextColor?: string
}

export interface Responsive {
  style: NodeStyle
  tablet?: NodeStyle
  mobile?: NodeStyle
}

export type AnimationType =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'

export interface Animation {
  type: AnimationType
  /** ms */
  duration: number
  /** ms */
  delay: number
}

// ── Widget content (discriminated on `kind`) ──────────────────────────────

export interface HeadingContent {
  kind: 'heading'
  text: string
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
}

export interface TextContent {
  kind: 'text'
  /** Supports **bold**, *italic*, [links](https://…) and line breaks. */
  text: string
}

export interface ButtonItem {
  id: string
  label: string
  href: string
  newTab: boolean
  variant: 'solid' | 'outline' | 'ghost'
  icon?: string
}

export interface ButtonsContent {
  kind: 'buttons'
  items: ButtonItem[]
}

export interface ImageContent {
  kind: 'image'
  src: string
  alt: string
  href?: string
  newTab?: boolean
}

export interface VideoContent {
  kind: 'video'
  /** YouTube / Vimeo page URL or a direct .mp4/.webm URL. */
  url: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  controls: boolean
}

export interface IconContent {
  kind: 'icon'
  name: string
  href?: string
}

export interface IconListItem {
  id: string
  icon: string
  text: string
}

export interface IconListContent {
  kind: 'icon-list'
  items: IconListItem[]
  layout: 'vertical' | 'inline'
}

export interface BadgeContent {
  kind: 'badge'
  text: string
  icon?: string
}

export interface CountdownContent {
  kind: 'countdown'
  /** ISO 8601 instant. */
  target: string
  showLabels: boolean
  expiredText: string
}

export interface DividerContent {
  kind: 'divider'
  lineStyle: 'solid' | 'dashed' | 'dotted'
}

export interface SpacerContent {
  kind: 'spacer'
}

export interface GalleryImage {
  id: string
  src: string
  alt: string
}

export interface GalleryContent {
  kind: 'gallery'
  images: GalleryImage[]
}

/** Sanitized HTML + <style>, rendered inline inside an isolated shadow root. */
export interface HtmlContent {
  kind: 'html'
  html: string
}

/** Any embed code incl. scripts, run inside a sandboxed, opaque-origin iframe. */
export interface EmbedContent {
  kind: 'embed'
  code: string
  /** Initial / minimum height in px. */
  height: number
  /** Grow the frame to fit its content. */
  autoHeight: boolean
}

/** The three ways a customer can take an order — mirrors OutletOrderMode. */
export type EntryMode = 'dine_in' | 'pickup' | 'delivery'

/**
 * Welcome page only: the block that starts an order. `tiles` / `list` offer
 * one choice per order type the store can fulfil (unavailable ones are never
 * shown); `cta` is one button that leaves the order type to checkout. Blank
 * labels and blurbs fall back to the defaults, so a template never ships
 * copy the merchant has to rewrite.
 */
export interface OrderEntryContent {
  kind: 'order-entry'
  layout: 'tiles' | 'list' | 'cta'
  ctaLabel: string
  ctaIcon?: string
  showIcons: boolean
  showBlurbs: boolean
  labels: Partial<Record<EntryMode, string>>
  blurbs: Partial<Record<EntryMode, string>>
  icons: Partial<Record<EntryMode, string>>
}

/** The store's own logo, read from its branding at render time. */
export interface StoreLogoContent {
  kind: 'store-logo'
  /** No logo uploaded: write the store name instead, or show nothing. */
  fallback: 'name' | 'none'
}

export interface Slide {
  id: string
  src: string
  alt: string
  title?: string
  caption?: string
  href?: string
}

/** Swipeable promo banners that advance on their own. */
export interface SlideshowContent {
  kind: 'slideshow'
  slides: Slide[]
  autoplay: boolean
  /** Seconds per slide. */
  interval: number
  showDots: boolean
}

export type WidgetContent =
  | HeadingContent
  | TextContent
  | ButtonsContent
  | ImageContent
  | VideoContent
  | IconContent
  | IconListContent
  | BadgeContent
  | CountdownContent
  | DividerContent
  | SpacerContent
  | GalleryContent
  | HtmlContent
  | EmbedContent
  | OrderEntryContent
  | StoreLogoContent
  | SlideshowContent

export type WidgetKind = WidgetContent['kind']

// ── Tree ───────────────────────────────────────────────────────────────────

export interface Widget extends Responsive {
  id: string
  kind: WidgetKind
  content: WidgetContent
  animation?: Animation
}

export interface Column extends Responsive {
  id: string
  widgets: Widget[]
}

export interface Section extends Responsive {
  id: string
  label: string
  /** In-page anchor so buttons can link to `#anchor`. */
  anchor?: string
  columns: Column[]
}

export type ThemeColorKey = 'primary' | 'secondary' | 'accent' | 'text' | 'muted' | 'background' | 'surface'

export interface Theme {
  /** Blank = follow the store's branding. */
  colors: Partial<Record<ThemeColorKey, string>>
  headingFont: string
  bodyFont: string
  /** Default button corner radius. */
  buttonRadius: number
}

export interface HeroDesignV5 {
  version: 5
  theme: Theme
  sections: Section[]
}

export type NodeKind = 'section' | 'column' | 'widget'

export interface NodeLocation {
  kind: NodeKind
  sectionIndex: number
  columnIndex?: number
  widgetIndex?: number
}
