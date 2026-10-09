'use client'

import { Eye, EyeOff } from 'lucide-react'

import type { Animation, AnimationType, AspectRatio, Device, NodeKind, Widget, WidgetKind } from '@/lib/hero-builder/types'

import { BoxField, Field, Group, NumberField, Segmented, SelectField, Toggle } from '../controls'
import type { NodeStyleBinding } from './node-style'

const DEVICE_LABEL: Record<Device, string> = { desktop: 'desktop', tablet: 'tablet', mobile: 'phones' }

const ASPECTS: readonly { value: AspectRatio; label: string }[] = [
  { value: 'auto', label: 'Original' },
  { value: '1/1', label: 'Square 1:1' },
  { value: '4/3', label: 'Classic 4:3' },
  { value: '3/2', label: 'Photo 3:2' },
  { value: '16/9', label: 'Wide 16:9' },
  { value: '21/9', label: 'Cinema 21:9' },
  { value: '3/4', label: 'Portrait 3:4' },
  { value: '9/16', label: 'Story 9:16' },
]

const ANIMATIONS: readonly { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade in' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-down', label: 'Slide down' },
  { value: 'slide-left', label: 'Slide from right' },
  { value: 'slide-right', label: 'Slide from left' },
  { value: 'zoom', label: 'Zoom in' },
]

const SIZE_LABEL: Partial<Record<WidgetKind, { label: string; min: number; max: number }>> = {
  icon: { label: 'Icon size', min: 12, max: 200 },
  spacer: { label: 'Height', min: 0, max: 400 },
  divider: { label: 'Thickness', min: 1, max: 20 },
  'icon-list': { label: 'Icon size', min: 10, max: 60 },
  'order-entry': { label: 'Icon size', min: 12, max: 96 },
  'store-logo': { label: 'Logo height', min: 16, max: 400 },
}

interface LayoutPanelProps {
  b: NodeStyleBinding
  nodeKind: NodeKind
  widget?: Widget
  device: Device
  onAnimation: (animation: Animation | undefined) => void
}

function VisibilityGroup({ b, device }: { b: NodeStyleBinding; device: Device }) {
  const hidden = !!b.style.hidden
  return (
    <Group title="Visibility">
      <button
        type="button"
        onClick={() => b.set({ hidden: !hidden })}
        className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-left text-xs hover:bg-neutral-50"
      >
        {hidden ? <EyeOff className="h-4 w-4 text-amber-600" /> : <Eye className="h-4 w-4 text-neutral-500" />}
        <span className="flex-1">
          <span className="block font-medium text-neutral-800">{hidden ? `Hidden on ${DEVICE_LABEL[device]}` : `Visible on ${DEVICE_LABEL[device]}`}</span>
          <span className="text-[11px] text-neutral-500">Switch devices in the toolbar to show it elsewhere.</span>
        </span>
      </button>
    </Group>
  )
}

function AnimationGroup({ widget, onAnimation }: { widget: Widget; onAnimation: (a: Animation | undefined) => void }) {
  const current: Animation = widget.animation ?? { type: 'none', duration: 600, delay: 0 }
  return (
    <Group title="Entrance animation" defaultOpen={false}>
      <SelectField value={current.type} onChange={(type) => onAnimation({ ...current, type })} options={ANIMATIONS} />
      {current.type !== 'none' && (
        <>
          <Field label="Duration">
            <NumberField value={current.duration} onChange={(v) => onAnimation({ ...current, duration: v ?? 600 })} min={100} max={3000} step={50} unit="ms" />
          </Field>
          <Field label="Delay">
            <NumberField value={current.delay} onChange={(v) => onAnimation({ ...current, delay: v ?? 0 })} min={0} max={3000} step={50} unit="ms" />
          </Field>
        </>
      )}
    </Group>
  )
}

