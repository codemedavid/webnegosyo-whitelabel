'use client'

import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react'

import { FONT_OPTIONS } from '@/lib/hero-builder/constants'
import type { Background, BackgroundType, NodeKind, WidgetKind } from '@/lib/hero-builder/types'

import { ColorField, Field, Group, ImageField, NumberField, Segmented, SelectField, TextInput } from '../controls'
import type { NodeStyleBinding } from './node-style'

const FONT_CHOICES = Object.entries(FONT_OPTIONS).map(([value, f]) => ({ value, label: f.label }))
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: String(w) }))

const TEXT_KINDS: readonly WidgetKind[] = ['heading', 'text', 'buttons', 'icon-list', 'badge', 'countdown']
const ACCENT_LABEL: Partial<Record<WidgetKind, string>> = {
  buttons: 'Button color',
  'icon-list': 'Icon color',
  icon: 'Badge fill',
  badge: 'Icon color',
  countdown: 'Box color',
  divider: 'Line color',
}
const ACCENT_TEXT_LABEL: Partial<Record<WidgetKind, string>> = {
  buttons: 'Button text',
  countdown: 'Box text',
}

export function TypographyGroup({ b }: { b: NodeStyleBinding }) {
  const s = b.style
  return (
    <Group title="Typography">
      <Field label="Font" {...b.field('fontFamily')}>
        <SelectField value={s.fontFamily} onChange={(v) => b.set({ fontFamily: v || undefined })} options={FONT_CHOICES} placeholder="Inherit" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Size" {...b.field('fontSize')}>
          <NumberField value={s.fontSize} onChange={(v) => b.set({ fontSize: v }, 'fontSize')} min={8} max={160} unit="px" slider={false} placeholder="—" />
        </Field>
        <Field label="Weight" {...b.field('fontWeight')}>
          <SelectField value={s.fontWeight ? String(s.fontWeight) : undefined} onChange={(v) => b.set({ fontWeight: v ? Number(v) : undefined })} options={WEIGHTS} placeholder="—" />
        </Field>
        <Field label="Line height" {...b.field('lineHeight')}>
          <NumberField value={s.lineHeight} onChange={(v) => b.set({ lineHeight: v }, 'lineHeight')} min={0.7} max={3} step={0.05} slider={false} placeholder="—" />
        </Field>
        <Field label="Letter spacing" {...b.field('letterSpacing')}>
          <NumberField value={s.letterSpacing} onChange={(v) => b.set({ letterSpacing: v }, 'letterSpacing')} min={-10} max={40} step={0.5} unit="px" slider={false} placeholder="—" />
        </Field>
      </div>
      <Field label="Align" {...b.field('textAlign')}>
        <Segmented
          value={s.textAlign}
          onChange={(v) => b.set({ textAlign: v })}
          options={[
            { value: 'left', label: 'Left', icon: <AlignLeft className="h-3.5 w-3.5" /> },
            { value: 'center', label: 'Center', icon: <AlignCenter className="h-3.5 w-3.5" /> },
            { value: 'right', label: 'Right', icon: <AlignRight className="h-3.5 w-3.5" /> },
            { value: 'justify', label: 'Justify', icon: <AlignJustify className="h-3.5 w-3.5" /> },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Case" {...b.field('textTransform')}>
          <SelectField
            value={s.textTransform}
            onChange={(v) => b.set({ textTransform: v || undefined })}
            options={[
              { value: 'none', label: 'Normal' },
              { value: 'uppercase', label: 'UPPER' },
              { value: 'lowercase', label: 'lower' },
              { value: 'capitalize', label: 'Title' },
            ]}
            placeholder="Inherit"
          />
        </Field>
        <Field label="Style" {...b.field('italic')}>
          <Segmented
            value={s.italic ? 'italic' : 'normal'}
            onChange={(v) => b.set({ italic: v === 'italic' })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'italic', label: 'Italic' },
            ]}
          />
        </Field>
      </div>
    </Group>
  )
}

const BG_TYPES: readonly { value: BackgroundType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'color', label: 'Color' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
]

