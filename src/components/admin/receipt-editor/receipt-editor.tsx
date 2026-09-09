'use client'

/**
 * Receipt Studio — the tenant admin's visual thermal-receipt editor.
 *
 * Full-screen studio in the Branding Studio design language: top bar with
 * Publish, a white settings panel (format presets, drag-to-arrange block
 * stack, grouped block palette), and a live paper-roll preview rendered by
 * the exact engine the merchant app prints with — what it shows is what
 * prints. Blocks live in src/lib/receipt-layout.ts; state helpers in
 * src/lib/receipt-editor.ts.
 */

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { saveReceiptLayoutAction } from '@/app/actions/receipt'
import { BLOCK_GROUPS, BLOCK_PALETTE, addBlock } from '@/lib/receipt-editor'
import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  RECEIPT_THEMES,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  renderReceiptSegments,
  resolveReceiptLayout,
  resolveReceiptTheme,
  type ReceiptBlock,
  type ReceiptLayout,
  type ReceiptPresetName,
  type ReceiptTheme,
} from '@/lib/receipt-layout'
import { BlockRow } from './block-row'
import { PaperPreview } from './paper-preview'

interface ReceiptEditorProps {
  tenantId: string
  tenantSlug: string
  storeName: string
  /** The tenant's logo URL — the `logo` block previews and prints with it. */
  logoUrl: string | null
  initialLayout: unknown
}

type EditorMode = ReceiptPresetName | 'custom'

interface DraftBlock {
  id: string
  block: ReceiptBlock
}

const PRESETS: Array<{
  name: ReceiptPresetName
  label: string
  description: string
  layout: ReceiptLayout
}> = [
  {
    name: 'modern',
    label: 'Modern',
    description: 'Bold name, headline order number, tracking QR — the default',
    layout: MODERN_RECEIPT_LAYOUT,
  },
  {
    name: 'classic',
    label: 'Classic',
    description: 'The flat 32-column slip stores printed before styles',
    layout: CLASSIC_RECEIPT_LAYOUT,
  },
  {
    name: 'compact',
    label: 'Compact',
    description: 'Short slip — saves paper on busy days',
    layout: COMPACT_RECEIPT_LAYOUT,
  },
  {
    name: 'detailed',
    label: 'Detailed',
    description: 'Everything, plus contact and tracking QR',
    layout: DETAILED_RECEIPT_LAYOUT,
  },
]

/** Deterministic sample sale for the preview — never real data. */
const SAMPLE_ORDER = {
  _id: 'sample-order-4821',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Maria',
  customerContact: '09171234567',
  orderType: 'Dine-in',
  // A seated sample so the Table block previews with a value, not silence.
  customerData: { table_number: '12' },
  // Both fees are on the sample deliberately. A merchant arranging their
  // totals block has to SEE where a service charge and a delivery fee land;
  // without them the preview jumped from the items straight to TOTAL and the
  // rows were first discovered on a live chit.
  serviceCharge: 37.25,
  deliveryFee: 50,
  total: 459.75,
  paymentMethod: 'Cash',
  cashTendered: 500,
  changeDue: 40.25,
  items: [
    { menuItemName: 'Iced Latte', quantity: 2, subtotal: 240, variation: 'Large' },
    { menuItemName: 'Ham & Cheese Croissant', quantity: 1, subtotal: 132.5 },
  ],
}

const SAMPLE_TRACKING_URL = 'https://your.store/order/sample?t=…'

function initialMode(saved: unknown): EditorMode {
  if (saved === null || saved === undefined) return 'modern'
  if (typeof saved === 'string') {
    return PRESETS.some((p) => p.name === saved) ? (saved as ReceiptPresetName) : 'modern'
  }
  return 'custom'
}

const THEME_LABELS: Record<ReceiptTheme, { label: string; description: string }> = {
  modern: { label: 'Modern', description: 'Bold, tall and centred text' },
  classic: { label: 'Classic', description: 'Flat, label-and-colon rows' },
}

/** Stable fingerprint of what Publish would save — drives the dirty state. */
function publishKey(mode: EditorMode, layout: ReceiptLayout): string {
  return mode === 'custom' ? JSON.stringify(layout) : mode
}

