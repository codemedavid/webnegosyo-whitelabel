'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { MESSENGER_LIMITS } from '@/lib/messenger/limits'
import { DEFAULT_WORDING, PLACEHOLDERS } from '@/lib/messenger/replies'
import { ACTION_KIND_ORDER, ACTION_LABELS, defaultAction } from '@/lib/messenger/rule-labels'
import { MAX_FEATURED_ITEMS, MAX_REPLY_TEXT, type ActionKind, type RuleAction, type TextButton } from '@/lib/messenger/rules'
import type { ReplyStore } from '@/lib/messenger/store-view'
import { FIELD_CLASS } from './field-styles'

interface ActionFieldsProps {
  action: RuleAction
  store: ReplyStore
  onChange: (action: RuleAction) => void
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className="text-xs tabular-nums text-muted-foreground">{Array.from(value).length}/{max}</span>
}

function WordingField({ id, label, value, placeholder, max, multiline, onChange }: {
  id: string; label: string; value: string | undefined; placeholder: string; max: number; multiline?: boolean; onChange: (value: string) => void
}) {
  const current = value ?? ''
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Counter value={current} max={max} />
      </div>
      {multiline ? (
        <Textarea id={id} value={current} maxLength={max} rows={3} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input id={id} value={current} maxLength={max} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}

const PLACEHOLDER_HELP = `You can use ${PLACEHOLDERS.map((key) => `{${key}}`).join(', ')}.`

function TextButtons({ buttons, onChange }: { buttons: readonly TextButton[]; onChange: (buttons: TextButton[]) => void }) {
  const update = (index: number, next: TextButton) => onChange(buttons.map((entry, position) => (position === index ? next : entry)))
  return (
    <div className="space-y-2">
      <Label>Buttons (up to 3)</Label>
      {buttons.map((button, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="flex gap-2">
            <select
              aria-label="Button does"
              className={FIELD_CLASS}
              value={button.kind}
              onChange={(event) => {
                const kind = event.target.value as TextButton['kind']
                update(index, kind === 'link' ? { kind, label: button.label, url: 'https://' } : { kind, label: button.label })
              }}
            >
              <option value="menu">Opens your menu</option>
              <option value="categories">Shows your categories</option>
              <option value="staff">Talk to staff</option>
              <option value="link">Opens a link</option>
            </select>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove button" onClick={() => onChange(buttons.filter((_, position) => position !== index))}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <Input aria-label="Button label" value={button.label} maxLength={MESSENGER_LIMITS.buttonTitle} placeholder="Label" onChange={(event) => update(index, { ...button, label: event.target.value })} />
          {button.kind === 'link' ? (
            <Input aria-label="Link" type="url" value={button.url} maxLength={500} placeholder="https://" onChange={(event) => update(index, { ...button, url: event.target.value })} />
          ) : null}
        </div>
      ))}
      {buttons.length < MESSENGER_LIMITS.cardButtons ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...buttons, { kind: 'menu', label: 'View menu' }])}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Add a button
        </Button>
      ) : null}
    </div>
  )
}

function FeaturedPicker({ store, itemIds, onChange }: { store: ReplyStore; itemIds: readonly string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return store.items.filter((item) => !needle || item.name.toLowerCase().includes(needle)).slice(0, 50)
  }, [query, store.items])
  const chosen = new Set(itemIds)
  return (
    <div className="space-y-2">
      <Label htmlFor="featured-search">Dishes ({itemIds.length}/{MAX_FEATURED_ITEMS})</Label>
      <p className="text-xs text-muted-foreground">None chosen = your featured dishes, or the first on your menu.</p>
      <Input id="featured-search" value={query} placeholder="Search your menu" onChange={(event) => setQuery(event.target.value)} />
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
        {matches.map((item) => {
          const isChosen = chosen.has(item.id)
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  checked={isChosen}
                  disabled={!isChosen && itemIds.length >= MAX_FEATURED_ITEMS}
                  onChange={() => onChange(isChosen ? itemIds.filter((id) => id !== item.id) : [...itemIds, item.id])}
                />
                <span className="truncate">{item.name}</span>
              </label>
            </li>
          )
        })}
        {matches.length === 0 ? <li className="px-2 py-1.5 text-sm text-muted-foreground">No dishes match.</li> : null}
      </ul>
    </div>
  )
}