export function BackgroundGroup({ b, allowVideo }: { b: NodeStyleBinding; allowVideo: boolean }) {
  const bg: Background = b.style.background ?? { type: 'none' }
  const set = (patch: Partial<Background>, key?: string) => b.set({ background: { ...bg, ...patch } }, key)
  const types = allowVideo ? BG_TYPES : BG_TYPES.filter((t) => t.value !== 'video')
  const overlay = bg.overlay ?? { color: '#000000', opacity: 0 }
  return (
    <Group title="Background">
      <Field label="Type" {...b.field('background')}>
        <Segmented value={bg.type} onChange={(type) => set({ type })} options={types} />
      </Field>
      {bg.type === 'color' && (
        <Field label="Color">
          <ColorField value={bg.color} onChange={(color) => set({ color }, 'bg-color')} />
        </Field>
      )}
      {bg.type === 'gradient' && (
        <>
          <Segmented
            value={bg.gradient?.kind ?? 'linear'}
            onChange={(kind) => set({ gradient: { from: '@primary', to: '@accent', angle: 135, ...bg.gradient, kind } })}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'radial', label: 'Radial' },
            ]}
          />
          <Field label="From">
            <ColorField value={bg.gradient?.from ?? '@primary'} onChange={(from) => from && set({ gradient: { kind: 'linear', to: '@accent', angle: 135, ...bg.gradient, from } }, 'g-from')} />
          </Field>
          <Field label="To">
            <ColorField value={bg.gradient?.to ?? '@accent'} onChange={(to) => to && set({ gradient: { kind: 'linear', from: '@primary', angle: 135, ...bg.gradient, to } }, 'g-to')} />
          </Field>
          {(bg.gradient?.kind ?? 'linear') === 'linear' && (
            <Field label="Angle">
              <NumberField
                value={bg.gradient?.angle ?? 135}
                onChange={(angle) => set({ gradient: { kind: 'linear', from: '@primary', to: '@accent', ...bg.gradient, angle: angle ?? 135 } }, 'g-angle')}
                min={0}
                max={360}
                unit="°"
              />
            </Field>
          )}
        </>
      )}
      {bg.type === 'image' && (
        <>
          <ImageField value={bg.image?.url} onChange={(url) => set({ image: { size: 'cover', position: 'center', ...bg.image, url } })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fit">
              <SelectField
                value={bg.image?.size ?? 'cover'}
                onChange={(size) => set({ image: { url: '', position: 'center', ...bg.image, size } })}
                options={[
                  { value: 'cover', label: 'Cover' },
                  { value: 'contain', label: 'Contain' },
                  { value: 'auto', label: 'Original' },
                ]}
              />
            </Field>
            <Field label="Focus">
              <SelectField
                value={bg.image?.position ?? 'center'}
                onChange={(position) => set({ image: { url: '', size: 'cover', ...bg.image, position } })}
                options={[
                  { value: 'center', label: 'Center' },
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
          </div>
        </>
      )}
      {bg.type === 'video' && (
        <Field label="Video file URL" hint="A direct .mp4 link. It plays muted and looped behind the content.">
          <TextInput value={bg.videoUrl ?? ''} placeholder="https://…/clip.mp4" onChange={(e) => set({ videoUrl: e.target.value.trim() }, 'video')} />
        </Field>
      )}
      {(bg.type === 'image' || bg.type === 'video') && (
        <>
          <Field label="Overlay tint">
            <ColorField value={overlay.color} onChange={(color) => set({ overlay: { ...overlay, color: color ?? '#000000' } }, 'ov-color')} />
          </Field>
          <Field label="Overlay strength">
            <NumberField value={overlay.opacity} onChange={(opacity) => set({ overlay: { ...overlay, opacity: opacity ?? 0 } }, 'ov-op')} min={0} max={100} unit="%" />
          </Field>
        </>
      )}
    </Group>
  )
}

export function BorderGroup({ b }: { b: NodeStyleBinding }) {
  const s = b.style
  return (
    <Group title="Border & shadow" defaultOpen={false}>
      <Field label="Corner radius" {...b.field('radius')}>
        <NumberField value={s.radius} onChange={(v) => b.set({ radius: v }, 'radius')} min={0} max={80} unit="px" />
      </Field>
      <Field label="Border width" {...b.field('borderWidth')}>
        <NumberField value={s.borderWidth} onChange={(v) => b.set({ borderWidth: v }, 'bw')} min={0} max={12} unit="px" />
      </Field>
      {!!s.borderWidth && (
        <>
          <Field label="Border style">
            <Segmented
              value={s.borderStyle ?? 'solid'}
              onChange={(v) => b.set({ borderStyle: v })}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
            />
          </Field>
          <Field label="Border color">
            <ColorField value={s.borderColor} onChange={(v) => b.set({ borderColor: v }, 'bc')} />
          </Field>
        </>
      )}
      <Field label="Shadow" {...b.field('shadow')}>
        <Segmented
          value={s.shadow ?? 'none'}
          onChange={(v) => b.set({ shadow: v })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'sm', label: 'S' },
            { value: 'md', label: 'M' },
            { value: 'lg', label: 'L' },
            { value: 'xl', label: 'XL' },
          ]}
        />
      </Field>
      <Field label="Opacity" {...b.field('opacity')}>
        <NumberField value={s.opacity ?? 100} onChange={(v) => b.set({ opacity: v }, 'opacity')} min={0} max={100} unit="%" />
      </Field>
    </Group>
  )
}

interface StylePanelProps {
  b: NodeStyleBinding
  nodeKind: NodeKind
  widgetKind?: WidgetKind
}

export function StylePanel({ b, nodeKind, widgetKind }: StylePanelProps) {
  const isText = nodeKind !== 'widget' || (widgetKind && TEXT_KINDS.includes(widgetKind))
  const accent = widgetKind ? ACCENT_LABEL[widgetKind] : undefined
  const accentText = widgetKind ? ACCENT_TEXT_LABEL[widgetKind] : undefined
  const hasColor = nodeKind !== 'widget' || !['spacer', 'divider', 'image', 'gallery', 'video', 'embed'].includes(widgetKind ?? '')
  return (
    <>
      {(hasColor || accent) && (
        <Group title="Colors">
          {hasColor && (
            <Field label={widgetKind === 'icon' ? 'Icon color' : 'Text color'} {...b.field('color')}>
              <ColorField value={b.style.color} onChange={(v) => b.set({ color: v }, 'color')} />
            </Field>
          )}
          {accent && (
            <Field label={accent} {...b.field('accentColor')}>
              <ColorField value={b.style.accentColor} onChange={(v) => b.set({ accentColor: v }, 'accent')} />
            </Field>
          )}
          {accentText && (
            <Field label={accentText} {...b.field('accentTextColor')}>
              <ColorField value={b.style.accentTextColor} onChange={(v) => b.set({ accentTextColor: v }, 'accentText')} />
            </Field>
          )}
        </Group>
      )}
      {isText && <TypographyGroup b={b} />}
      {widgetKind !== 'spacer' && widgetKind !== 'divider' && <BackgroundGroup b={b} allowVideo={nodeKind === 'section'} />}
      <BorderGroup b={b} />
    </>
  )
}
