// ---------------------------------------------------------------------------
// Hero Block Designer v4 — Defaults & Factory Functions
// ---------------------------------------------------------------------------

import { v4 as uuidv4 } from 'uuid'
import type {
  SpacingValue,
  MarginValue,
  ElementAnimation,
  ElementVisibility,
  ColumnPreset,
  BlockColumn,
  BlockSection,
  BlockWidget,
  BlockWidgetType,
  BlockBackground,
  WidgetProps,
  SectionSettings,
  ColumnSettings,
  Breakpoint,
  TextWidgetProps,
  ImageWidgetProps,
  ButtonWidgetProps,
  ShapeWidgetProps,
  DividerWidgetProps,
  SpacerWidgetProps,
  IconWidgetProps,
  VideoWidgetProps,
  CountdownWidgetProps,
  SocialProofWidgetProps,
  AnimatedBgWidgetProps,
  HeroBlockDesign,
} from '@/types/hero-block-designer'

// ── Constants ───────────────────────────────────────────────────────────────

export const ZERO_SPACING: SpacingValue = { top: 0, right: 0, bottom: 0, left: 0 }

export const ZERO_MARGIN: MarginValue = { top: 0, bottom: 0 }

export const NO_ANIMATION: ElementAnimation = { type: 'none', duration: 400, delay: 0 }

export const DEFAULT_VISIBILITY: ElementVisibility = {
  desktop: true,
  tablet: true,
  mobile: true,
}

export const NO_BACKGROUND: BlockBackground = { type: 'none' }

export const COLUMN_PRESETS: ColumnPreset[] = [
  { id: '1-col', label: '1 Column', widths: [100] },
  { id: '2-col-equal', label: '2 Columns (50/50)', widths: [50, 50] },
  { id: '2-col-70-30', label: '2 Columns (70/30)', widths: [70, 30] },
  { id: '2-col-30-70', label: '2 Columns (30/70)', widths: [30, 70] },
  { id: '3-col-equal', label: '3 Columns (33/34/33)', widths: [33, 34, 33] },
  { id: '4-col-equal', label: '4 Columns (25/25/25/25)', widths: [25, 25, 25, 25] },
  { id: '3-col-25-50-25', label: '3 Columns (25/50/25)', widths: [25, 50, 25] },
]

// ── Internal helper ─────────────────────────────────────────────────────────

function baseWidget(
  type: BlockWidgetType,
  label: string,
  props: WidgetProps,
  overrides?: { alignment?: 'left' | 'center' | 'right'; width?: string },
): BlockWidget {
  return {
    id: uuidv4(),
    type,
    label,
    alignment: overrides?.alignment ?? 'center',
    width: overrides?.width ?? 'full',
    margin: { ...ZERO_MARGIN },
    padding: { ...ZERO_SPACING },
    background: { ...NO_BACKGROUND },
    props,
    animation: { ...NO_ANIMATION },
    visibility: { ...DEFAULT_VISIBILITY },
  }
}

// ── Column & Section factories ──────────────────────────────────────────────

export function createColumn(width: number): BlockColumn {
  return {
    id: uuidv4(),
    width,
    widgets: [],
    settings: {
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { ...ZERO_SPACING },
      background: { type: 'none' },
      borderRadius: 0,
    },
  }
}

export function createSection(columnWidths?: number[]): BlockSection {
  const widths = columnWidths ?? [100]
  return {
    id: uuidv4(),
    label: 'Section',
    columns: widths.map((w) => createColumn(w)),
    settings: {
      contentWidth: 1200,
      horizontalAlign: 'center',
      minHeight: 0,
      background: { type: 'color', color: 'none' },
      padding: { top: 40, right: 20, bottom: 40, left: 20 },
      margin: { top: 0, bottom: 0 },
    },
  }
}

// ── Widget factories ────────────────────────────────────────────────────────

export function createTextWidget(): BlockWidget {
  const props: TextWidgetProps = {
    kind: 'text',
    content: 'Your Heading Here',
    fontFamily: 'sans-serif',
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    textAlign: 'center',
    textShadow: '',
    bold: false,
    italic: false,
    underline: false,
  }
  return baseWidget('text', 'Text', props)
}

export function createImageWidget(): BlockWidget {
  const props: ImageWidgetProps = {
    kind: 'image',
    src: '',
    alt: '',
    objectFit: 'cover',
    borderRadius: 0,
    opacity: 1,
  }
  return baseWidget('image', 'Image', props, { width: 'auto' })
}

export function createButtonWidget(): BlockWidget {
  const props: ButtonWidgetProps = {
    kind: 'button',
    text: 'Order Now',
    linkUrl: '',
    linkTarget: '_self',
    backgroundColor: '#FF3B30',
    textColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: '#000000',
    borderRadius: 8,
    hoverEffect: 'darken',
    fontSize: 16,
    fontWeight: 600,
  }
  return baseWidget('button', 'Button', props, { width: 'auto' })
}

export function createShapeWidget(): BlockWidget {
  const props: ShapeWidgetProps = {
    kind: 'shape',
    shapeType: 'rectangle',
    fillColor: '#E5E7EB',
    borderWidth: 0,
    borderColor: '#000000',
    borderRadius: 0,
    opacity: 1,
  }
  return baseWidget('shape', 'Shape', props)
}

