'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import {
  APP_BLOCK_AUDIENCES,
  APP_QUICK_ACTIONS,
  type AppBanner,
  type AppBannerAction,
  type AppCatalog,
  type AppConfig,
  type AppHomeBlock,
  type AppHomeBlockType,
} from '@/lib/app-contract'
import { BLOCK_LABELS, moveBlock, newBlock, type AppStudioDraft } from '@/lib/app-studio/home-draft'
import { cn } from '@/lib/utils'
import { BUTTON_QUIET, Counter, Field, FIELD, ImageField } from './studio-ui'

const AUDIENCE_LABEL: Record<(typeof APP_BLOCK_AUDIENCES)[number], string> = { always: 'Everyone', guest: 'Signed-out guests', member: 'Signed-in members' }
const ACTION_LABEL: Record<(typeof APP_QUICK_ACTIONS)[number], string> = { pickup: 'Pick up', delivery: 'Delivery', dineIn: 'Dine in', menu: 'Menu', rewards: 'Rewards', scan: 'Scan' }
const MAX_BLOCKS = 20
const MAX_BANNERS = 10

interface HomeTabProps {
  tenantId: string
  draft: AppStudioDraft
  onChange: (draft: AppStudioDraft) => void
  base: AppConfig
  catalog: Pick<AppCatalog, 'categories' | 'items'>
  canEdit: boolean
  selectedBlockId: string | null
  onSelectBlock: (id: string | null) => void
}

