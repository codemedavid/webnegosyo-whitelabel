'use client'

/**
 * Receipt Studio — the tenant admin's visual thermal-receipt editor.
 *
 * Full-screen studio in the Branding Studio design language: a top bar with
 * Discard / Publish, a settings panel (template, whole-receipt settings, the
 * drag-to-arrange block stack with an inspector per block), and a live paper
 * preview rendered by the exact engine the merchant app prints with. Lines on
 * the paper are clickable and select their block. Below `lg` the two panes
 * become an Edit / Preview switch.
 *
 * Blocks live in src/lib/receipt-layout.ts; state in use-receipt-studio.ts.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Check, Plus } from 'lucide-react'
import {
  RECEIPT_THEMES,
  renderReceiptBlocks,
  type ReceiptBlockKind,
  type ReceiptTheme,
} from '@/lib/receipt-layout'
import { AddBlockPanel } from './add-block-panel'
import { BlockRow, blockLabel } from './block-row'
import { PaperPreview, type PreviewBlock } from './paper-preview'
import { RECEIPT_TEMPLATES } from './receipt-templates'
import { SAMPLE_ORDER, SAMPLE_TRACKING_URL } from './sample-order'
import { useReceiptStudio, type ReceiptStudio } from './use-receipt-studio'

interface ReceiptEditorProps {
  tenantId: string
  tenantSlug: string
  storeName: string
  /** The tenant's logo URL — the `logo` block previews and prints with it. */
  logoUrl: string | null
  initialLayout: unknown
}

/** Text columns per paper roll, as the app prints them (font A). */
const PAPER_WIDTHS = [
  { mm: 58, columns: 32 },
  { mm: 80, columns: 48 },
] as const

type PaperWidth = (typeof PAPER_WIDTHS)[number]

const THEME_LABELS: Record<ReceiptTheme, { label: string; description: string }> = {
  modern: { label: 'Modern', description: 'Big, bold, centered details' },
  classic: { label: 'Classic', description: 'Flat "Label: value" rows' },
}

const sectionTitle = 'text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]'

function emptyHint(kind: ReceiptBlockKind, hasLogo: boolean): string {
  if (kind === 'logo') return hasLogo ? 'prints your logo' : 'no logo uploaded yet'
  if (kind === 'storeAddress') return 'prints only when an address is set'
  return 'nothing to print on this sample sale'
}

function selectableCard(isActive: boolean): string {
  return `rounded-[10px] border px-3 py-2 text-left transition-colors ${
    isActive
      ? 'border-[#1D1815] bg-[#1D1815] text-white'
      : 'border-[#E5E0D6] bg-white hover:border-[#1D1815]'
  }`
}

