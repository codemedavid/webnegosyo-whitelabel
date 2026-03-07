'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { ElementProps } from '@/types/hero-designer'

interface ElementSpecificSectionProps {
  props: ElementProps
  onUpdate: (props: Partial<ElementProps>) => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-zinc-400">{children}</span>
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
      </div>
    </label>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded accent-blue-500"
      />
      <span className="text-xs text-zinc-300">{label}</span>
    </label>
  )
}

function ImageControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'image' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="Image URL"
        value={props.src}
        onChange={(v) => onUpdate({ src: v } as Partial<ElementProps>)}
        placeholder="https://..."
      />
      <button
        type="button"
        className="w-full rounded border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
      >
        Upload Image
      </button>
      <TextInput
        label="Alt Text"
        value={props.alt}
        onChange={(v) => onUpdate({ alt: v } as Partial<ElementProps>)}
        placeholder="Describe the image"
      />
      <SelectField
        label="Object Fit"
        value={props.objectFit}
        onChange={(v) => onUpdate({ objectFit: v } as Partial<ElementProps>)}
        options={[
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
        ]}
      />
      <NumberField
        label="Border Radius"
        value={props.borderRadius}
        onChange={(v) => onUpdate({ borderRadius: v } as Partial<ElementProps>)}
        min={0}
      />
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <SectionLabel>Opacity</SectionLabel>
          <span className="text-xs text-zinc-500">{props.opacity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.opacity}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) } as Partial<ElementProps>)}
          className="w-full accent-blue-500"
        />
      </label>
    </div>
  )
}

function ButtonControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'button' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="Button Text"
        value={props.text}
        onChange={(v) => onUpdate({ text: v } as Partial<ElementProps>)}
      />
      <TextInput
        label="Link URL"
        value={props.linkUrl}
        onChange={(v) => onUpdate({ linkUrl: v } as Partial<ElementProps>)}
        placeholder="https://..."
      />
      <SelectField
        label="Link Target"
        value={props.linkTarget}
        onChange={(v) => onUpdate({ linkTarget: v } as Partial<ElementProps>)}
        options={[
          { value: '_self', label: 'Same Window' },
          { value: '_blank', label: 'New Tab' },
        ]}
      />
      <SelectField
        label="Hover Effect"
        value={props.hoverEffect}
        onChange={(v) => onUpdate({ hoverEffect: v } as Partial<ElementProps>)}
        options={[
          { value: 'none', label: 'None' },
          { value: 'darken', label: 'Darken' },
          { value: 'lighten', label: 'Lighten' },
          { value: 'scale', label: 'Scale' },
        ]}
      />
    </div>
  )
}

function ShapeControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'shape' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Shape Type"
        value={props.shapeType}
        onChange={(v) => onUpdate({ shapeType: v } as Partial<ElementProps>)}
        options={[
          { value: 'rectangle', label: 'Rectangle' },
          { value: 'circle', label: 'Circle' },
          { value: 'rounded-rect', label: 'Rounded Rectangle' },
        ]}
      />
      <ColorField
        label="Fill Color"
        value={props.fillColor}
        onChange={(v) => onUpdate({ fillColor: v } as Partial<ElementProps>)}
      />
    </div>
  )
}

function DividerControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'divider' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <SectionLabel>Orientation</SectionLabel>
        <div className="flex gap-1">
          {(['horizontal', 'vertical'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onUpdate({ orientation: o } as Partial<ElementProps>)}
              className={`rounded px-3 py-1 text-xs ${
                props.orientation === o
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {o === 'horizontal' ? 'H' : 'V'}
            </button>
          ))}
        </div>
      </div>
      <NumberField
        label="Thickness"
        value={props.thickness}
        onChange={(v) => onUpdate({ thickness: v } as Partial<ElementProps>)}
        min={1}
      />
      <ColorField
        label="Color"
        value={props.color}
        onChange={(v) => onUpdate({ color: v } as Partial<ElementProps>)}
      />
      <SelectField
        label="Style"
        value={props.style}
        onChange={(v) => onUpdate({ style: v } as Partial<ElementProps>)}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
        ]}
      />
    </div>
  )
}

function IconControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'icon' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="Icon Name (Lucide)"
        value={props.iconName}
        onChange={(v) => onUpdate({ iconName: v } as Partial<ElementProps>)}
        placeholder="e.g. heart, star, check"
      />
      <NumberField
        label="Size"
        value={props.size}
        onChange={(v) => onUpdate({ size: v } as Partial<ElementProps>)}
        min={8}
      />
      <ColorField
        label="Color"
        value={props.color}
        onChange={(v) => onUpdate({ color: v } as Partial<ElementProps>)}
      />
    </div>
  )
}

function VideoControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'video' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="Video URL"
        value={props.videoUrl}
        onChange={(v) => onUpdate({ videoUrl: v } as Partial<ElementProps>)}
        placeholder="https://..."
      />
      <div className="space-y-2">
        <CheckboxField
          label="Autoplay"
          checked={props.autoplay}
          onChange={(v) => onUpdate({ autoplay: v } as Partial<ElementProps>)}
        />
        <CheckboxField
          label="Muted"
          checked={props.muted}
          onChange={(v) => onUpdate({ muted: v } as Partial<ElementProps>)}
        />
        <CheckboxField
          label="Loop"
          checked={props.loop}
          onChange={(v) => onUpdate({ loop: v } as Partial<ElementProps>)}
        />
      </div>
      <TextInput
        label="Poster Image"
        value={props.posterImage}
        onChange={(v) => onUpdate({ posterImage: v } as Partial<ElementProps>)}
        placeholder="https://..."
      />
    </div>
  )
}

function CountdownControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'countdown' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="Target Date"
        value={props.targetDate}
        onChange={(v) => onUpdate({ targetDate: v } as Partial<ElementProps>)}
        type="datetime-local"
      />
      <div className="space-y-2">
        <SectionLabel>Show</SectionLabel>
        <CheckboxField
          label="Days"
          checked={props.showDays}
          onChange={(v) => onUpdate({ showDays: v } as Partial<ElementProps>)}
        />
        <CheckboxField
          label="Hours"
          checked={props.showHours}
          onChange={(v) => onUpdate({ showHours: v } as Partial<ElementProps>)}
        />
        <CheckboxField
          label="Minutes"
          checked={props.showMinutes}
          onChange={(v) => onUpdate({ showMinutes: v } as Partial<ElementProps>)}
        />
        <CheckboxField
          label="Seconds"
          checked={props.showSeconds}
          onChange={(v) => onUpdate({ showSeconds: v } as Partial<ElementProps>)}
        />
      </div>
      <NumberField
        label="Font Size"
        value={props.fontSize}
        onChange={(v) => onUpdate({ fontSize: v } as Partial<ElementProps>)}
        min={8}
      />
      <ColorField
        label="Color"
        value={props.color}
        onChange={(v) => onUpdate({ color: v } as Partial<ElementProps>)}
      />
      <ColorField
        label="Separator Color"
        value={props.separatorColor}
        onChange={(v) => onUpdate({ separatorColor: v } as Partial<ElementProps>)}
      />
    </div>
  )
}

function SocialProofControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'social-proof' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Preset Type"
        value={props.presetType}
        onChange={(v) => onUpdate({ presetType: v } as Partial<ElementProps>)}
        options={[
          { value: 'orders', label: 'Orders' },
          { value: 'merchants', label: 'Merchants' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      <TextInput
        label="Text"
        value={props.text}
        onChange={(v) => onUpdate({ text: v } as Partial<ElementProps>)}
      />
      <NumberField
        label="Number"
        value={props.number}
        onChange={(v) => onUpdate({ number: v } as Partial<ElementProps>)}
        min={0}
      />
      <TextInput
        label="Icon Name (Lucide)"
        value={props.iconName}
        onChange={(v) => onUpdate({ iconName: v } as Partial<ElementProps>)}
        placeholder="e.g. shopping-cart, users"
      />
      <SelectField
        label="Badge Style"
        value={props.badgeStyle}
        onChange={(v) => onUpdate({ badgeStyle: v } as Partial<ElementProps>)}
        options={[
          { value: 'pill', label: 'Pill' },
          { value: 'rounded', label: 'Rounded' },
          { value: 'square', label: 'Square' },
        ]}
      />
      <ColorField
        label="Background Color"
        value={props.backgroundColor}
        onChange={(v) => onUpdate({ backgroundColor: v } as Partial<ElementProps>)}
      />
      <ColorField
        label="Text Color"
        value={props.textColor}
        onChange={(v) => onUpdate({ textColor: v } as Partial<ElementProps>)}
      />
    </div>
  )
}

function AnimatedBgControls({
  props,
  onUpdate,
}: {
  props: Extract<ElementProps, { kind: 'animated-bg' }>
  onUpdate: (p: Partial<ElementProps>) => void
}) {
  function addColor() {
    onUpdate({
      gradientColors: [...props.gradientColors, '#000000'],
    } as Partial<ElementProps>)
  }

  function removeColor(index: number) {
    const next = props.gradientColors.filter((_, i) => i !== index)
    onUpdate({ gradientColors: next } as Partial<ElementProps>)
  }

  function updateColor(index: number, value: string) {
    const next = [...props.gradientColors]
    next[index] = value
    onUpdate({ gradientColors: next } as Partial<ElementProps>)
  }

  return (
    <div className="space-y-3">
      <SelectField
        label="Gradient Type"
        value={props.gradientType}
        onChange={(v) => onUpdate({ gradientType: v } as Partial<ElementProps>)}
        options={[
          { value: 'none', label: 'None' },
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
        ]}
      />

      {/* Gradient Colors */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <SectionLabel>Colors</SectionLabel>
          <button
            type="button"
            onClick={addColor}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            title="Add color"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="space-y-1">
          {props.gradientColors.map((color, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="color"
                value={color}
                onChange={(e) => updateColor(i, e.target.value)}
                className="h-6 w-6 cursor-pointer rounded border border-zinc-700 bg-transparent"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => updateColor(i, e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-100 outline-none focus:border-blue-500"
              />
              {props.gradientColors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColor(i)}
                  className="rounded p-0.5 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <NumberField
        label="Angle"
        value={props.gradientAngle}
        onChange={(v) => onUpdate({ gradientAngle: v } as Partial<ElementProps>)}
        min={0}
        max={360}
      />
      <SelectField
        label="Pattern Type"
        value={props.patternType}
        onChange={(v) => onUpdate({ patternType: v } as Partial<ElementProps>)}
        options={[
          { value: 'none', label: 'None' },
          { value: 'dots', label: 'Dots' },
          { value: 'lines', label: 'Lines' },
          { value: 'grid', label: 'Grid' },
        ]}
      />
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <SectionLabel>Pattern Opacity</SectionLabel>
          <span className="text-xs text-zinc-500">{props.patternOpacity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.patternOpacity}
          onChange={(e) =>
            onUpdate({ patternOpacity: Number(e.target.value) } as Partial<ElementProps>)
          }
          className="w-full accent-blue-500"
        />
      </label>
      <CheckboxField
        label="Parallax"
        checked={props.parallax}
        onChange={(v) => onUpdate({ parallax: v } as Partial<ElementProps>)}
      />
    </div>
  )
}

export function ElementSpecificSection({ props, onUpdate }: ElementSpecificSectionProps) {
  switch (props.kind) {
    case 'text':
      // Handled by typography section
      return null
    case 'image':
      return <ImageControls props={props} onUpdate={onUpdate} />
    case 'button':
      return <ButtonControls props={props} onUpdate={onUpdate} />
    case 'shape':
      return <ShapeControls props={props} onUpdate={onUpdate} />
    case 'divider':
      return <DividerControls props={props} onUpdate={onUpdate} />
    case 'icon':
      return <IconControls props={props} onUpdate={onUpdate} />
    case 'video':
      return <VideoControls props={props} onUpdate={onUpdate} />
    case 'countdown':
      return <CountdownControls props={props} onUpdate={onUpdate} />
    case 'social-proof':
      return <SocialProofControls props={props} onUpdate={onUpdate} />
    case 'animated-bg':
      return <AnimatedBgControls props={props} onUpdate={onUpdate} />
    default:
      return null
  }
}
