import { WIDGET_DEFAULTS } from '@/lib/hero-builder/defaults'
import type { Widget } from '@/lib/hero-builder/types'
import { blockDef } from '@/lib/page-designer/blocks'

/** What the editor calls a widget: its kind, or a page block's own name. */
export function widgetLabel(widget: Widget): string {
  if (widget.content.kind === 'page-block') return blockDef(widget.content.block)?.label ?? 'Page block'
  return WIDGET_DEFAULTS[widget.kind]?.label ?? 'Element'
}