export function ReceiptEditor({ tenantId, tenantSlug, storeName, logoUrl, initialLayout }: ReceiptEditorProps) {
  const idCounter = useRef(0)
  const nextId = () => `block-${++idCounter.current}`

  const toDrafts = (blocks: ReceiptBlock[]): DraftBlock[] =>
    blocks.map((block) => ({ id: nextId(), block }))

  const [mode, setMode] = useState<EditorMode>(() => initialMode(initialLayout))
  const [drafts, setDrafts] = useState<DraftBlock[]>(() =>
    toDrafts(resolveReceiptLayout(initialLayout).blocks),
  )
  const [theme, setTheme] = useState<ReceiptTheme>(() =>
    resolveReceiptTheme(resolveReceiptLayout(initialLayout)),
  )
  const [isPublishing, setIsPublishing] = useState(false)
  const [showPublishedToast, setShowPublishedToast] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeLayout: ReceiptLayout = useMemo(() => {
    if (mode !== 'custom') {
      return PRESETS.find((p) => p.name === mode)?.layout ?? MODERN_RECEIPT_LAYOUT
    }
    return { version: 1, theme, blocks: drafts.map((d) => d.block) }
  }, [mode, drafts, theme])

  const [savedKey, setSavedKey] = useState(() =>
    publishKey(
      initialMode(initialLayout),
      resolveReceiptLayout(initialLayout),
    ),
  )
  const isDirty = publishKey(mode, activeLayout) !== savedKey

  const previewSegments = useMemo(
    () =>
      renderReceiptSegments(
        SAMPLE_ORDER,
        {
          storeName,
          storeAddress: undefined,
          trackingUrl: SAMPLE_TRACKING_URL,
          ...(logoUrl ? { logoUrl } : {}),
        },
        activeLayout.blocks.length > 0 ? activeLayout : MODERN_RECEIPT_LAYOUT,
      ),
    [storeName, logoUrl, activeLayout],
  )

  const hasLogoBlockWithoutLogo =
    !logoUrl && activeLayout.blocks.some((block) => block.kind === 'logo')

  const handlePresetSelect = (preset: ReceiptPresetName) => {
    setMode(preset)
    // Seed the custom stack from the preset so "start from Compact" works.
    const layout = PRESETS.find((p) => p.name === preset)!.layout
    setDrafts(toDrafts(layout.blocks))
    setTheme(resolveReceiptTheme(layout))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDrafts((current) => {
      const from = current.findIndex((d) => d.id === active.id)
      const to = current.findIndex((d) => d.id === over.id)
      if (from < 0 || to < 0) return current
      return arrayMove(current, from, to)
    })
  }

  const handlePublish = async () => {
    if (mode === 'custom' && drafts.length === 0) {
      toast.error('Add at least one block')
      return
    }
    if (mode === 'custom' && drafts.some((d) => d.block.kind === 'fillIn' && d.block.label === '')) {
      toast.error('Fill-in lines need a label — that is what the customer fills in')
      return
    }
    setIsPublishing(true)
    try {
      const payload = mode === 'custom' ? activeLayout : mode
      const result = await saveReceiptLayoutAction(tenantId, payload)
      if (result.success) {
        setSavedKey(publishKey(mode, activeLayout))
        setShowPublishedToast(true)
        window.setTimeout(() => setShowPublishedToast(false), 2500)
      } else {
        toast.error(result.error ?? 'Could not save')
      }
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] font-sans text-[#1D1815]">
      {/* ============ TOP BAR ============ */}
      <div className="z-20 flex h-[54px] flex-shrink-0 items-center gap-4 border-b border-[#E5E0D6] bg-white px-4">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/${tenantSlug}/admin/settings`}
            className="flex h-[26px] items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Back to settings"
          >
            ← Settings
          </Link>
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#1D1815] font-mono text-[13px] font-black text-white">
            ⌘
          </div>
          <div className="text-[14px] font-extrabold">Receipt Studio</div>
          <div className="border-l border-[#E5E0D6] pl-3 text-[12px] font-semibold text-[#8B857B]">
            {storeName}
          </div>
        </div>

        <div className="flex-1" />

        {showPublishedToast && (
          <div className="text-[12px] font-bold text-emerald-700">✓ Published to the printer</div>
        )}
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPublishing || !isDirty}
          className="rounded-full bg-[#1D1815] px-5 py-2 text-[13px] font-extrabold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ============ SETTINGS PANEL ============ */}
        <aside className="flex w-[360px] flex-shrink-0 flex-col border-r border-[#E5E0D6] bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Format presets */}
            <div className="border-b border-[#E5E0D6] px-[18px] pb-4 pt-4">
              <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                Format
              </div>
              <div className="flex flex-col gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handlePresetSelect(preset.name)}
                    className={`rounded-[10px] border px-3 py-2 text-left transition-colors ${
                      mode === preset.name
                        ? 'border-[#1D1815] bg-[#1D1815] text-white'
                        : 'border-[#E5E0D6] hover:border-[#1D1815]'
                    }`}
                  >
                    <div className="text-[12.5px] font-bold">{preset.label}</div>
                    <div
                      className={`mt-px text-[11px] ${
                        mode === preset.name ? 'text-white/70' : 'text-[#8B857B]'
                      }`}
                    >
                      {preset.description}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  className={`rounded-[10px] border border-dashed px-3 py-2 text-left transition-colors ${
                    mode === 'custom'
                      ? 'border-[#1D1815] bg-[#1D1815] text-white'
                      : 'border-[#D8D2C6] hover:border-[#1D1815]'
                  }`}
                >
                  <div className="text-[12.5px] font-bold">Custom</div>
                  <div
                    className={`mt-px text-[11px] ${
                      mode === 'custom' ? 'text-white/70' : 'text-[#8B857B]'
                    }`}
                  >
                    Arrange your own blocks — start from any preset
                  </div>
                </button>
              </div>
            </div>

            {mode === 'custom' && (
              <>
                {/* Style: how the blocks print, not what they say */}
                <div className="border-b border-[#E5E0D6] px-[18px] pb-4 pt-4">
                  <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                    Style
                  </div>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Receipt style">
                    {RECEIPT_THEMES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={theme === option}
                        onClick={() => setTheme(option)}
                        className={`rounded-[10px] border px-3 py-2 text-left transition-colors ${
                          theme === option
                            ? 'border-[#1D1815] bg-[#1D1815] text-white'
                            : 'border-[#D8D2C6] hover:border-[#1D1815]'
                        }`}
                      >
                        <div className="text-[12.5px] font-bold">{THEME_LABELS[option].label}</div>
                        <div
                          className={`mt-px text-[11px] ${
                            theme === option ? 'text-white/70' : 'text-[#8B857B]'
                          }`}
                        >
                          {THEME_LABELS[option].description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Block stack */}
                <div className="border-b border-[#E5E0D6] px-[18px] pb-4 pt-4">
                  <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                    Your receipt — drag to arrange
                  </div>
                  {hasLogoBlockWithoutLogo && (
                    <div className="mb-2 rounded-[10px] bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-800">
                      Your store has no logo yet, so the logo block prints
                      nothing. Upload one in Settings first.
                    </div>
                  )}
                  {drafts.length === 0 && (
                    <div className="rounded-[10px] border border-dashed border-[#D8D2C6] px-3 py-4 text-center text-[12px] text-[#8B857B]">
                      Empty receipt — add blocks from the library below.
                    </div>
                  )}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={drafts.map((d) => d.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-1.5">
                        {drafts.map((draft, index) => (
                          <BlockRow
                            key={draft.id}
                            draft={draft}
                            onChange={(block) =>
                              setDrafts((current) =>
                                current.map((d, i) => (i === index ? { ...d, block } : d)),
                              )
                            }
                            onRemove={() =>
                              setDrafts((current) => current.filter((_, i) => i !== index))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                {/* Block library, grouped */}
                {BLOCK_GROUPS.map((group) => (
                  <div key={group} className="border-b border-[#E5E0D6] px-[18px] pb-4 pt-3.5">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                      {group}
                    </div>
                    <div className="flex flex-col gap-1">
                      {BLOCK_PALETTE.filter((entry) => entry.group === group).map((entry) => (
                        <button
                          key={entry.kind}
                          type="button"
                          onClick={() =>
                            setDrafts((current) => [
                              ...current,
                              ...toDrafts(addBlock([], entry.kind)),
                            ])
                          }
                          className="group flex items-center gap-2.5 rounded-[10px] border border-transparent px-2 py-1.5 text-left transition-colors hover:border-[#E5E0D6] hover:bg-[#FAF8F4]"
                        >
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#EFECE6] text-[#8B857B] transition-colors group-hover:bg-[#1D1815] group-hover:text-white">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-bold">
                              {entry.label}
                            </span>
                            <span className="block truncate text-[11px] text-[#8B857B]">
                              {entry.description}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="h-8" />
          </div>
        </aside>

        {/* ============ PAPER-ROLL PREVIEW ============ */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center px-6 py-10">
            <div className="mb-4 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
              Live preview — sample sale
            </div>
            <PaperPreview segments={previewSegments} />
            <p className="mt-5 max-w-[280px] text-center text-[11px] leading-relaxed text-[#8B857B]">
              Rendered by the same engine your printer uses — what you see is
              what prints. The QR block prints as a scannable code on paper.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