function TemplateSection({ studio }: { studio: ReceiptStudio }) {
  const { mode, baseTemplate } = studio.draft
  const base = RECEIPT_TEMPLATES.find((t) => t.name === baseTemplate)
  const status =
    mode !== 'custom'
      ? `Using the ${base?.label} template. Change any block and it becomes your own design.`
      : base
        ? `Your own design, started from ${base.label}.`
        : 'Your own design.'

  return (
    <section className="border-b border-[#E5E0D6] px-[18px] py-4">
      <h2 className={`${sectionTitle} mb-2.5`}>Start from a template</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {RECEIPT_TEMPLATES.map((template) => {
          const isActive = mode === template.name
          return (
            <button
              key={template.name}
              type="button"
              aria-pressed={isActive}
              onClick={() => studio.selectTemplate(template.name)}
              className={selectableCard(isActive)}
            >
              <div className="text-[12.5px] font-bold">{template.label}</div>
              <div className={`mt-px text-[11px] leading-snug ${isActive ? 'text-white/70' : 'text-[#8B857B]'}`}>
                {template.description}
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug text-[#8B857B]">{status}</p>
    </section>
  )
}

function WholeReceiptSection({ studio }: { studio: ReceiptStudio }) {
  const { theme, isBold } = studio.draft
  return (
    <section className="border-b border-[#E5E0D6] px-[18px] py-4">
      <h2 className={`${sectionTitle} mb-2.5`}>Whole receipt</h2>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Receipt style">
        {RECEIPT_THEMES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={theme === option}
            onClick={() => studio.setTheme(option)}
            className={selectableCard(theme === option)}
          >
            <div className="text-[12.5px] font-bold">{THEME_LABELS[option].label}</div>
            <div className={`mt-px text-[11px] ${theme === option ? 'text-white/70' : 'text-[#8B857B]'}`}>
              {THEME_LABELS[option].description}
            </div>
          </button>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#E5E0D6] px-3 py-2.5 hover:border-[#CFC8BA]">
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-bold">Bold everything</span>
          <span className="block text-[11px] leading-snug text-[#8B857B]">
            Darker print — helps on faint or older printers
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={isBold}
          onChange={(e) => studio.setBold(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-5 w-9 flex-shrink-0 rounded-full bg-[#D8D2C6] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-[#1D1815] peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400"
        />
      </label>
    </section>
  )
}

interface BlocksSectionProps {
  studio: ReceiptStudio
  columns: number
  hasLogo: boolean
  silentIds: ReadonlySet<string>
}

function BlocksSection({ studio, columns, hasLogo, silentIds }: BlocksSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const { drafts, theme } = studio.draft
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const selected = drafts.find((d) => d.id === studio.selectedId)
  const placement = selected ? `below ${blockLabel(selected.block.kind)}` : 'at the bottom'

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = drafts.findIndex((d) => d.id === active.id)
    const to = drafts.findIndex((d) => d.id === over.id)
    if (from >= 0 && to >= 0) studio.reorder(arrayMove(drafts, from, to))
  }

  const handleAdd = (kind: ReceiptBlockKind) => {
    studio.insertBlock(kind)
    setIsAdding(false)
  }

  return (
    <section className="px-[18px] py-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className={sectionTitle}>Blocks</h2>
        <span className="text-[11px] text-[#8B857B]">{drafts.length} on the receipt</span>
      </div>
      <p className="mb-2.5 text-[11.5px] leading-snug text-[#8B857B]">
        Click a block, or any line on the paper, to change its size, bold and alignment. Drag to reorder.
      </p>

      {drafts.length === 0 && (
        <div className="mb-1.5 rounded-[10px] border border-dashed border-[#D8D2C6] px-3 py-4 text-center text-[12px] text-[#8B857B]">
          Empty receipt — add your first block.
        </div>
      )}

      {/* A fixed id: dnd-kit's generated one differs between server and client. */}
      <DndContext
        id="receipt-blocks"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={drafts.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {drafts.map((draft, index) => (
              <BlockRow
                key={draft.id}
                draft={draft}
                theme={theme}
                columns={columns}
                isSelected={draft.id === studio.selectedId}
                isFirst={index === 0}
                isLast={index === drafts.length - 1}
                isSilent={silentIds.has(draft.id)}
                hasLogo={hasLogo}
                onSelect={() => studio.select(draft.id === studio.selectedId ? null : draft.id)}
                onChange={(block) => studio.updateBlock(draft.id, block)}
                onRemove={() => studio.removeBlock(draft.id)}
                onDuplicate={() => studio.duplicate(draft.id)}
                onMove={(offset) => studio.move(draft.id, offset)}
                onSplit={() => studio.splitOrderMeta(draft.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-2.5">
        {isAdding ? (
          <AddBlockPanel placement={placement} onAdd={handleAdd} onClose={() => setIsAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#CFC8BA] py-2.5 text-[12.5px] font-bold text-[#1D1815] transition-colors hover:border-[#1D1815] hover:bg-[#FAF8F4]"
          >
            <Plus className="h-4 w-4" />
            Add a block {selected ? `below ${blockLabel(selected.block.kind)}` : ''}
          </button>
        )}
      </div>
    </section>
  )
}

function PublishStatus({ studio }: { studio: ReceiptStudio }) {
  if (studio.hasJustPublished) {
    return (
      <span className="flex items-center gap-1 text-[12px] font-bold text-emerald-700">
        <Check className="h-3.5 w-3.5" /> Published to your printers
      </span>
    )
  }
  if (studio.isDirty) {
    return <span className="hidden text-[12px] font-semibold text-amber-700 sm:inline">Unpublished changes</span>
  }
  return <span className="hidden text-[12px] font-semibold text-[#8B857B] sm:inline">All changes published</span>
}

export function ReceiptEditor({ tenantId, tenantSlug, storeName, logoUrl, initialLayout }: ReceiptEditorProps) {
  const studio = useReceiptStudio(tenantId, initialLayout)
  const [paper, setPaper] = useState<PaperWidth>(PAPER_WIDTHS[0])
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')

  const previewBlocks: PreviewBlock[] = useMemo(() => {
    const rendered = renderReceiptBlocks(
      SAMPLE_ORDER,
      {
        storeName,
        width: paper.columns,
        trackingUrl: SAMPLE_TRACKING_URL,
        ...(logoUrl ? { logoUrl } : {}),
      },
      studio.layout,
    )
    return studio.draft.drafts.map((draft, index) => ({
      id: draft.id,
      label: blockLabel(draft.block.kind),
      emptyHint: emptyHint(draft.block.kind, Boolean(logoUrl)),
      segments: rendered[index]?.segments ?? [],
    }))
  }, [storeName, logoUrl, paper, studio.layout, studio.draft.drafts])

  const silentIds = useMemo(
    () => new Set(previewBlocks.filter((b) => b.segments.length === 0).map((b) => b.id)),
    [previewBlocks],
  )

  const handlePaperSelect = (id: string) => {
    studio.select(id)
    setMobileView('edit')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] font-sans text-[#1D1815]">
      {/* ============ TOP BAR ============ */}
      <header className="z-20 flex h-[54px] flex-shrink-0 items-center gap-3 border-b border-[#E5E0D6] bg-white px-3 sm:px-4">
        <Link
          href={`/${tenantSlug}/admin/settings`}
          className="flex h-[28px] items-center rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="Back to settings"
        >
          ←<span className="ml-1 hidden sm:inline">Settings</span>
        </Link>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold leading-tight">Receipt Studio</div>
          <div className="truncate text-[11px] font-semibold text-[#8B857B]">{storeName}</div>
        </div>
        <div className="flex-1" />
        <PublishStatus studio={studio} />
        {studio.isDirty && (
          <button
            type="button"
            onClick={studio.discard}
            disabled={studio.isPublishing}
            className="rounded-full px-3 py-2 text-[12.5px] font-bold text-[#8B857B] hover:bg-[#EFECE6] hover:text-[#1D1815] disabled:opacity-40"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={studio.publish}
          disabled={studio.isPublishing || !studio.isDirty}
          className="rounded-full bg-[#1D1815] px-5 py-2 text-[13px] font-extrabold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {studio.isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ============ SETTINGS PANEL ============ */}
        <aside
          className={`${mobileView === 'edit' ? 'flex' : 'hidden'} w-full flex-shrink-0 flex-col border-r border-[#E5E0D6] bg-white lg:flex lg:w-[380px]`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TemplateSection studio={studio} />
            <WholeReceiptSection studio={studio} />
            <BlocksSection
              studio={studio}
              columns={paper.columns}
              hasLogo={Boolean(logoUrl)}
              silentIds={silentIds}
            />
            <div className="h-20 lg:h-8" />
          </div>
        </aside>

        {/* ============ PAPER-ROLL PREVIEW ============ */}
        <main className={`${mobileView === 'preview' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col lg:flex`}>
          <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-3 px-4 pt-5">
            <span className={sectionTitle}>Live preview · sample sale</span>
            <div className="flex gap-0.5 rounded-full bg-white p-[3px] shadow-sm" role="radiogroup" aria-label="Paper width">
              {PAPER_WIDTHS.map((option) => (
                <button
                  key={option.mm}
                  type="button"
                  role="radio"
                  aria-checked={paper.mm === option.mm}
                  onClick={() => setPaper(option)}
                  className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors ${
                    paper.mm === option.mm ? 'bg-[#1D1815] text-white' : 'text-[#8B857B] hover:text-[#1D1815]'
                  }`}
                >
                  {option.mm}mm
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="flex min-h-full flex-col items-center px-4 pb-24 pt-6 lg:pb-10">
              {previewBlocks.length === 0 ? (
                <div className="rounded-lg bg-white px-6 py-10 text-center text-[12px] text-[#8B857B] shadow">
                  Nothing to print yet — add a block.
                </div>
              ) : (
                <PaperPreview
                  blocks={previewBlocks}
                  columns={paper.columns}
                  selectedId={studio.selectedId}
                  onSelect={handlePaperSelect}
                />
              )}
              <p className="mt-5 max-w-[300px] text-center text-[11px] leading-relaxed text-[#8B857B]">
                Drawn by the same engine your printer uses. Bold and big text print exactly as shown;
                the paper width follows each printer&apos;s setting in the app.
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* ============ PHONE: EDIT / PREVIEW SWITCH ============ */}
      <nav className="fixed inset-x-0 bottom-4 z-30 flex justify-center lg:hidden" aria-label="Studio view">
        <div className="flex gap-0.5 rounded-full bg-[#1D1815] p-1 shadow-xl">
          {(['edit', 'preview'] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={mobileView === view}
              onClick={() => setMobileView(view)}
              className={`rounded-full px-5 py-2 text-[12.5px] font-bold capitalize transition-colors ${
                mobileView === view ? 'bg-white text-[#1D1815]' : 'text-white/70'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
