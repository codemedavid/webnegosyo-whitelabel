'use client'

import { ArrowDown, ArrowUp, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { COLUMN_LAYOUTS, newId } from '@/lib/hero-builder/defaults'
import { LIMITS, SLIDE_INTERVAL } from '@/lib/hero-builder/constants'
import { safeAnchor } from '@/lib/hero-builder/safe-values'
import { ENTRY_DEFAULTS } from '@/lib/hero-builder/entry-copy'
import { ENTRY_MODES } from '@/lib/hero-builder/link-target'
import type { ButtonItem, EntryMode, OrderEntryContent, Section, Slide, Widget, WidgetContent } from '@/lib/hero-builder/types'

import { Field, Group, IconPicker, ImageField, Segmented, SelectField, TextArea, TextInput, Toggle } from '../controls'
import type { HeroBuilderApi } from '../use-hero-builder'
import { LinkPicker, sectionAnchorsOf, useLinkSurface } from './link-picker'

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

interface ListEditorProps<T extends { id: string }> {
  items: readonly T[]
  max: number
  addLabel: string
  onChange: (items: T[]) => void
  create: () => T
  render: (item: T, update: (patch: Partial<T>) => void) => ReactNode
}

function ListEditor<T extends { id: string }>({ items, max, addLabel, onChange, create, render }: ListEditorProps<T>) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2.5">
          {render(item, (patch) => onChange(items.map((it) => (it.id === item.id ? { ...it, ...patch } : it))))}
          <div className="flex justify-end gap-1 text-neutral-400">
            <button type="button" title="Move up" onClick={() => onChange(move(items, i, i - 1))} className="rounded p-1 hover:bg-white hover:text-neutral-700">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Move down" onClick={() => onChange(move(items, i, i + 1))} className="rounded p-1 hover:bg-white hover:text-neutral-700">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Remove" onClick={() => onChange(items.filter((it) => it.id !== item.id))} className="rounded p-1 hover:bg-white hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          onClick={() => onChange([...items, create()])}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-600 hover:border-sky-400 hover:text-sky-700"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
    </div>
  )
}

function SafetyNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-emerald-50 p-2.5 text-[11px] leading-snug text-emerald-900">
      <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-700" />
      <p>{children}</p>
    </div>
  )
}

const MARKUP_HINT =
  'Formatting: **bold**, *italic*, [link text](https://…) — [link text](#storefront-menu) jumps to your menu. Press Enter for a new line.'

const STORE_HINT = ' Type {store} for your store name.'

const ENTRY_MODE_TITLE: Record<EntryMode, string> = { dine_in: 'Dine in', pickup: 'Pickup', delivery: 'Delivery' }