export function ActionFields({ action, store, onChange }: ActionFieldsProps) {
  const firstCategory = store.categories[0]?.id ?? null
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Reply with</legend>
      <select
        aria-label="Reply with"
        className={FIELD_CLASS}
        value={action.kind}
        onChange={(event) => onChange(defaultAction(event.target.value as ActionKind, firstCategory))}
      >
        {ACTION_KIND_ORDER.map((kind) => <option key={kind} value={kind}>{ACTION_LABELS[kind].title}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">{ACTION_LABELS[action.kind].help}</p>

      {action.kind === 'menu_card' ? (
        <>
          <WordingField id="card-title" label="Title" value={action.title} placeholder={`📍 ${store.name}`} max={MESSENGER_LIMITS.cardTitle} onChange={(title) => onChange({ ...action, title })} />
          <WordingField id="card-subtitle" label="Subtitle" value={action.subtitle} placeholder={DEFAULT_WORDING.menuCardSubtitle} max={MESSENGER_LIMITS.cardSubtitle} onChange={(subtitle) => onChange({ ...action, subtitle })} />
          <WordingField id="card-button" label="Button" value={action.buttonLabel} placeholder={DEFAULT_WORDING.menuCardButton} max={MESSENGER_LIMITS.buttonTitle} onChange={(buttonLabel) => onChange({ ...action, buttonLabel })} />
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>Add a “Categories” button</span>
            <Switch checked={action.showCategoriesButton !== false} onCheckedChange={(checked) => onChange({ ...action, showCategoriesButton: checked })} />
          </label>
        </>
      ) : null}

      {action.kind === 'category_items' ? (
        <div className="space-y-1.5">
          <Label htmlFor="action-category">Category</Label>
          <select id="action-category" className={FIELD_CLASS} value={action.categoryId} onChange={(event) => onChange({ ...action, categoryId: event.target.value })}>
            {store.categories.length === 0 ? <option value="">No categories with dishes yet</option> : null}
            {store.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
      ) : null}

      {action.kind === 'featured_items' ? <FeaturedPicker store={store} itemIds={action.itemIds} onChange={(itemIds) => onChange({ ...action, itemIds })} /> : null}

      {action.kind === 'text' ? (
        <>
          <WordingField id="action-text" label="Message" value={action.text} placeholder={`Hi! Thanks for messaging {store} 👋`} max={MAX_REPLY_TEXT} multiline onChange={(text) => onChange({ ...action, text })} />
          <p className="text-xs text-muted-foreground">{PLACEHOLDER_HELP}</p>
          <TextButtons buttons={action.buttons} onChange={(buttons) => onChange({ ...action, buttons })} />
        </>
      ) : null}

      {action.kind !== 'menu_card' && action.kind !== 'text' ? (
        <>
          <WordingField
            id="action-wording"
            label="Message (optional)"
            value={action.text}
            placeholder={placeholderFor(action.kind)}
            max={MAX_REPLY_TEXT}
            multiline
            onChange={(text) => onChange({ ...action, text } as RuleAction)}
          />
          <p className="text-xs text-muted-foreground">Blank uses the wording shown. {PLACEHOLDER_HELP}</p>
        </>
      ) : null}
    </fieldset>
  )
}

function placeholderFor(kind: ActionKind): string {
  switch (kind) {
    case 'categories': return DEFAULT_WORDING.categoriesText
    case 'featured_items': return DEFAULT_WORDING.featuredText
    case 'hours_location': return DEFAULT_WORDING.hoursLocation
    case 'talk_to_staff': return DEFAULT_WORDING.talkToStaff
    case 'order_status': return DEFAULT_WORDING.orderStatus
    default: return ''
  }
}
