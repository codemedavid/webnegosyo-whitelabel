'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  BlockWidget,
  BlockBackground,
  Breakpoint,
  WidgetProps,
} from '@/types/hero-block-designer'
import type { ElementProps, HeroElement } from '@/types/hero-designer'
import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import { HorizontalAlignButtons } from '@/components/admin/hero-block-designer/alignment-buttons'
import { SpacingInput, MarginInput } from '@/components/admin/hero-block-designer/spacing-input'
import { TypographySection } from '@/components/admin/hero-designer/property-sections/typography-section'
import { AnimationSection } from '@/components/admin/hero-designer/property-sections/animation-section'
import { ElementSpecificSection } from '@/components/admin/hero-designer/property-sections/element-specific-section'

// ---------------------------------------------------------------------------
// WidgetSettingsPanel — Right panel when a widget is selected
// ---------------------------------------------------------------------------

interface WidgetSettingsPanelProps {
  widget: BlockWidget
  breakpoint: Breakpoint
  sectionId: string
  columnId: string
  dispatch: React.Dispatch<BlockDesignerAction>
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

const inputClass =
  'w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500'

/** Widget kinds that support typography editing */
const TYPOGRAPHY_KINDS = new Set(['text', 'button'])

/** Widget kinds that have appearance controls */
const APPEARANCE_KINDS = new Set(['image', 'shape', 'button'])

/**
 * Derive width mode from the widget's width string.
 * "auto" → auto, "100%" → full, anything else → custom
 */
function getWidthMode(width: string): 'auto' | 'full' | 'custom' {
  if (width === 'auto') return 'auto'
  if (width === '100%') return 'full'
  return 'custom'
}

export function WidgetSettingsPanel({
  widget,
  breakpoint,
  sectionId,
  columnId,
  dispatch,
}: WidgetSettingsPanelProps) {
  const widgetId = widget.id

  // ── dispatch helpers ─────────────────────────────────────────────────────
  const updateProps = useCallback(
    (props: Partial<WidgetProps>) => {
      dispatch({
        type: 'UPDATE_WIDGET_PROPS',
        sectionId,
        columnId,
        widgetId,
        props,
        breakpoint: breakpoint === 'desktop' ? undefined : breakpoint,
      })
    },
    [dispatch, sectionId, columnId, widgetId, breakpoint],
  )

  const updateSettings = useCallback(
    (
      settings: Partial<
        Pick<BlockWidget, 'alignment' | 'width' | 'margin' | 'padding' | 'background' | 'visibility'>
      >,
    ) => {
      dispatch({
        type: 'UPDATE_WIDGET_SETTINGS',
        sectionId,
        columnId,
        widgetId,
        settings,
        breakpoint: breakpoint === 'desktop' ? undefined : breakpoint,
      })
    },
    [dispatch, sectionId, columnId, widgetId, breakpoint],
  )

  const updateAnimation = useCallback(
    (animation: Partial<BlockWidget['animation']>) => {
      dispatch({
        type: 'UPDATE_WIDGET_ANIMATION',
        sectionId,
        columnId,
        widgetId,
        animation,
      })
    },
    [dispatch, sectionId, columnId, widgetId],
  )

  const widthMode = getWidthMode(widget.width)

  // v4 WidgetProps share the same shape as v3 ElementProps for matching kinds.
  // Cast so existing property sections accept them.
  const propsAsElementProps = widget.props as unknown as ElementProps

  // For AppearanceSection, which expects a HeroElement, build a minimal adapter.
  const elementAdapter: HeroElement = {
    id: widget.id,
    type: widget.type as HeroElement['type'],
    label: widget.label,
    visibility: widget.visibility,
    locked: false,
    zIndex: 0,
    desktop: {
      x: 0,
      y: 0,
      width: 100,
      height: -1,
      rotation: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    tablet: {
      x: 0,
      y: 0,
      width: 100,
      height: -1,
      rotation: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    mobile: {
      x: 0,
      y: 0,
      width: 100,
      height: -1,
      rotation: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    props: propsAsElementProps,
    animation: widget.animation,
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-3 py-3">
        <span className="block px-1 py-0.5 text-sm font-semibold text-zinc-100">
          {widget.label}
        </span>
        <p className="mt-0.5 text-xs text-zinc-500">
          {widget.type} widget &middot; {breakpoint}
        </p>
      </div>

      {/* Visibility */}
      <CollapsibleSection title="Visibility">
        <div className="space-y-2">
          {(['desktop', 'tablet', 'mobile'] as const).map((bp) => (
            <label key={bp} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={widget.visibility[bp]}
                onChange={(e) =>
                  updateSettings({
                    visibility: {
                      ...widget.visibility,
                      [bp]: e.target.checked,
                    },
                  })
                }
                className="rounded accent-blue-500"
              />
              <span className="text-xs capitalize text-zinc-300">{bp}</span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {/* Layout */}
      <CollapsibleSection title="Layout">
        <div className="space-y-3">
          {/* Alignment */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Alignment</span>
            <HorizontalAlignButtons
              value={widget.alignment as 'left' | 'center' | 'right' | 'stretch'}
              onChange={(v) =>
                updateSettings({
                  alignment: v as 'left' | 'center' | 'right',
                })
              }
              includeStretch
            />
          </div>

          {/* Width */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Width</span>
            <div className="flex gap-1">
              {(['auto', 'full', 'custom'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    const w =
                      mode === 'auto'
                        ? 'auto'
                        : mode === 'full'
                          ? '100%'
                          : '200px'
                    updateSettings({ width: w })
                  }}
                  className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
                    widthMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {widthMode === 'custom' && (
              <input
                type="text"
                value={widget.width}
                onChange={(e) => updateSettings({ width: e.target.value })}
                placeholder="e.g. 200px, 50%"
                className={inputClass}
              />
            )}
          </div>

          {/* Margin */}
          <MarginInput
            label="Margin"
            value={widget.margin}
            onChange={(margin) => updateSettings({ margin })}
          />

          {/* Padding */}
          <SpacingInput
            label="Padding"
            value={widget.padding}
            onChange={(padding) => updateSettings({ padding })}
          />
        </div>
      </CollapsibleSection>

      {/* Background */}
      <CollapsibleSection title="Background" defaultOpen={false}>
        <WidgetBackgroundControls
          background={widget.background}
          onChange={(background) => updateSettings({ background })}
        />
      </CollapsibleSection>

      {/* Typography (text & button only) */}
      {TYPOGRAPHY_KINDS.has(widget.type) && (
        <CollapsibleSection title="Typography">
          <TypographySection
            props={
              propsAsElementProps as Parameters<
                typeof TypographySection
              >[0]['props']
            }
            onUpdate={(partial) => updateProps(partial as Partial<WidgetProps>)}
          />
        </CollapsibleSection>
      )}

      {/* Appearance (image, shape, button) */}
      {APPEARANCE_KINDS.has(widget.type) && (
        <CollapsibleSection title="Appearance">
          <AppearanceInline
            widget={widget}
            elementAdapter={elementAdapter}
            breakpoint={breakpoint}
            onUpdate={(partial) => updateProps(partial as Partial<WidgetProps>)}
          />
        </CollapsibleSection>
      )}

      {/* Animation */}
      <CollapsibleSection title="Animation" defaultOpen={false}>
        <AnimationSection
          animation={widget.animation}
          onUpdate={updateAnimation}
        />
      </CollapsibleSection>

      {/* Element-Specific */}
      {widget.type !== 'text' && (
        <CollapsibleSection title="Element Settings">
          <ElementSpecificSection
            props={propsAsElementProps}
            onUpdate={(partial) => updateProps(partial as Partial<WidgetProps>)}
          />
        </CollapsibleSection>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// WidgetBackgroundControls — Background controls for widgets
// ---------------------------------------------------------------------------

function WidgetBackgroundControls({
  background,
  onChange,
}: {
  background: BlockBackground
  onChange: (bg: BlockBackground) => void
}) {
  const bgType = background.type

  const updateBackground = (updates: Partial<BlockBackground>) => {
    onChange({ ...background, ...updates })
  }

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1">
        {(['none', 'color', 'image', 'gradient'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (mode === 'none') {
                onChange({ type: 'none' })
              } else if (mode === 'color') {
                onChange({ type: 'color', color: background.color || '#1a1a2e' })
              } else if (mode === 'image') {
                onChange({
                  type: 'image',
                  image: background.image || { url: '', opacity: 1, objectFit: 'cover' },
                })
              } else {
                onChange({
                  type: 'gradient',
                  gradient: background.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                })
              }
            }}
            className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
              bgType === mode
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Color controls */}
      {bgType === 'color' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={background.color || '#000000'}
              onChange={(e) => updateBackground({ color: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={background.color || ''}
              onChange={(e) => updateBackground({ color: e.target.value })}
              className={inputClass}
            />
          </div>
        </label>
      )}

      {/* Image controls */}
      {bgType === 'image' && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Image URL</span>
            <input
              type="text"
              value={background.image?.url || ''}
              onChange={(e) =>
                updateBackground({
                  image: { ...background.image!, url: e.target.value },
                })
              }
              placeholder="https://..."
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Opacity</span>
              <span className="text-xs text-zinc-500">
                {(background.image?.opacity ?? 1).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={background.image?.opacity ?? 1}
              onChange={(e) =>
                updateBackground({
                  image: { ...background.image!, opacity: Number(e.target.value) },
                })
              }
              className="w-full accent-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Object Fit</span>
            <select
              value={background.image?.objectFit || 'cover'}
              onChange={(e) =>
                updateBackground({
                  image: {
                    ...background.image!,
                    objectFit: e.target.value as 'cover' | 'contain' | 'fill',
                  },
                })
              }
              className={inputClass}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill</option>
            </select>
          </label>
        </div>
      )}

      {/* Gradient controls */}
      {bgType === 'gradient' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">CSS Gradient</span>
          <input
            type="text"
            value={background.gradient || ''}
            onChange={(e) => updateBackground({ gradient: e.target.value })}
            placeholder="linear-gradient(135deg, #667eea, #764ba2)"
            className={inputClass}
          />
        </label>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AppearanceInline — Replicate relevant appearance controls inline
// (Avoids coupling to the v3 `getActiveProps` which expects HeroElement
//  layout structure. We inline the same controls.)
// ---------------------------------------------------------------------------

function AppearanceInline({
  widget,
  onUpdate,
}: {
  widget: BlockWidget
  elementAdapter: HeroElement
  breakpoint: Breakpoint
  onUpdate: (props: Partial<ElementProps>) => void
}) {
  const kind = widget.props.kind
  const props = widget.props

  const hasOpacity = kind === 'shape' || kind === 'image'
  const hasBorder = kind === 'shape' || kind === 'button'
  const hasBorderRadius = kind === 'shape' || kind === 'button' || kind === 'image'
  const hasFillColor = kind === 'shape'
  const hasBackgroundColor = kind === 'button'

  return (
    <div className="space-y-3">
      {/* Opacity */}
      {hasOpacity && 'opacity' in props && (
        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Opacity</span>
            <span className="text-xs text-zinc-500">
              {(props.opacity as number).toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={props.opacity as number}
            onChange={(e) =>
              onUpdate({ opacity: Number(e.target.value) } as Partial<ElementProps>)
            }
            className="w-full accent-blue-500"
          />
        </label>
      )}

      {/* Border Width */}
      {hasBorder && 'borderWidth' in props && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Border Width</span>
          <input
            type="number"
            value={props.borderWidth as number}
            onChange={(e) =>
              onUpdate({
                borderWidth: Number(e.target.value),
              } as Partial<ElementProps>)
            }
            min={0}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>
      )}

      {/* Border Color */}
      {hasBorder && 'borderColor' in props && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Border Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={props.borderColor as string}
              onChange={(e) =>
                onUpdate({ borderColor: e.target.value } as Partial<ElementProps>)
              }
              className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={props.borderColor as string}
              onChange={(e) =>
                onUpdate({ borderColor: e.target.value } as Partial<ElementProps>)
              }
              className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </div>
        </label>
      )}

      {/* Border Radius */}
      {hasBorderRadius && 'borderRadius' in props && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Border Radius</span>
          <input
            type="number"
            value={props.borderRadius as number}
            onChange={(e) =>
              onUpdate({
                borderRadius: Number(e.target.value),
              } as Partial<ElementProps>)
            }
            min={0}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>
      )}

      {/* Fill Color (shapes) */}
      {hasFillColor && 'fillColor' in props && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Fill Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={props.fillColor as string}
              onChange={(e) =>
                onUpdate({ fillColor: e.target.value } as Partial<ElementProps>)
              }
              className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={props.fillColor as string}
              onChange={(e) =>
                onUpdate({ fillColor: e.target.value } as Partial<ElementProps>)
              }
              className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </div>
        </label>
      )}

      {/* Background Color (buttons) */}
      {hasBackgroundColor && 'backgroundColor' in props && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Background Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={props.backgroundColor as string}
              onChange={(e) =>
                onUpdate({
                  backgroundColor: e.target.value,
                } as Partial<ElementProps>)
              }
              className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={props.backgroundColor as string}
              onChange={(e) =>
                onUpdate({
                  backgroundColor: e.target.value,
                } as Partial<ElementProps>)
              }
              className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </div>
        </label>
      )}
    </div>
  )
}
