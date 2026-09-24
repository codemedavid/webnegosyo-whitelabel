'use client'

/**
 * Receipt Studio state: the draft block stack, the whole-receipt settings,
 * which block is selected, and publishing.
 *
 * The draft always mirrors what the preview shows. Picking a template seeds
 * the stack from it and publishes the template's NAME (so later improvements
 * to that template reach the store); the first edit of any kind turns the
 * draft into a custom layout, which publishes the block stack itself.
 */

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { saveReceiptLayoutAction } from '@/app/actions/receipt'
import {
  addBlock,
  duplicateDraft,
  insertDraftAfter,
  moveDraft,
  splitOrderMetaDraft,
  ORDER_META_LINE_COUNT,
  type DraftBlock,
} from '@/lib/receipt-editor'
import {
  resolveReceiptLayout,
  resolveReceiptTheme,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptLayout,
  type ReceiptPresetName,
  type ReceiptTheme,
} from '@/lib/receipt-layout'
import { RECEIPT_TEMPLATES, templateLayout } from './receipt-templates'

export type StudioMode = ReceiptPresetName | 'custom'

interface StudioDraft {
  mode: StudioMode
  /** The template the draft started from — null for a layout loaded as custom. */
  baseTemplate: ReceiptPresetName | null
  theme: ReceiptTheme
  isBold: boolean
  drafts: DraftBlock[]
}

const PUBLISHED_FLASH_MS = 2500

function modeOf(saved: unknown): StudioMode {
  if (saved === null || saved === undefined) return 'modern'
  if (typeof saved === 'string') {
    return RECEIPT_TEMPLATES.some((t) => t.name === saved) ? (saved as ReceiptPresetName) : 'modern'
  }
  return 'custom'
}

function layoutOf(draft: StudioDraft): ReceiptLayout {
  if (draft.mode !== 'custom') return templateLayout(draft.mode)
  return {
    version: 1,
    theme: draft.theme,
    ...(draft.isBold ? { bold: true } : {}),
    blocks: draft.drafts.map((d) => d.block),
  }
}

/** What Publish would write — a template name or the custom layout. */
function payloadOf(draft: StudioDraft): ReceiptPresetName | ReceiptLayout {
  return draft.mode === 'custom' ? layoutOf(draft) : draft.mode
}

function keyOf(draft: StudioDraft): string {
  return JSON.stringify(payloadOf(draft))
}

