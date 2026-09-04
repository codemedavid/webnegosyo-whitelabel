'use client'
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Film,
  Heading1,
  ImagePlus,
  Link2,
  Loader2,
  Pilcrow,
  Play,
  Plus,
  Trash2,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'
import { resolveVideoEmbed, type AnnouncementBlock } from '@/lib/announcements/blocks'

interface Props {
  blocks: AnnouncementBlock[]
  onChange: (blocks: AnnouncementBlock[]) => void
}

type MediaKind = 'image' | 'video'
type PaletteKind = AnnouncementBlock['type']

interface PaletteEntry {
  kind: PaletteKind
  label: string
  hint: string
  icon: LucideIcon
}

const UPLOAD_FOLDER = '/platform/whats-new'

const PALETTE: PaletteEntry[] = [
  { kind: 'heading', label: 'Heading', hint: 'Section title', icon: Heading1 },
  { kind: 'paragraph', label: 'Paragraph', hint: 'Body text', icon: Pilcrow },
  { kind: 'image', label: 'Image', hint: 'Upload a photo', icon: ImagePlus },
  { kind: 'video', label: 'Video', hint: 'Upload a clip', icon: Film },
  { kind: 'embed', label: 'YouTube / Vimeo', hint: 'Paste a link', icon: Youtube },
]

const BLOCK_META: Record<PaletteKind, { label: string; icon: LucideIcon }> = {
  heading: { label: 'Heading', icon: Heading1 },
  paragraph: { label: 'Paragraph', icon: Pilcrow },
  image: { label: 'Image', icon: ImagePlus },
  video: { label: 'Video', icon: Film },
  embed: { label: 'Embed', icon: Link2 },
}

const INLINE_FIELD =
  'w-full bg-transparent text-white placeholder:text-white/25 focus:outline-none'