export function createDividerWidget(): BlockWidget {
  const props: DividerWidgetProps = {
    kind: 'divider',
    orientation: 'horizontal',
    thickness: 2,
    color: '#D1D5DB',
    style: 'solid',
  }
  return baseWidget('divider', 'Divider', props)
}

export function createSpacerWidget(): BlockWidget {
  const props: SpacerWidgetProps = {
    kind: 'spacer',
    height: 40,
  }
  return baseWidget('spacer', 'Spacer', props)
}

export function createIconWidget(): BlockWidget {
  const props: IconWidgetProps = {
    kind: 'icon',
    iconName: 'Star',
    size: 48,
    color: '#000000',
  }
  return baseWidget('icon', 'Icon', props, { width: 'auto' })
}

export function createVideoWidget(): BlockWidget {
  const props: VideoWidgetProps = {
    kind: 'video',
    videoUrl: '',
    autoplay: true,
    muted: true,
    loop: true,
    posterImage: '',
  }
  return baseWidget('video', 'Video', props)
}

export function createCountdownWidget(): BlockWidget {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const props: CountdownWidgetProps = {
    kind: 'countdown',
    targetDate: tomorrow.toISOString(),
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
    fontSize: 36,
    color: '#000000',
    separatorColor: '#666666',
  }
  return baseWidget('countdown', 'Countdown', props)
}

export function createSocialProofWidget(): BlockWidget {
  const props: SocialProofWidgetProps = {
    kind: 'social-proof',
    presetType: 'orders',
    text: 'Orders Served',
    number: 10000,
    iconName: 'ShoppingBag',
    badgeStyle: 'pill',
    backgroundColor: '#F3F4F6',
    textColor: '#111827',
  }
  return baseWidget('social-proof', 'Social Proof', props, { width: 'auto' })
}

export function createAnimatedBgWidget(): BlockWidget {
  const props: AnimatedBgWidgetProps = {
    kind: 'animated-bg',
    gradientType: 'linear',
    gradientColors: ['#667eea', '#764ba2'],
    gradientAngle: 135,
    patternType: 'none',
    patternOpacity: 0.1,
    parallax: false,
  }
  return baseWidget('animated-bg', 'Animated Background', props)
}

// ── Widget factories map ────────────────────────────────────────────────────

export const widgetFactories: Record<BlockWidgetType, () => BlockWidget> = {
  'text': createTextWidget,
  'image': createImageWidget,
  'button': createButtonWidget,
  'shape': createShapeWidget,
  'divider': createDividerWidget,
  'spacer': createSpacerWidget,
  'icon': createIconWidget,
  'video': createVideoWidget,
  'countdown': createCountdownWidget,
  'social-proof': createSocialProofWidget,
  'animated-bg': createAnimatedBgWidget,
}

// ── Blank design ────────────────────────────────────────────────────────────

export function createBlankBlockDesign(): HeroBlockDesign {
  return {
    version: 4,
    sections: [],
    globalStyles: {
      backgroundColor: '#ffffff',
      maxWidth: 1200,
    },
  }
}

// ── Responsive resolution helpers ───────────────────────────────────────────

export function getActiveWidgetProps(widget: BlockWidget, breakpoint: Breakpoint): WidgetProps {
  const base = widget.props

  if (breakpoint === 'desktop') {
    return base
  }

  const overrides = widget.responsiveOverrides

  if (breakpoint === 'tablet') {
    const tabletOverride = overrides?.tablet?.props
    if (tabletOverride) {
      return { ...base, ...tabletOverride } as WidgetProps
    }
    return base
  }

  // mobile: try mobile override, then tablet override, then base
  const mobileOverride = overrides?.mobile?.props
  if (mobileOverride) {
    return { ...base, ...mobileOverride } as WidgetProps
  }

  const tabletOverride = overrides?.tablet?.props
  if (tabletOverride) {
    return { ...base, ...tabletOverride } as WidgetProps
  }

  return base
}

export function getActiveSectionSettings(
  section: BlockSection,
  breakpoint: Breakpoint,
): SectionSettings {
  const base = section.settings

  if (breakpoint === 'desktop') {
    return base
  }

  const overrides = section.responsiveOverrides

  if (breakpoint === 'tablet') {
    const tabletOverride = overrides?.tablet
    if (tabletOverride) {
      return { ...base, ...tabletOverride }
    }
    return base
  }

  // mobile: try mobile override, then tablet override, then base
  const mobileOverride = overrides?.mobile
  if (mobileOverride) {
    return { ...base, ...mobileOverride }
  }

  const tabletOverride = overrides?.tablet
  if (tabletOverride) {
    return { ...base, ...tabletOverride }
  }

  return base
}

export function getActiveColumnSettings(
  column: BlockColumn,
  breakpoint: Breakpoint,
): ColumnSettings {
  const base = column.settings

  if (breakpoint === 'desktop') {
    return base
  }

  const overrides = column.responsiveOverrides

  if (breakpoint === 'tablet') {
    const tabletOverride = overrides?.tablet
    if (tabletOverride) {
      return { ...base, ...tabletOverride }
    }
    return base
  }

  // mobile: try mobile override, then tablet override, then base
  const mobileOverride = overrides?.mobile
  if (mobileOverride) {
    return { ...base, ...mobileOverride }
  }

  const tabletOverride = overrides?.tablet
  if (tabletOverride) {
    return { ...base, ...tabletOverride }
  }

  return base
}