export function useReceiptStudio(tenantId: string, initialLayout: unknown) {
  const idCounter = useRef(0)
  const nextId = () => `block-${++idCounter.current}`
  const withIds = (blocks: ReceiptBlock[]): DraftBlock[] =>
    blocks.map((block) => ({ id: nextId(), block }))

  const draftFrom = (saved: unknown): StudioDraft => {
    const layout = resolveReceiptLayout(saved)
    const mode = modeOf(saved)
    return {
      mode,
      baseTemplate: mode === 'custom' ? null : mode,
      theme: resolveReceiptTheme(layout),
      isBold: layout.bold === true,
      drafts: withIds(layout.blocks),
    }
  }

  const [draft, setDraft] = useState<StudioDraft>(() => draftFrom(initialLayout))
  const [published, setPublished] = useState<unknown>(initialLayout)
  const [savedKey, setSavedKey] = useState(() => keyOf(draftFrom(initialLayout)))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [hasJustPublished, setHasJustPublished] = useState(false)

  const layout = useMemo(() => layoutOf(draft), [draft])
  const isDirty = keyOf(draft) !== savedKey

  /** Every edit goes through here: it is what turns a template custom. */
  const edit = (change: (current: StudioDraft) => Partial<StudioDraft>) =>
    setDraft((current) => ({ ...current, ...change(current), mode: 'custom' }))

  const selectTemplate = (name: ReceiptPresetName) => {
    const previous = draft
    const template = templateLayout(name)
    setDraft({
      mode: name,
      baseTemplate: name,
      theme: resolveReceiptTheme(template),
      isBold: false,
      drafts: withIds(template.blocks),
    })
    setSelectedId(null)
    if (previous.mode === 'custom') {
      toast(`Switched to the ${name} template`, {
        description: 'Your custom blocks were replaced.',
        action: { label: 'Undo', onClick: () => setDraft(previous) },
      })
    }
  }

  const updateBlock = (id: string, block: ReceiptBlock) =>
    edit((current) => ({
      drafts: current.drafts.map((d) => (d.id === id ? { ...d, block } : d)),
    }))

  const removeBlock = (id: string) => {
    edit((current) => ({ drafts: current.drafts.filter((d) => d.id !== id) }))
    setSelectedId((current) => (current === id ? null : current))
  }

  const insertBlock = (kind: ReceiptBlockKind) => {
    const created = { id: nextId(), block: addBlock([], kind)[0]! }
    edit((current) => ({ drafts: insertDraftAfter(current.drafts, selectedId, created) }))
    setSelectedId(created.id)
  }

  const duplicate = (id: string) => {
    const copyId = nextId()
    edit((current) => ({ drafts: duplicateDraft(current.drafts, id, copyId) }))
    setSelectedId(copyId)
  }

  const move = (id: string, offset: -1 | 1) =>
    edit((current) => ({ drafts: moveDraft(current.drafts, id, offset) }))

  const reorder = (drafts: DraftBlock[]) => edit(() => ({ drafts }))

  const splitOrderMeta = (id: string) => {
    // Ids are minted here, not in the updater: React may run an updater
    // twice, and the first new line must be selectable right away.
    const ids = Array.from({ length: ORDER_META_LINE_COUNT }, nextId)
    edit((current) => {
      const queue = [...ids]
      return { drafts: splitOrderMetaDraft(current.drafts, id, () => queue.shift() ?? nextId(), current.theme) }
    })
    setSelectedId(ids[0] ?? null)
  }

  const setTheme = (theme: ReceiptTheme) => edit(() => ({ theme }))
  const setBold = (isBold: boolean) => edit(() => ({ isBold }))

  const discard = () => {
    setDraft(draftFrom(published))
    setSelectedId(null)
  }

  const publish = async () => {
    if (draft.mode === 'custom' && draft.drafts.length === 0) {
      toast.error('Add at least one block')
      return
    }
    const blankFillIn = draft.drafts.find((d) => d.block.kind === 'fillIn' && d.block.label === '')
    if (draft.mode === 'custom' && blankFillIn) {
      setSelectedId(blankFillIn.id)
      toast.error('Fill-in lines need a label — that is what the customer fills in')
      return
    }
    const blankText = draft.drafts.find((d) => d.block.kind === 'text' && d.block.text.trim() === '')
    if (draft.mode === 'custom' && blankText) {
      setSelectedId(blankText.id)
      toast.error('A custom text block is empty — type something or remove it')
      return
    }

    setIsPublishing(true)
    try {
      const payload = payloadOf(draft)
      const result = await saveReceiptLayoutAction(tenantId, payload)
      if (!result.success) {
        toast.error(result.error ?? 'Could not save')
        return
      }
      setPublished(payload)
      setSavedKey(keyOf(draft))
      setHasJustPublished(true)
      window.setTimeout(() => setHasJustPublished(false), PUBLISHED_FLASH_MS)
    } catch {
      toast.error('Could not publish — check your connection and try again')
    } finally {
      setIsPublishing(false)
    }
  }

  return {
    draft,
    layout,
    isDirty,
    isPublishing,
    hasJustPublished,
    selectedId,
    select: setSelectedId,
    selectTemplate,
    updateBlock,
    removeBlock,
    insertBlock,
    duplicate,
    move,
    reorder,
    splitOrderMeta,
    setTheme,
    setBold,
    discard,
    publish,
  }
}

export type ReceiptStudio = ReturnType<typeof useReceiptStudio>