/** The "How to order" block: layout, start-button copy and per-order-type copy. */
function OrderEntryFields({ content, edit }: { content: OrderEntryContent; edit: (patch: Partial<OrderEntryContent>, key?: string) => void }) {
  const setFor = (field: 'labels' | 'blurbs' | 'icons', mode: EntryMode, value: string | undefined) =>
    edit({ [field]: { ...content[field], [mode]: value || undefined } }, `${field}-${mode}`)
  const hasChoices = content.layout !== 'cta'
  return (
    <>
      <Field label="Style">
        <Segmented
          value={content.layout}
          onChange={(layout) => edit({ layout })}
          options={[
            { value: 'tiles', label: 'Tiles' },
            { value: 'list', label: 'List' },
            { value: 'cta', label: 'One button' },
          ]}
        />
      </Field>
      <p className="text-[11px] leading-snug text-neutral-500">
        {hasChoices
          ? 'Customers pick dine-in, pickup or delivery here. Only the order types you offer online are shown.'
          : 'One button that opens your branch list (or your menu). The order type is asked at checkout.'}
      </p>
      <Field label={hasChoices ? 'Button text (shown if no order type is available)' : 'Button text'}>
        <TextInput value={content.ctaLabel} placeholder="Start ordering" maxLength={LIMITS.shortText} onChange={(e) => edit({ ctaLabel: e.target.value }, 'cta')} />
      </Field>
      {!hasChoices && (
        <Field label="Button icon">
          <IconPicker value={content.ctaIcon} onChange={(ctaIcon) => edit({ ctaIcon })} allowNone />
        </Field>
      )}
      {hasChoices && (
        <>
          <Toggle label="Show icons" checked={content.showIcons !== false} onChange={(showIcons) => edit({ showIcons })} />
          <Toggle label="Show short descriptions" checked={content.showBlurbs !== false} onChange={(showBlurbs) => edit({ showBlurbs })} />
          {ENTRY_MODES.map((mode) => (
            <div key={mode} className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{ENTRY_MODE_TITLE[mode]}</p>
              <TextInput aria-label={`${ENTRY_MODE_TITLE[mode]} label`} value={content.labels[mode] ?? ''} placeholder={ENTRY_DEFAULTS[mode].label} maxLength={LIMITS.shortText} onChange={(e) => setFor('labels', mode, e.target.value)} />
              {content.showBlurbs !== false && (
                <TextInput aria-label={`${ENTRY_MODE_TITLE[mode]} description`} value={content.blurbs[mode] ?? ''} placeholder={ENTRY_DEFAULTS[mode].blurb} maxLength={LIMITS.shortText} onChange={(e) => setFor('blurbs', mode, e.target.value)} />
              )}
              {content.showIcons !== false && (
                <IconPicker value={content.icons[mode] ?? ENTRY_DEFAULTS[mode].icon} onChange={(icon) => setFor('icons', mode, icon)} />
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}

function WidgetContentFields({ widget, api }: { widget: Widget; api: HeroBuilderApi }) {
  const c = widget.content
  const edit = (patch: Partial<WidgetContent>, key?: string) => api.editContent(widget.id, patch, key)
  const sectionAnchors = sectionAnchorsOf(api.design.sections)
  const isWelcome = useLinkSurface() === 'welcome'
  const markupHint = isWelcome ? MARKUP_HINT + STORE_HINT : MARKUP_HINT
  const newButtonHref = isWelcome ? '#welcome-start' : '#storefront-menu'

  switch (c.kind) {
    case 'heading':
      return (
        <>
          <Field label="Text" hint={markupHint}>
            <TextArea rows={3} value={c.text} maxLength={LIMITS.textLength} onChange={(e) => edit({ text: e.target.value }, 'text')} />
          </Field>
          <Field label="Heading level" hint="Use one H1 per page — it helps Google understand your store.">
            <Segmented
              value={c.tag}
              onChange={(tag) => edit({ tag })}
              options={[
                { value: 'h1', label: 'H1' },
                { value: 'h2', label: 'H2' },
                { value: 'h3', label: 'H3' },
                { value: 'h4', label: 'H4' },
                { value: 'p', label: 'P' },
              ]}
            />
          </Field>
        </>
      )
    case 'text':
      return (
        <Field label="Text" hint={markupHint}>
          <TextArea rows={6} value={c.text} maxLength={LIMITS.textLength} onChange={(e) => edit({ text: e.target.value }, 'text')} />
        </Field>
      )
    case 'buttons':
      return (
        <ListEditor<ButtonItem>
          items={c.items}
          max={LIMITS.buttonsPerWidget}
          addLabel="Add button"
          onChange={(items) => edit({ items })}
          create={() => ({ id: newId(), label: 'Button', href: newButtonHref, newTab: false, variant: c.items.length ? 'outline' : 'solid' })}
          render={(item, update) => (
            <>
              <TextInput value={item.label} placeholder="Label" maxLength={LIMITS.shortText} onChange={(e) => update({ label: e.target.value })} />
              <LinkPicker
                value={item.href}
                onChange={(href) => update({ href })}
                sectionAnchors={sectionAnchors}
                newTab={item.newTab}
                onNewTabChange={(newTab) => update({ newTab })}
              />
              <Segmented
                value={item.variant}
                onChange={(variant) => update({ variant })}
                options={[
                  { value: 'solid', label: 'Filled' },
                  { value: 'outline', label: 'Outline' },
                  { value: 'ghost', label: 'Text' },
                ]}
              />
              <Field label="Icon">
                <IconPicker value={item.icon} onChange={(icon) => update({ icon })} allowNone />
              </Field>
            </>
          )}
        />
      )
    case 'image':
      return (
        <>
          <ImageField value={c.src} onChange={(src) => edit({ src })} />
          <Field label="Alt text" hint="Describe the photo for screen readers and Google.">
            <TextInput value={c.alt} maxLength={LIMITS.shortText} onChange={(e) => edit({ alt: e.target.value }, 'alt')} />
          </Field>
          <LinkPicker
            value={c.href}
            onChange={(href) => edit({ href }, 'href')}
            sectionAnchors={sectionAnchors}
            allowNone
            newTab={c.newTab}
            onNewTabChange={(newTab) => edit({ newTab })}
          />
        </>
      )
    case 'video':
      return (
        <>
          <Field label="Video link" hint="YouTube, Vimeo or a direct .mp4 link.">
            <TextInput value={c.url} placeholder="https://youtube.com/watch?v=…" onChange={(e) => edit({ url: e.target.value.trim() }, 'url')} />
          </Field>
          <Toggle label="Autoplay (muted)" checked={c.autoplay} onChange={(autoplay) => edit({ autoplay, muted: autoplay || c.muted })} />
          <Toggle label="Loop" checked={c.loop} onChange={(loop) => edit({ loop })} />
          <Toggle label="Show controls" checked={c.controls} onChange={(controls) => edit({ controls })} />
          <Toggle label="Muted" checked={c.muted} onChange={(muted) => edit({ muted })} />
        </>
      )
    case 'icon':
      return (
        <>
          <Field label="Icon">
            <IconPicker value={c.name} onChange={(name) => edit({ name: name ?? 'Star' })} />
          </Field>
          <LinkPicker value={c.href} onChange={(href) => edit({ href }, 'href')} sectionAnchors={sectionAnchors} allowNone />
        </>
      )
    case 'icon-list':
      return (
        <>
          <Field label="Layout">
            <Segmented
              value={c.layout}
              onChange={(layout) => edit({ layout })}
              options={[
                { value: 'vertical', label: 'List' },
                { value: 'inline', label: 'In a row' },
              ]}
            />
          </Field>
          <ListEditor
            items={c.items}
            max={LIMITS.listItems}
            addLabel="Add item"
            onChange={(items) => edit({ items })}
            create={() => ({ id: newId(), icon: 'Check', text: 'New item' })}
            render={(item, update) => (
              <>
                <TextInput value={item.text} maxLength={LIMITS.shortText} onChange={(e) => update({ text: e.target.value })} />
                <IconPicker value={item.icon} onChange={(icon) => update({ icon: icon ?? 'Check' })} />
              </>
            )}
          />
        </>
      )
    case 'badge':
      return (
        <>
          <Field label="Text">
            <TextInput value={c.text} maxLength={LIMITS.shortText} onChange={(e) => edit({ text: e.target.value }, 'text')} />
          </Field>
          <Field label="Icon">
            <IconPicker value={c.icon} onChange={(icon) => edit({ icon })} allowNone />
          </Field>
        </>
      )
    case 'countdown': {
      const local = toLocalInput(c.target)
      return (
        <>
          <Field label="Ends at" hint="Shown in each visitor's own time zone.">
            <TextInput type="datetime-local" value={local} onChange={(e) => e.target.value && edit({ target: new Date(e.target.value).toISOString() })} />
          </Field>
          <Toggle label="Show labels" checked={c.showLabels} onChange={(showLabels) => edit({ showLabels })} />
          <Field label="Message after it ends" hint="Leave blank to keep showing 00:00:00.">
            <TextInput value={c.expiredText} maxLength={LIMITS.shortText} onChange={(e) => edit({ expiredText: e.target.value }, 'exp')} />
          </Field>
        </>
      )
    }
    case 'divider':
      return (
        <Field label="Line style">
          <Segmented
            value={c.lineStyle}
            onChange={(lineStyle) => edit({ lineStyle })}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
        </Field>
      )
    case 'spacer':
      return <p className="text-xs text-neutral-500">Set the height in the Layout tab — it can differ per device.</p>
    case 'gallery':
      return (
        <ListEditor
          items={c.images}
          max={LIMITS.galleryImages}
          addLabel="Add image"
          onChange={(images) => edit({ images })}
          create={() => ({ id: newId(), src: '', alt: '' })}
          render={(img, update) => (
            <>
              <ImageField value={img.src} onChange={(src) => update({ src })} />
              <TextInput value={img.alt} placeholder="Alt text" maxLength={LIMITS.shortText} onChange={(e) => update({ alt: e.target.value })} />
            </>
          )}
        />
      )
    case 'html':
      return (
        <>
          <Field label="HTML & CSS" hint={`${c.html.length.toLocaleString()} / ${LIMITS.htmlLength.toLocaleString()} characters`}>
            <TextArea
              rows={16}
              spellCheck={false}
              value={c.html}
              maxLength={LIMITS.htmlLength}
              onChange={(e) => edit({ html: e.target.value }, 'html')}
              className="font-mono text-[11px]"
            />
          </Field>
          <SafetyNote>
            Rendered inline and styled by your own &lt;style&gt; tags, which only affect this block. Scripts, forms, frames and
            event handlers are removed. Need JavaScript? Use an <strong>Embed code</strong> element instead.
          </SafetyNote>
        </>
      )
    case 'embed':
      return (
        <>
          <Field label="Embed code" hint="Paste code from Google Maps, Calendly, Facebook, TikTok, a booking or form tool…">
            <TextArea
              rows={12}
              spellCheck={false}
              value={c.code}
              maxLength={LIMITS.embedLength}
              placeholder={'<iframe src="https://…"></iframe>'}
              onChange={(e) => edit({ code: e.target.value }, 'code')}
              className="font-mono text-[11px]"
            />
          </Field>
          <Toggle label="Grow to fit content" checked={c.autoHeight} onChange={(autoHeight) => edit({ autoHeight })} />
          <Field label={c.autoHeight ? 'Starting height' : 'Height'}>
            <TextInput type="number" min={40} max={LIMITS.embedMaxHeight} value={c.height} onChange={(e) => edit({ height: Math.min(LIMITS.embedMaxHeight, Math.max(40, Number(e.target.value) || 40)) }, 'h')} />
          </Field>
          <SafetyNote>
            Runs in a locked sandbox: scripts work, but they can&apos;t read your store, your customers&apos; data or checkout,
            and can&apos;t redirect the page.
          </SafetyNote>
        </>
      )
    case 'order-entry':
      return <OrderEntryFields content={c} edit={edit} />
    case 'store-logo':
      return (
        <>
          <p className="text-xs leading-relaxed text-neutral-500">
            Shows the logo from your Branding Studio, so it stays right when you change it there. Set its height in the Layout tab.
          </p>
          <Field label="If you have no logo">
            <Segmented
              value={c.fallback}
              onChange={(fallback) => edit({ fallback })}
              options={[
                { value: 'name', label: 'Show store name' },
                { value: 'none', label: 'Show nothing' },
              ]}
            />
          </Field>
        </>
      )
    case 'slideshow':
      return (
        <>
          <Toggle label="Play automatically" checked={c.autoplay} onChange={(autoplay) => edit({ autoplay })} />
          {c.autoplay && (
            <Field label="Seconds per slide">
              <TextInput
                type="number"
                min={SLIDE_INTERVAL.min}
                max={SLIDE_INTERVAL.max}
                value={c.interval}
                onChange={(e) => edit({ interval: Math.min(SLIDE_INTERVAL.max, Math.max(SLIDE_INTERVAL.min, Number(e.target.value) || SLIDE_INTERVAL.fallback)) }, 'interval')}
              />
            </Field>
          )}
          <Toggle label="Show dots" checked={c.showDots} onChange={(showDots) => edit({ showDots })} />
          <ListEditor<Slide>
            items={c.slides}
            max={LIMITS.slides}
            addLabel="Add slide"
            onChange={(slides) => edit({ slides })}
            create={() => ({ id: newId(), src: '', alt: '' })}
            render={(slide, update) => (
              <>
                <ImageField value={slide.src} onChange={(src) => update({ src })} />
                <TextInput value={slide.title ?? ''} placeholder="Title (optional)" maxLength={LIMITS.shortText} onChange={(e) => update({ title: e.target.value || undefined })} />
                <TextInput value={slide.caption ?? ''} placeholder="Caption (optional)" maxLength={LIMITS.shortText} onChange={(e) => update({ caption: e.target.value || undefined })} />
                <TextInput value={slide.alt} placeholder="Alt text" maxLength={LIMITS.shortText} onChange={(e) => update({ alt: e.target.value })} />
                <LinkPicker value={slide.href} onChange={(href) => update({ href: href || undefined })} sectionAnchors={sectionAnchors} allowNone />
              </>
            )}
          />
        </>
      )
    default:
      return null
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ColumnLayoutPicker({ section, api }: { section: Section; api: HeroBuilderApi }) {
  const current = section.columns.map((c) => Math.round(c.style.width ?? 0)).join('-')
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {COLUMN_LAYOUTS.map((layout) => {
        const isActive = layout.widths.map((w) => Math.round(w)).join('-') === current
        return (
          <button
            key={layout.id}
            type="button"
            title={layout.label}
            onClick={() => api.setColumns(section.id, layout.widths)}
            className={cn('flex h-9 gap-0.5 rounded-md border p-1.5 transition', isActive ? 'border-sky-500 bg-sky-50' : 'border-neutral-200 hover:border-neutral-400')}
          >
            {layout.widths.map((w, i) => (
              <span key={i} className={cn('h-full rounded-sm', isActive ? 'bg-sky-400' : 'bg-neutral-300')} style={{ flex: w }} />
            ))}
          </button>
        )
      })}
    </div>
  )
}

interface ContentPanelProps {
  api: HeroBuilderApi
  node: Section | Widget | null
  nodeKind: 'section' | 'column' | 'widget'
}

export function ContentPanel({ api, node, nodeKind }: ContentPanelProps) {
  if (!node) return null
  if (nodeKind === 'widget') {
    return (
      <Group title="Content">
        <WidgetContentFields widget={node as Widget} api={api} />
      </Group>
    )
  }
  if (nodeKind === 'section') {
    const section = node as Section
    return (
      <Group title="Section">
        <Field label="Name" hint="Only you see this, in the Layers list.">
          <TextInput value={section.label} maxLength={80} onChange={(e) => api.editSectionMeta(section.id, { label: e.target.value }, 'label')} />
        </Field>
        <Field label="Columns" hint="Removing columns moves their elements into the last one.">
          <ColumnLayoutPicker section={section} api={api} />
        </Field>
        <Field label="Anchor link" hint={section.anchor ? 'Buttons can link here: Link to → A section of this hero.' : 'Give it a name so buttons can scroll here.'}>
          <TextInput
            value={section.anchor ?? ''}
            placeholder="e.g. promo"
            onChange={(e) => api.editSectionMeta(section.id, { anchor: safeAnchor(e.target.value) ?? '' }, 'anchor')}
          />
        </Field>
      </Group>
    )
  }
  return (
    <Group title="Column">
      <p className="text-xs leading-relaxed text-neutral-500">
        Columns hold elements. Set width, alignment and spacing in the Layout tab, and colors in Style.
      </p>
      <SelectField
        value=""
        placeholder="Quick actions…"
        onChange={(action) => {
          if (action === 'duplicate') api.duplicate(node.id)
          if (action === 'delete') api.remove(node.id)
        }}
        options={[
          { value: 'duplicate', label: 'Duplicate column' },
          { value: 'delete', label: 'Delete column' },
        ]}
      />
    </Group>
  )
}
