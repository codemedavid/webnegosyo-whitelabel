'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getActiveProps } from '@/lib/hero-designer-defaults'
import type {
  HeroElement,
  HeroDesign,
  Breakpoint,
  ElementLayout,
  ElementProps,
  ElementAnimation,
} from '@/types/hero-designer'
import { PositionSection } from '@/components/admin/hero-designer/property-sections/position-section'
import { TypographySection } from '@/components/admin/hero-designer/property-sections/typography-section'
import { AppearanceSection } from '@/components/admin/hero-designer/property-sections/appearance-section'
import { AnimationSection } from '@/components/admin/hero-designer/property-sections/animation-section'
import { ElementSpecificSection } from '@/components/admin/hero-designer/property-sections/element-specific-section'

interface PropertiesPanelProps {
  selectedElement: HeroElement | null
  breakpoint: Breakpoint
  design: HeroDesign
  onUpdateLayout: (layout: Partial<ElementLayout>) => void
  onUpdateProps: (props: Partial<ElementProps>) => void
  onUpdateAnimation: (animation: Partial<ElementAnimation>) => void
  onUpdateMeta: (meta: Partial<Pick<HeroElement, 'label' | 'visible' | 'locked' | 'zIndex'>>) => void
  onUpdateCanvas: (updates: {
    backgroundColor?: string
    backgroundImage?: HeroDesign['backgroundImage']
    canvasHeight?: { breakpoint: Breakpoint; height: number }
  }) => void
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

function CanvasProperties({
  design,
  breakpoint,
  onUpdateCanvas,
}: {
  design: HeroDesign
  breakpoint: Breakpoint
  onUpdateCanvas: PropertiesPanelProps['onUpdateCanvas']
}) {
  const canvasHeight = design.canvas[breakpoint].height

  return (
    <div className="space-y-0">
      <div className="border-b border-zinc-800 px-3 py-2">
        <h3 className="text-sm font-medium text-zinc-200">Canvas Properties</h3>
        <p className="text-xs text-zinc-500">No element selected</p>
      </div>

      <CollapsibleSection title="Background">
        <div className="space-y-3">
          {/* Background Color */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Background Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={design.backgroundColor}
                onChange={(e) => onUpdateCanvas({ backgroundColor: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
              />
              <input
                type="text"
                value={design.backgroundColor}
                onChange={(e) => onUpdateCanvas({ backgroundColor: e.target.value })}
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
              />
            </div>
          </label>

          {/* Background Image URL */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Background Image URL</span>
            <input
              type="text"
              value={design.backgroundImage?.url ?? ''}
              onChange={(e) =>
                onUpdateCanvas({
                  backgroundImage: {
                    url: e.target.value,
                    opacity: design.backgroundImage?.opacity ?? 1,
                    objectFit: design.backgroundImage?.objectFit ?? 'cover',
                  },
                })
              }
              placeholder="https://..."
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </label>

          {/* Background Image Opacity */}
          {design.backgroundImage?.url && (
            <>
              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Image Opacity</span>
                  <span className="text-xs text-zinc-500">
                    {(design.backgroundImage?.opacity ?? 1).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={design.backgroundImage?.opacity ?? 1}
                  onChange={(e) =>
                    onUpdateCanvas({
                      backgroundImage: {
                        url: design.backgroundImage!.url,
                        opacity: Number(e.target.value),
                        objectFit: design.backgroundImage!.objectFit,
                      },
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </label>

              {/* Object Fit */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Object Fit</span>
                <select
                  value={design.backgroundImage?.objectFit ?? 'cover'}
                  onChange={(e) =>
                    onUpdateCanvas({
                      backgroundImage: {
                        url: design.backgroundImage!.url,
                        opacity: design.backgroundImage!.opacity,
                        objectFit: e.target.value as 'cover' | 'contain' | 'fill',
                      },
                    })
                  }
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </label>
            </>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Canvas Size">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">
            Height ({breakpoint === 'desktop' ? 'Desktop' : 'Mobile'})
          </span>
          <div className="flex items-center">
            <input
              type="number"
              value={canvasHeight}
              onChange={(e) =>
                onUpdateCanvas({
                  canvasHeight: { breakpoint, height: Number(e.target.value) },
                })
              }
              min={100}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
            <span className="ml-1 text-xs text-zinc-500">px</span>
          </div>
        </label>
      </CollapsibleSection>
    </div>
  )
}

function ElementProperties({
  element,
  breakpoint,
  onUpdateLayout,
  onUpdateProps,
  onUpdateAnimation,
  onUpdateMeta,
}: {
  element: HeroElement
  breakpoint: Breakpoint
  onUpdateLayout: PropertiesPanelProps['onUpdateLayout']
  onUpdateProps: PropertiesPanelProps['onUpdateProps']
  onUpdateAnimation: PropertiesPanelProps['onUpdateAnimation']
  onUpdateMeta: PropertiesPanelProps['onUpdateMeta']
}) {
  const layout = element[breakpoint]
  const resolvedProps = getActiveProps(element, breakpoint)
  const hasTypography = resolvedProps.kind === 'text' || resolvedProps.kind === 'button'

  return (
    <div className="space-y-0">
      {/* Element Label */}
      <div className="border-b border-zinc-800 px-3 py-2">
        <input
          type="text"
          value={element.label}
          onChange={(e) => onUpdateMeta({ label: e.target.value })}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-zinc-200 outline-none hover:border-zinc-700 focus:border-blue-500 focus:bg-zinc-800"
        />
        <p className="mt-0.5 text-xs text-zinc-500">
          {element.type} &middot; {breakpoint}
          {breakpoint === 'mobile' && element.mobileProps && (
            <span className="ml-1 text-blue-400">(mobile props)</span>
          )}
        </p>
      </div>

      {/* Position & Size */}
      <CollapsibleSection title="Position & Size">
        <PositionSection
          layout={layout}
          breakpoint={breakpoint}
          onUpdate={onUpdateLayout}
        />
      </CollapsibleSection>

      {/* Typography (text & button only) */}
      {hasTypography && (
        <CollapsibleSection title="Typography">
          <TypographySection
            props={resolvedProps as Extract<ElementProps, { kind: 'text' | 'button' }>}
            onUpdate={onUpdateProps}
          />
        </CollapsibleSection>
      )}

      {/* Appearance */}
      <CollapsibleSection title="Appearance">
        <AppearanceSection element={element} onUpdate={onUpdateProps} />
      </CollapsibleSection>

      {/* Animation */}
      <CollapsibleSection title="Animation">
        <AnimationSection
          animation={element.animation}
          onUpdate={onUpdateAnimation}
        />
      </CollapsibleSection>

      {/* Element-Specific */}
      {resolvedProps.kind !== 'text' && (
        <CollapsibleSection title={getSpecificSectionTitle(resolvedProps.kind)}>
          <ElementSpecificSection props={resolvedProps} onUpdate={onUpdateProps} />
        </CollapsibleSection>
      )}
    </div>
  )
}

function getSpecificSectionTitle(kind: string): string {
  const titles: Record<string, string> = {
    image: 'Image Settings',
    button: 'Button Settings',
    shape: 'Shape Settings',
    divider: 'Divider Settings',
    icon: 'Icon Settings',
    video: 'Video Settings',
    countdown: 'Countdown Settings',
    'social-proof': 'Social Proof Settings',
    'animated-bg': 'Animated Background',
    row: 'Row Settings',
    column: 'Column Settings',
  }
  return titles[kind] ?? 'Settings'
}

export function PropertiesPanel({
  selectedElement,
  breakpoint,
  design,
  onUpdateLayout,
  onUpdateProps,
  onUpdateAnimation,
  onUpdateMeta,
  onUpdateCanvas,
}: PropertiesPanelProps) {
  return (
    <div className="flex h-full w-72 flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900">
      {selectedElement ? (
        <ElementProperties
          element={selectedElement}
          breakpoint={breakpoint}
          onUpdateLayout={onUpdateLayout}
          onUpdateProps={onUpdateProps}
          onUpdateAnimation={onUpdateAnimation}
          onUpdateMeta={onUpdateMeta}
        />
      ) : (
        <CanvasProperties
          design={design}
          breakpoint={breakpoint}
          onUpdateCanvas={onUpdateCanvas}
        />
      )}
    </div>
  )
}