export function HomeTab({ tenantId, draft, onChange, base, catalog, canEdit, selectedBlockId, onSelectBlock }: HomeTabProps) {
  const blocks = draft.home?.blocks ?? base.home.blocks
  const copy = { ...base.copy, ...draft.copy }
  const setBlocks = (next: AppHomeBlock[]) => onChange({ ...draft, home: { blocks: next } })
  const selected = blocks.find((block) => block.id === selectedBlockId) ?? null
  const updateBlock = (next: AppHomeBlock) => setBlocks(blocks.map((block) => (block.id === next.id ? next : block)))

  const add = (type: AppHomeBlockType) => {
    const block = newBlock(type, blocks)
    setBlocks([...blocks, block])
    onSelectBlock(block.id)
  }

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeader title="Home blocks" subtitle="Top to bottom, as the app shows them. Pick one to edit it; the preview outlines it." />
        <ol className="mt-4 space-y-1.5">
          {blocks.map((block, index) => (
            <li key={block.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                  selectedBlockId === block.id ? 'border-sky-400/60 bg-sky-400/[0.06]' : 'border-white/10 hover:bg-white/[0.03]',
                )}
              >
                <button type="button" className="min-w-0 flex-1 text-left text-white" onClick={() => onSelectBlock(selectedBlockId === block.id ? null : block.id)}>
                  <span className="font-medium">{BLOCK_LABELS[block.type]}</span>
                  <span className="ml-2 text-xs text-white/40">{AUDIENCE_LABEL[block.visibleWhen]}</span>
                </button>
                {canEdit ? (
                  <>
                    <IconButton label="Move up" onClick={() => setBlocks(moveBlock(blocks, index, -1))} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Move down" onClick={() => setBlocks(moveBlock(blocks, index, 1))} disabled={index === blocks.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${BLOCK_LABELS[block.type]}`}
                      onClick={() => {
                        setBlocks(blocks.filter((candidate) => candidate.id !== block.id))
                        if (selectedBlockId === block.id) onSelectBlock(null)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </>
                ) : null}
              </div>
              {selected && selected.id === block.id ? (
                <div className="mt-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <BlockForm block={selected} onChange={updateBlock} catalog={catalog} canEdit={canEdit} tenantId={tenantId} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {canEdit && blocks.length < MAX_BLOCKS ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/50">Add:</span>
            {(Object.keys(BLOCK_LABELS) as AppHomeBlockType[]).map((type) => (
              <button key={type} type="button" className={cn(BUTTON_QUIET, 'px-3 py-1.5 text-xs')} onClick={() => add(type)}>
                <Plus className="h-3.5 w-3.5" /> {BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeader title="Wording" subtitle="The greeting on top of Home, and the invitation guests see." />
        <div className="mt-4 space-y-4">
          <TextField label="Greeting" value={copy.greeting} max={40} disabled={!canEdit} onChange={(greeting) => onChange({ ...draft, copy: { ...draft.copy, greeting } })} hint="Members see “, Ana” after it." />
          <TextField label="Guest invitation title" value={copy.guestJoinTitle} max={60} disabled={!canEdit} onChange={(guestJoinTitle) => onChange({ ...draft, copy: { ...draft.copy, guestJoinTitle } })} />
          <TextField label="Guest invitation text" value={copy.guestJoinBody} max={160} disabled={!canEdit} onChange={(guestJoinBody) => onChange({ ...draft, copy: { ...draft.copy, guestJoinBody } })} />
        </div>
      </Panel>
    </div>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-lg p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-25">
      {children}
    </button>
  )
}

function TextField({ label, value, max, onChange, disabled, hint }: { label: string; value: string; max: number; onChange: (value: string) => void; disabled?: boolean; hint?: string }) {
  const id = `field-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <input id={id} className={cn(FIELD, 'pr-16')} value={value} maxLength={max} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        <span className="absolute right-3 top-2.5">
          <Counter value={value} max={max} />
        </span>
      </div>
    </Field>
  )
}

interface BlockFormProps {
  block: AppHomeBlock
  onChange: (block: AppHomeBlock) => void
  catalog: Pick<AppCatalog, 'categories' | 'items'>
  canEdit: boolean
  tenantId: string
}

function BlockForm({ block, onChange, catalog, canEdit, tenantId }: BlockFormProps) {
  const audience = (
    <Field label="Who sees it" htmlFor={`${block.id}-audience`}>
      <select id={`${block.id}-audience`} className={FIELD} value={block.visibleWhen} disabled={!canEdit} onChange={(event) => onChange({ ...block, visibleWhen: event.target.value as AppHomeBlock['visibleWhen'] })}>
        {APP_BLOCK_AUDIENCES.map((value) => (
          <option key={value} value={value}>
            {AUDIENCE_LABEL[value]}
          </option>
        ))}
      </select>
    </Field>
  )

  switch (block.type) {
    case 'memberCard':
      return (
        <div className="space-y-3">
          <p className="text-xs text-white/50">Members see their stamps; guests see the invitation from Wording below.</p>
          {audience}
        </div>
      )
    case 'orderAgain':
    case 'categoriesRail':
      return (
        <div className="space-y-3">
          <TextField label="Title" value={block.title} max={60} disabled={!canEdit} onChange={(title) => onChange({ ...block, title })} />
          {audience}
        </div>
      )
    case 'rewardsTeaser':
      return (
        <div className="space-y-3">
          <TextField label="Title" value={block.title} max={60} disabled={!canEdit} onChange={(title) => onChange({ ...block, title })} />
          <TextField label="Text" value={block.body} max={200} disabled={!canEdit} onChange={(body) => onChange({ ...block, body })} />
          {audience}
        </div>
      )
    case 'announcement':
      return (
        <div className="space-y-3">
          <TextField label="Announcement" value={block.text} max={160} disabled={!canEdit} onChange={(text) => onChange({ ...block, text })} />
          <Field label="Tone" htmlFor={`${block.id}-tone`}>
            <select id={`${block.id}-tone`} className={FIELD} value={block.tone} disabled={!canEdit} onChange={(event) => onChange({ ...block, tone: event.target.value as typeof block.tone })}>
              <option value="info">Information</option>
              <option value="promo">Promotion</option>
              <option value="warning">Heads-up</option>
            </select>
          </Field>
          {audience}
        </div>
      )
    case 'quickActions':
      return (
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-white/60">Buttons (1 to 4)</legend>
            <div className="flex flex-wrap gap-2">
              {APP_QUICK_ACTIONS.map((action) => {
                const isOn = block.actions.includes(action)
                const isBlocked = !isOn && block.actions.length >= 4
                return (
                  <label key={action} className={cn('flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-white', isBlocked && 'opacity-40')}>
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={!canEdit || isBlocked || (isOn && block.actions.length === 1)}
                      onChange={() => onChange({ ...block, actions: isOn ? block.actions.filter((value) => value !== action) : APP_QUICK_ACTIONS.filter((value) => value === action || block.actions.includes(value)) })}
                    />
                    {ACTION_LABEL[action]}
                  </label>
                )
              })}
            </div>
          </fieldset>
          {audience}
        </div>
      )
    case 'featuredItems':
      return (
        <div className="space-y-3">
          <TextField label="Title" value={block.title} max={60} disabled={!canEdit} onChange={(title) => onChange({ ...block, title })} />
          <Field label="Which dishes" htmlFor={`${block.id}-source`}>
            <select id={`${block.id}-source`} className={FIELD} value={block.source} disabled={!canEdit} onChange={(event) => onChange({ ...block, source: event.target.value as typeof block.source })}>
              <option value="featured">The menu’s featured dishes (★ in the menu editor)</option>
              <option value="manual">Dishes I pick, in my order</option>
            </select>
          </Field>
          {block.source === 'manual' ? (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
              {catalog.items.map((item) => {
                const position = block.itemIds.indexOf(item.id)
                const isOn = position >= 0
                return (
                  <label key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-white hover:bg-white/[0.03]">
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={!canEdit || (!isOn && block.itemIds.length >= 20)}
                      onChange={() => onChange({ ...block, itemIds: isOn ? block.itemIds.filter((id) => id !== item.id) : [...block.itemIds, item.id] })}
                    />
                    <span className="flex-1 truncate">{item.name}</span>
                    {isOn ? <span className="text-xs text-white/40">#{position + 1}</span> : null}
                  </label>
                )
              })}
            </div>
          ) : null}
          {audience}
        </div>
      )
    case 'bannerCarousel':
      return <BannersForm block={block} onChange={onChange} catalog={catalog} canEdit={canEdit} tenantId={tenantId} audience={audience} />
  }
}

function BannersForm({
  block,
  onChange,
  catalog,
  canEdit,
  tenantId,
  audience,
}: BlockFormProps & { block: Extract<AppHomeBlock, { type: 'bannerCarousel' }>; audience: React.ReactNode }) {
  const setBanners = (banners: AppBanner[]) => onChange({ ...block, banners })
  const updateBanner = (index: number, next: AppBanner) => setBanners(block.banners.map((banner, at) => (at === index ? next : banner)))
  const shape = block.format === 'landscape' ? 'wide' : 'tall'
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shape" htmlFor={`${block.id}-format`}>
          <select id={`${block.id}-format`} className={FIELD} value={block.format} disabled={!canEdit} onChange={(event) => onChange({ ...block, format: event.target.value as typeof block.format })}>
            <option value="landscape">Wide (16:9)</option>
            <option value="square">Square</option>
            <option value="portrait">Tall (4:5)</option>
          </select>
        </Field>
        <label className="mt-6 flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={block.autoplay} disabled={!canEdit} onChange={(event) => onChange({ ...block, autoplay: event.target.checked })} />
          Slide by itself
        </label>
      </div>
      {block.banners.map((banner, index) => (
        <div key={banner.id} className="space-y-3 rounded-xl border border-white/10 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-white/60">Banner {index + 1}</p>
            {canEdit ? (
              <IconButton label={`Remove banner ${index + 1}`} onClick={() => setBanners(block.banners.filter((_, at) => at !== index))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            ) : null}
          </div>
          <ImageField
            label="Picture"
            hint="PNG or JPG in the shape above."
            value={banner.imageUrl}
            onChange={(url) => url && updateBanner(index, { ...banner, imageUrl: url })}
            folder={`customer-apps/${tenantId}`}
            disabled={!canEdit}
            shape={shape}
            isRemovable={false}
          />
          <TextField label="Title (optional)" value={banner.title ?? ''} max={80} disabled={!canEdit} onChange={(title) => updateBanner(index, { ...banner, title: title || undefined })} />
          <ActionPicker action={banner.action ?? { type: 'none' }} onChange={(action) => updateBanner(index, { ...banner, action })} catalog={catalog} canEdit={canEdit} id={banner.id} />
        </div>
      ))}
      {canEdit && block.banners.length < MAX_BANNERS ? (
        <NewBannerUpload tenantId={tenantId} shape={shape} onAdd={(imageUrl) => setBanners([...block.banners, { id: `banner-${Date.now().toString(36)}`, imageUrl, action: { type: 'none' } }])} />
      ) : null}
      {audience}
    </div>
  )
}

/** A banner exists only with a picture (the app needs one), so adding starts with the upload. */
function NewBannerUpload({ tenantId, shape, onAdd }: { tenantId: string; shape: 'wide' | 'tall'; onAdd: (url: string) => void }) {
  return (
    <ImageField
      label="Add a banner"
      hint="Upload its picture; then set where a tap goes."
      value={null}
      onChange={(url) => url && onAdd(url)}
      folder={`customer-apps/${tenantId}`}
      shape={shape}
    />
  )
}

function ActionPicker({ action, onChange, catalog, canEdit, id }: { action: AppBannerAction; onChange: (action: AppBannerAction) => void; catalog: BlockFormProps['catalog']; canEdit: boolean; id: string }) {
  const firstItem = catalog.items[0]?.id
  const firstCategory = catalog.categories[0]?.id
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="A tap opens" htmlFor={`${id}-action`}>
        <select
          id={`${id}-action`}
          className={FIELD}
          value={action.type}
          disabled={!canEdit}
          onChange={(event) => {
            const type = event.target.value as AppBannerAction['type']
            if (type === 'item' && firstItem) onChange({ type, itemId: firstItem })
            else if (type === 'category' && firstCategory) onChange({ type, categoryId: firstCategory })
            else if (type === 'url') onChange({ type, url: 'https://' })
            else if (type === 'none' || type === 'rewards') onChange({ type })
          }}
        >
          <option value="none">Nothing</option>
          <option value="item" disabled={!firstItem}>
            A dish
          </option>
          <option value="category" disabled={!firstCategory}>
            A menu category
          </option>
          <option value="rewards">Rewards</option>
          <option value="url">A web link</option>
        </select>
      </Field>
      {action.type === 'item' ? (
        <Field label="Dish" htmlFor={`${id}-item`}>
          <select id={`${id}-item`} className={FIELD} value={action.itemId} disabled={!canEdit} onChange={(event) => onChange({ type: 'item', itemId: event.target.value })}>
            {catalog.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {action.type === 'category' ? (
        <Field label="Category" htmlFor={`${id}-category`}>
          <select id={`${id}-category`} className={FIELD} value={action.categoryId} disabled={!canEdit} onChange={(event) => onChange({ type: 'category', categoryId: event.target.value })}>
            {catalog.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {action.type === 'url' ? (
        <Field label="Link" htmlFor={`${id}-url`} hint="https only.">
          <input id={`${id}-url`} className={FIELD} value={action.url} disabled={!canEdit} onChange={(event) => onChange({ type: 'url', url: event.target.value })} />
        </Field>
      ) : null}
    </div>
  )
}