function moveBlock(blocks: AnnouncementBlock[], from: number, to: number): AnnouncementBlock[] {
  if (to < 0 || to >= blocks.length) return blocks
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function insertBlock(blocks: AnnouncementBlock[], index: number, block: AnnouncementBlock): AnnouncementBlock[] {
  return [...blocks.slice(0, index), block, ...blocks.slice(index)]
}

/**
 * Ordered typed blocks laid out like a document: each block is a card with a
 * type rail, borderless fields, and a hover toolbar. New blocks can be added
 * at the end or between any two existing ones. Every change returns a new
 * array (no in-place edits).
 */
export function BlockEditor({ blocks, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingUpload, setPendingUpload] = useState<{ kind: MediaKind; index: number } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [embedAt, setEmbedAt] = useState<number | null>(null)
  const [openInsert, setOpenInsert] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  const update = (index: number, block: AnnouncementBlock) =>
    onChange(blocks.map((existing, i) => (i === index ? block : existing)))
  const remove = (index: number) => onChange(blocks.filter((_, i) => i !== index))

  const pick = (kind: PaletteKind, index: number) => {
    setOpenInsert(null)
    if (kind === 'heading' || kind === 'paragraph') {
      onChange(insertBlock(blocks, index, { type: kind, text: '' }))
      setFocusIndex(index)
      return
    }
    if (kind === 'embed') {
      setEmbedAt(index)
      return
    }
    setPendingUpload({ kind, index })
    // Defer so the accept attribute reflects the chosen kind before the picker opens.
    requestAnimationFrame(() => fileInput.current?.click())
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !pendingUpload) return
    setIsUploading(true)
    try {
      const uploaded = await uploadImageToImageKit(file, { folder: UPLOAD_FOLDER })
      onChange(insertBlock(blocks, pendingUpload.index, { type: pendingUpload.kind, url: uploaded.url }))
      toast.success(`${pendingUpload.kind === 'image' ? 'Image' : 'Video'} added`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setPendingUpload(null)
    }
  }

  const addEmbed = (url: string) => {
    if (embedAt === null) return
    onChange(insertBlock(blocks, embedAt, { type: 'embed', url }))
    setEmbedAt(null)
  }

  return (
    <div className="space-y-1">
      {blocks.length === 0 && embedAt === null ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
          <p className="text-sm font-medium text-white">Start writing</p>
          <p className="mt-1 text-xs text-white/45">Add a heading and a few paragraphs, then drop in screenshots or a walkthrough video.</p>
          <div className="mt-4">
            <BlockPalette onPick={(kind) => pick(kind, 0)} disabled={isUploading} />
          </div>
        </div>
      ) : null}

      {blocks.map((block, index) => (
        <div key={index}>
          {embedAt === index ? <EmbedComposer onAdd={addEmbed} onCancel={() => setEmbedAt(null)} /> : null}
          <InsertLine
            isOpen={openInsert === index}
            onToggle={() => setOpenInsert(openInsert === index ? null : index)}
            onPick={(kind) => pick(kind, index)}
            disabled={isUploading}
          />
          <BlockCard
            block={block}
            autoFocus={focusIndex === index}
            isFirst={index === 0}
            isLast={index === blocks.length - 1}
            onChange={(next) => update(index, next)}
            onMoveUp={() => onChange(moveBlock(blocks, index, index - 1))}
            onMoveDown={() => onChange(moveBlock(blocks, index, index + 1))}
            onRemove={() => remove(index)}
          />
        </div>
      ))}

      {embedAt === blocks.length ? <EmbedComposer onAdd={addEmbed} onCancel={() => setEmbedAt(null)} /> : null}

      {blocks.length > 0 ? (
        <div className="pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            {isUploading ? 'Uploading…' : 'Add a block'}
          </p>
          <BlockPalette onPick={(kind) => pick(kind, blocks.length)} disabled={isUploading} />
        </div>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept={pendingUpload?.kind === 'video' ? 'video/*' : 'image/*'}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

function BlockPalette({ onPick, disabled }: { onPick: (kind: PaletteKind) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {PALETTE.map(({ kind, label, hint, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          disabled={disabled}
          className="group flex flex-col items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] transition-colors group-hover:bg-white group-hover:text-black">
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
          </span>
          <span>
            <span className="block text-xs font-semibold text-white">{label}</span>
            <span className="block text-[11px] text-white/45">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function InsertLine({
  isOpen,
  onToggle,
  onPick,
  disabled,
}: {
  isOpen: boolean
  onToggle: () => void
  onPick: (kind: PaletteKind) => void
  disabled?: boolean
}) {
  return (
    <div className={cn('group/insert relative py-1', isOpen && 'py-2')}>
      <div className={cn('flex items-center gap-2 opacity-0 transition-opacity group-hover/insert:opacity-100', isOpen && 'opacity-100')}>
        <span className="h-px flex-1 bg-white/15" />
        <button
          type="button"
          onClick={onToggle}
          aria-label="Insert block here"
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black text-white transition-colors hover:bg-white hover:text-black',
            isOpen && 'rotate-45 bg-white text-black',
          )}
        >
          <Plus className="h-3.5 w-3.5 transition-transform" />
        </button>
        <span className="h-px flex-1 bg-white/15" />
      </div>
      {isOpen ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur">
          <BlockPalette onPick={onPick} disabled={disabled} />
        </div>
      ) : null}
    </div>
  )
}

function BlockCard({
  block,
  autoFocus,
  isFirst,
  isLast,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  block: AnnouncementBlock
  autoFocus: boolean
  isFirst: boolean
  isLast: boolean
  onChange: (block: AnnouncementBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const meta = BLOCK_META[block.type]
  const Icon = meta.icon
  return (
    <div className="group/block relative rounded-2xl border border-white/10 bg-white/[0.02] transition-colors focus-within:border-white/25 hover:border-white/20">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70" title={meta.label}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <BlockFields block={block} autoFocus={autoFocus} onChange={onChange} />
        </div>
      </div>
      <div className="absolute -top-3 right-3 flex items-center gap-0.5 rounded-lg border border-white/15 bg-black p-0.5 opacity-0 shadow-lg transition-opacity group-focus-within/block:opacity-100 group-hover/block:opacity-100">
        <IconButton label="Move up" onClick={onMoveUp} disabled={isFirst}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Move down" onClick={onMoveDown} disabled={isLast}>
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <span className="mx-0.5 h-4 w-px bg-white/15" />
        <IconButton label="Remove block" onClick={onRemove} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

function autosize(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function BlockFields({
  block,
  autoFocus,
  onChange,
}: {
  block: AnnouncementBlock
  autoFocus: boolean
  onChange: (b: AnnouncementBlock) => void
}) {
  if (block.type === 'heading') {
    return (
      <input
        autoFocus={autoFocus}
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        placeholder="Section heading"
        className={cn(INLINE_FIELD, 'text-lg font-semibold tracking-tight')}
      />
    )
  }
  if (block.type === 'paragraph') {
    return (
      <textarea
        autoFocus={autoFocus}
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        ref={(el) => {
          if (el) autosize(el)
        }}
        onInput={(e) => autosize(e.currentTarget)}
        placeholder="Write the paragraph…"
        rows={2}
        className={cn(INLINE_FIELD, 'resize-none text-sm leading-relaxed')}
      />
    )
  }
  return <MediaFields block={block} onChange={onChange} />
}

function MediaFields({
  block,
  onChange,
}: {
  block: Extract<AnnouncementBlock, { type: 'image' | 'video' | 'embed' }>
  onChange: (b: AnnouncementBlock) => void
}) {
  const embed = block.type === 'embed' ? resolveVideoEmbed(block.url) : null
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
        {block.type === 'image' ? <img src={block.url} alt="" className="max-h-64 w-full object-cover" /> : null}
        {block.type === 'video' ? <video src={block.url} controls preload="metadata" className="max-h-64 w-full" /> : null}
        {block.type === 'embed' ? (
          <div className="relative flex aspect-video max-h-64 w-full items-center justify-center">
            {embed?.thumbnailUrl ? (
              <img src={embed.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            ) : null}
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <Play className="h-5 w-5 text-black" />
            </span>
            <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
              {embed ? (embed.provider === 'youtube' ? 'YouTube' : 'Vimeo') : 'Link'}
            </span>
          </div>
        ) : null}
      </div>
      <input
        value={block.caption ?? ''}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Add a caption (optional)"
        className={cn(INLINE_FIELD, 'text-xs text-white/70')}
      />
    </div>
  )
}

function EmbedComposer({ onAdd, onCancel }: { onAdd: (url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const embed = trimmed ? resolveVideoEmbed(trimmed) : null
  const isInvalid = trimmed.length > 0 && !embed

  return (
    <div className="my-1 rounded-2xl border border-white/25 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70">
          <Youtube className="h-3.5 w-3.5" />
        </span>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && embed) onAdd(trimmed)
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Paste a YouTube or Vimeo link"
          className={cn(INLINE_FIELD, 'text-sm')}
        />
        <button
          type="button"
          onClick={() => embed && onAdd(trimmed)}
          disabled={!embed}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          Add
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white">
          Cancel
        </button>
      </div>
      <p className={cn('mt-2 pl-9 text-xs', isInvalid ? 'text-amber-300' : 'text-white/45')}>
        {embed
          ? `${embed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} video detected · opens in the ${embed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} app on the merchant's phone`
          : isInvalid
            ? 'Only YouTube and Vimeo links are supported'
            : 'Watch, youtu.be, Shorts and Vimeo links all work'}
      </p>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'rounded-md p-1.5 text-red-400/80 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30'
          : 'rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30'
      }
    >
      {children}
    </button>
  )
}