export function LayoutPanel({ b, nodeKind, widget, device, onAnimation }: LayoutPanelProps) {
  const s = b.style
  const kind = widget?.kind
  const size = kind ? SIZE_LABEL[kind] : undefined
  const hasMedia = kind === 'image' || kind === 'video' || kind === 'gallery' || kind === 'slideshow'

  return (
    <>
      {nodeKind === 'section' && (
        <Group title="Section layout">
          <Field label="Content width" {...b.field('contentWidth')} hint="0 = edge to edge">
            <NumberField value={s.contentWidth} onChange={(v) => b.set({ contentWidth: v }, 'cw')} min={0} max={1600} step={10} unit="px" />
          </Field>
          <Toggle label="Fill the screen height" checked={!!s.fullHeight} onChange={(fullHeight) => b.set({ fullHeight })} />
          {!s.fullHeight && (
            <Field label="Minimum height" {...b.field('minHeight')}>
              <NumberField value={s.minHeight} onChange={(v) => b.set({ minHeight: v }, 'mh')} min={0} max={1200} step={10} unit="px" />
            </Field>
          )}
          <Field label="Content position" {...b.field('verticalAlign')}>
            <Segmented
              value={s.verticalAlign ?? 'start'}
              onChange={(v) => b.set({ verticalAlign: v })}
              options={[
                { value: 'start', label: 'Top' },
                { value: 'center', label: 'Middle' },
                { value: 'end', label: 'Bottom' },
              ]}
            />
          </Field>
          <Field label="Column alignment" {...b.field('align')}>
            <Segmented
              value={s.align ?? 'stretch'}
              onChange={(v) => b.set({ align: v })}
              options={[
                { value: 'start', label: 'Top' },
                { value: 'center', label: 'Middle' },
                { value: 'end', label: 'Bottom' },
                { value: 'stretch', label: 'Equal' },
              ]}
            />
          </Field>
          <Field label="Gap between columns" {...b.field('gap')}>
            <NumberField value={s.gap} onChange={(v) => b.set({ gap: v }, 'gap')} min={0} max={160} unit="px" />
          </Field>
          <Toggle label={`Stack columns on ${DEVICE_LABEL[device]}`} checked={!!s.stack} onChange={(stack) => b.set({ stack })} />
          {s.stack && <Toggle label="Reverse order when stacked" checked={!!s.reverse} onChange={(reverse) => b.set({ reverse })} />}
        </Group>
      )}

      {nodeKind === 'column' && (
        <Group title="Column layout">
          <Field label="Width share" {...b.field('width')} hint="Columns split the row by these numbers.">
            <NumberField value={s.width} onChange={(v) => b.set({ width: v }, 'w')} min={5} max={100} />
          </Field>
          <Field label="Content position" {...b.field('verticalAlign')}>
            <Segmented
              value={s.verticalAlign ?? 'start'}
              onChange={(v) => b.set({ verticalAlign: v })}
              options={[
                { value: 'start', label: 'Top' },
                { value: 'center', label: 'Middle' },
                { value: 'end', label: 'Bottom' },
                { value: 'between', label: 'Spread' },
              ]}
            />
          </Field>
          <Field label="Gap between elements" {...b.field('gap')}>
            <NumberField value={s.gap} onChange={(v) => b.set({ gap: v }, 'gap')} min={0} max={120} unit="px" />
          </Field>
        </Group>
      )}

      {nodeKind === 'widget' && (
        <Group title="Size & position">
          {size && (
            <Field label={size.label} {...b.field('size')}>
              <NumberField value={s.size} onChange={(v) => b.set({ size: v }, 'size')} min={size.min} max={size.max} unit="px" />
            </Field>
          )}
          {kind !== 'spacer' && (
            <>
              <Field label="Width" {...b.field('width')} hint="Blank = full column width">
                <NumberField value={s.width} onChange={(v) => b.set({ width: v }, 'w')} min={10} max={100} unit="%" />
              </Field>
              <Field label="Max width" {...b.field('maxWidth')}>
                <NumberField value={s.maxWidth} onChange={(v) => b.set({ maxWidth: v }, 'mw')} min={0} max={1600} step={10} unit="px" slider={false} placeholder="None" />
              </Field>
              <Field label="Position" {...b.field('align')}>
                <Segmented
                  value={s.align ?? 'stretch'}
                  onChange={(v) => b.set({ align: v })}
                  options={[
                    { value: 'start', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'end', label: 'Right' },
                    { value: 'stretch', label: kind === 'buttons' ? 'Full' : 'Fill' },
                  ]}
                />
              </Field>
            </>
          )}
          {(kind === 'buttons' || kind === 'icon-list' || kind === 'gallery' || kind === 'countdown' || kind === 'order-entry') && (
            <Field label="Spacing between items" {...b.field('gap')}>
              <NumberField value={s.gap} onChange={(v) => b.set({ gap: v }, 'gap')} min={0} max={80} unit="px" />
            </Field>
          )}
          {kind === 'gallery' && (
            <Field label="Columns" {...b.field('columns')}>
              <NumberField value={s.columns} onChange={(v) => b.set({ columns: v }, 'cols')} min={1} max={6} />
            </Field>
          )}
          {hasMedia && (
            <Field label="Shape" {...b.field('aspectRatio')}>
              <SelectField value={s.aspectRatio} onChange={(v) => b.set({ aspectRatio: v })} options={ASPECTS} />
            </Field>
          )}
          {(kind === 'image' || kind === 'gallery' || kind === 'slideshow') && (
            <Field label="Crop" {...b.field('objectFit')}>
              <Segmented
                value={s.objectFit ?? 'cover'}
                onChange={(v) => b.set({ objectFit: v })}
                options={[
                  { value: 'cover', label: 'Fill' },
                  { value: 'contain', label: 'Fit' },
                ]}
              />
            </Field>
          )}
        </Group>
      )}

      <Group title="Spacing">
        <Field label="Padding (inside)" {...b.field('padding')}>
          <BoxField value={s.padding} onChange={(padding) => b.set({ padding }, 'padding')} />
        </Field>
        <Field label="Margin (outside)" {...b.field('margin')}>
          <BoxField value={s.margin} onChange={(margin) => b.set({ margin }, 'margin')} min={-200} />
        </Field>
      </Group>

      <VisibilityGroup b={b} device={device} />
      {widget && <AnimationGroup widget={widget} onAnimation={onAnimation} />}
    </>
  )
}
