'use client'

/**
 * Receipt Studio — the tenant admin's visual thermal-receipt editor.
 *
 * A receipt is a stack of blocks (see src/lib/receipt-layout.ts). The editor
 * offers the three presets plus a Custom mode where blocks are added from a
 * palette and dragged into order (same dnd-kit idiom as the Branding Studio's
 * category panel). The paper-roll preview on the right renders through the
 * exact engine the merchant app prints with, so what it shows is what prints.
 */

import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { saveReceiptLayoutAction } from '@/app/actions/receipt'
import { BLOCK_PALETTE, addBlock } from '@/lib/receipt-editor'
import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  renderReceipt,
  resolveReceiptLayout,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptLayout,
  type ReceiptPresetName,
  type ReceiptTextAlign,
} from '@/lib/receipt-layout'

interface ReceiptEditorProps {
  tenantId: string
  storeName: string
  initialLayout: unknown
}

type EditorMode = ReceiptPresetName | 'custom'

interface DraftBlock {
  id: string
  block: ReceiptBlock
}

const PRESETS: Array<{ name: ReceiptPresetName; label: string; layout: ReceiptLayout }> = [
  { name: 'classic', label: 'Classic', layout: CLASSIC_RECEIPT_LAYOUT },
  { name: 'compact', label: 'Compact', layout: COMPACT_RECEIPT_LAYOUT },
  { name: 'detailed', label: 'Detailed', layout: DETAILED_RECEIPT_LAYOUT },
]

/** Deterministic sample sale for the preview — never real data. */
const SAMPLE_ORDER = {
  _id: 'sample-order-4821',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Maria',
  customerContact: '09171234567',
  orderType: 'Dine-in',
  total: 372.5,
  paymentMethod: 'Cash',
  cashTendered: 500,
  changeDue: 127.5,
  items: [
    { menuItemName: 'Iced Latte', quantity: 2, subtotal: 240, variation: 'Large' },
    { menuItemName: 'Ham & Cheese Croissant', quantity: 1, subtotal: 132.5 },
  ],
}

const SAMPLE_TRACKING_URL = 'https://your.store/order/sample?t=…'

function initialMode(saved: unknown): EditorMode {
  if (saved === null || saved === undefined) return 'classic'
  if (typeof saved === 'string') {
    return (['classic', 'compact', 'detailed'] as const).includes(saved as ReceiptPresetName)
      ? (saved as ReceiptPresetName)
      : 'classic'
  }
  return 'custom'
}

function blockLabel(kind: ReceiptBlockKind): string {
  return BLOCK_PALETTE.find((entry) => entry.kind === kind)?.label ?? kind
}

interface SortableBlockRowProps {
  draft: DraftBlock
  onChange: (block: ReceiptBlock) => void
  onRemove: () => void
}

function SortableBlockRow({ draft, onChange, onRemove }: SortableBlockRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draft.id,
  })
  const { block } = draft

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-card px-2.5 py-2 ${
        isDragging ? 'z-10 border-primary shadow-md' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground"
          aria-label={`Drag ${blockLabel(block.kind)}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex-1 text-sm font-medium">{blockLabel(block.kind)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={onRemove}
          aria-label={`Remove ${blockLabel(block.kind)}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {block.kind === 'text' && (
        <div className="mt-2 flex gap-2">
          <Input
            value={block.text}
            maxLength={64}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className="h-8 text-sm"
          />
          <Select
            value={block.align ?? 'left'}
            onValueChange={(align) =>
              onChange({ ...block, align: align as ReceiptTextAlign })
            }
          >
            <SelectTrigger className="h-8 w-[104px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {block.kind === 'divider' && (
        <div className="mt-2">
          <Select
            value={block.char ?? '='}
            onValueChange={(char) => onChange({ ...block, char })}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="=">══════</SelectItem>
              <SelectItem value="-">──────</SelectItem>
              <SelectItem value="*">******</SelectItem>
              <SelectItem value=".">......</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

export function ReceiptEditor({ tenantId, storeName, initialLayout }: ReceiptEditorProps) {
  const idCounter = useRef(0)
  const nextId = () => `block-${++idCounter.current}`

  const toDrafts = (blocks: ReceiptBlock[]): DraftBlock[] =>
    blocks.map((block) => ({ id: nextId(), block }))

  const [mode, setMode] = useState<EditorMode>(() => initialMode(initialLayout))
  const [drafts, setDrafts] = useState<DraftBlock[]>(() =>
    toDrafts(resolveReceiptLayout(initialLayout).blocks),
  )
  const [isSaving, setIsSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeLayout: ReceiptLayout = useMemo(() => {
    if (mode !== 'custom') {
      return PRESETS.find((p) => p.name === mode)?.layout ?? CLASSIC_RECEIPT_LAYOUT
    }
    return { version: 1, blocks: drafts.map((d) => d.block) }
  }, [mode, drafts])

  const preview = useMemo(
    () =>
      renderReceipt(
        SAMPLE_ORDER,
        { storeName, storeAddress: undefined, trackingUrl: SAMPLE_TRACKING_URL },
        activeLayout.blocks.length > 0 ? activeLayout : CLASSIC_RECEIPT_LAYOUT,
      ),
    [storeName, activeLayout],
  )

  const handlePresetSelect = (preset: ReceiptPresetName) => {
    setMode(preset)
    // Seed the custom stack from the preset so "start from Compact" works.
    setDrafts(toDrafts(PRESETS.find((p) => p.name === preset)!.layout.blocks))
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

  const handleSave = async () => {
    if (mode === 'custom' && drafts.length === 0) {
      toast.error('Add at least one block')
      return
    }
    setIsSaving(true)
    try {
      const payload = mode === 'custom' ? activeLayout : mode
      const result = await saveReceiptLayoutAction(tenantId, payload)
      if (result.success) {
        toast.success('Receipt layout published')
      } else {
        toast.error(result.error ?? 'Could not save')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {/* Preset picker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Format</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant={mode === preset.name ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetSelect(preset.name)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              variant={mode === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('custom')}
            >
              Custom
            </Button>
          </CardContent>
        </Card>

        {/* Custom block stack */}
        {mode === 'custom' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Blocks — drag to arrange</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={drafts.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {drafts.map((draft, index) => (
                      <SortableBlockRow
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

              <div className="flex flex-wrap gap-1.5 border-t pt-3">
                {BLOCK_PALETTE.map((entry) => (
                  <Button
                    key={entry.kind}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    title={entry.description}
                    onClick={() =>
                      setDrafts((current) => [
                        ...current,
                        ...toDrafts(addBlock([], entry.kind)),
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {entry.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Button type="button" className="w-full" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Publishing…' : 'Publish receipt layout'}
        </Button>
      </div>

      {/* Paper-roll preview */}
      <div>
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md bg-white p-3 shadow-inner ring-1 ring-border">
              <pre className="font-mono text-[11px] leading-[1.35] text-neutral-900">
                {preview}
              </pre>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Sample sale shown. The QR block prints as a scannable code on the
              thermal printer.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
