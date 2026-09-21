'use client'
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Heading1,
  ImagePlus,
  Info,
  Lightbulb,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Play,
  Plus,
  Trash2,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'
import { CALLOUT_TONES, type CalloutTone, type LessonBlock, type LessonBlockType } from '@/lib/university/blocks'
import { resolveLessonVideo, VIDEO_PROVIDER_LABEL } from '@/lib/university/video'

interface Props {
  blocks: LessonBlock[]
  onChange: (blocks: LessonBlock[]) => void
}

interface PaletteEntry {
  kind: LessonBlockType
  label: string
  icon: LucideIcon
}

const UPLOAD_FOLDER = '/platform/university/images'

const PALETTE: PaletteEntry[] = [
  { kind: 'heading', label: 'Heading', icon: Heading1 },
  { kind: 'paragraph', label: 'Paragraph', icon: Pilcrow },
  { kind: 'list', label: 'List', icon: List },
  { kind: 'callout', label: 'Callout', icon: Lightbulb },
  { kind: 'image', label: 'Image', icon: ImagePlus },
  { kind: 'embed', label: 'Video', icon: Youtube },
  { kind: 'divider', label: 'Divider', icon: Minus },
]

const BLOCK_ICON: Record<LessonBlockType, LucideIcon> = {
  heading: Heading1,
  paragraph: Pilcrow,
  list: List,
  callout: Lightbulb,
  image: ImagePlus,
  embed: Youtube,
  divider: Minus,
}

const TONE_META: Record<CalloutTone, { label: string; icon: LucideIcon; className: string }> = {
  info: { label: 'Note', icon: Info, className: 'border-sky-400/30 bg-sky-500/10 text-sky-200' },
  tip: { label: 'Tip', icon: Lightbulb, className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' },
  warning: { label: 'Watch out', icon: AlertTriangle, className: 'border-amber-400/30 bg-amber-500/10 text-amber-200' },
}

const INLINE_FIELD = 'w-full bg-transparent text-white placeholder:text-white/25 focus:outline-none'

function newBlock(kind: LessonBlockType): LessonBlock | null {
  switch (kind) {
    case 'heading':
      return { type: 'heading', text: '' }
    case 'paragraph':
      return { type: 'paragraph', text: '' }
    case 'list':
      return { type: 'list', style: 'bullet', items: [''] }
    case 'callout':
      return { type: 'callout', tone: 'tip', text: '' }
    case 'divider':
      return { type: 'divider' }
    default:
      return null
  }
}

function moveBlock(blocks: LessonBlock[], from: number, to: number): LessonBlock[] {
  if (to < 0 || to >= blocks.length) return blocks
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function insertBlock(blocks: LessonBlock[], index: number, block: LessonBlock): LessonBlock[] {
  return [...blocks.slice(0, index), block, ...blocks.slice(index)]
}

function autosize(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

/**
 * The lesson body: ordered typed blocks laid out like a document. Each block
 * is a card with a type rail, borderless fields and a hover toolbar; new
 * blocks go at the end or between any two existing ones. Every change
 * returns a new array.
 */
export function LessonBlockEditor({ blocks, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadAt, setUploadAt] = useState<number | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [embedAt, setEmbedAt] = useState<number | null>(null)
  const [openInsert, setOpenInsert] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  const update = (index: number, block: LessonBlock) =>
    onChange(blocks.map((existing, i) => (i === index ? block : existing)))
  const remove = (index: number) => onChange(blocks.filter((_, i) => i !== index))

  const pick = (kind: LessonBlockType, index: number) => {
    setOpenInsert(null)
    if (kind === 'embed') {
      setEmbedAt(index)
      return
    }
    if (kind === 'image') {
      setUploadAt(index)
      requestAnimationFrame(() => fileInput.current?.click())
      return
    }
    const block = newBlock(kind)
    if (!block) return
    onChange(insertBlock(blocks, index, block))
    setFocusIndex(index)
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || uploadAt === null) return
    setIsUploading(true)
    try {
      const uploaded = await uploadImageToImageKit(file, { folder: UPLOAD_FOLDER })
      onChange(insertBlock(blocks, uploadAt, { type: 'image', url: uploaded.url }))
      toast.success('Image added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setUploadAt(null)
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
          <p className="text-sm font-medium text-white">Write the lesson</p>
          <p className="mt-1 text-xs text-white/45">Headings, paragraphs, lists and callouts — plus screenshots and extra videos.</p>
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

      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

function BlockPalette({ onPick, disabled }: { onPick: (kind: LessonBlockType) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          disabled={disabled}
          className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white transition-colors hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-50"
        >
          {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 text-white/70 group-hover:text-white" />}
          {label}
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
  onPick: (kind: LessonBlockType) => void
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
  block: LessonBlock
  autoFocus: boolean
  isFirst: boolean
  isLast: boolean
  onChange: (block: LessonBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const Icon = BLOCK_ICON[block.type]
  return (
    <div className="group/block relative rounded-2xl border border-white/10 bg-white/[0.02] transition-colors focus-within:border-white/25 hover:border-white/20">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70" title={block.type}>
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

function BlockFields({ block, autoFocus, onChange }: { block: LessonBlock; autoFocus: boolean; onChange: (b: LessonBlock) => void }) {
  switch (block.type) {
    case 'heading':
      return (
        <input
          autoFocus={autoFocus}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Section heading"
          className={cn(INLINE_FIELD, 'text-lg font-semibold tracking-tight')}
        />
      )
    case 'paragraph':
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
    case 'list':
      return <ListFields block={block} autoFocus={autoFocus} onChange={onChange} />
    case 'callout':
      return <CalloutFields block={block} autoFocus={autoFocus} onChange={onChange} />
    case 'image':
      return (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
            <img src={block.url} alt="" className="max-h-72 w-full object-contain" />
          </div>
          <input
            value={block.caption ?? ''}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
            placeholder="Add a caption (optional)"
            className={cn(INLINE_FIELD, 'text-xs text-white/70')}
          />
        </div>
      )
    case 'embed':
      return <EmbedFields block={block} onChange={onChange} />
    case 'divider':
      return <div className="my-2 h-px w-full bg-white/20" aria-label="Divider" />
  }
}

function ListFields({
  block,
  autoFocus,
  onChange,
}: {
  block: Extract<LessonBlock, { type: 'list' }>
  autoFocus: boolean
  onChange: (b: LessonBlock) => void
}) {
  const setItem = (index: number, text: string) =>
    onChange({ ...block, items: block.items.map((item, i) => (i === index ? text : item)) })
  const removeItem = (index: number) =>
    onChange({ ...block, items: block.items.length === 1 ? [''] : block.items.filter((_, i) => i !== index) })
  const addItem = (after: number) =>
    onChange({ ...block, items: [...block.items.slice(0, after + 1), '', ...block.items.slice(after + 1)] })

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(['bullet', 'number'] as const).map((style) => {
          const Icon = style === 'bullet' ? List : ListOrdered
          return (
            <button
              key={style}
              type="button"
              onClick={() => onChange({ ...block, style })}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium',
                block.style === style ? 'border-white/40 bg-white text-black' : 'border-white/10 text-white/60 hover:bg-white/10',
              )}
            >
              <Icon className="h-3 w-3" />
              {style === 'bullet' ? 'Bullets' : 'Numbered'}
            </button>
          )
        })}
      </div>
      <ol className="space-y-1">
        {block.items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs text-white/40">{block.style === 'number' ? `${index + 1}.` : '•'}</span>
            <input
              autoFocus={autoFocus && index === 0}
              value={item}
              onChange={(e) => setItem(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem(index)
                }
                if (e.key === 'Backspace' && item === '' && block.items.length > 1) {
                  e.preventDefault()
                  removeItem(index)
                }
              }}
              placeholder="List item"
              className={cn(INLINE_FIELD, 'text-sm')}
            />
            <button type="button" onClick={() => removeItem(index)} aria-label="Remove item" className="rounded-md p-1 text-white/30 hover:bg-white/10 hover:text-white">
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => addItem(block.items.length - 1)} className="text-[11px] font-medium text-white/50 hover:text-white">
        + Add item
      </button>
    </div>
  )
}

function CalloutFields({
  block,
  autoFocus,
  onChange,
}: {
  block: Extract<LessonBlock, { type: 'callout' }>
  autoFocus: boolean
  onChange: (b: LessonBlock) => void
}) {
  const meta = TONE_META[block.tone]
  return (
    <div className={cn('space-y-2 rounded-xl border p-3', meta.className)}>
      <div className="flex gap-1">
        {CALLOUT_TONES.map((tone) => {
          const ToneIcon = TONE_META[tone].icon
          return (
            <button
              key={tone}
              type="button"
              onClick={() => onChange({ ...block, tone })}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium',
                block.tone === tone ? 'border-white/40 bg-white text-black' : 'border-white/10 text-white/60 hover:bg-white/10',
              )}
            >
              <ToneIcon className="h-3 w-3" />
              {TONE_META[tone].label}
            </button>
          )
        })}
      </div>
      <textarea
        autoFocus={autoFocus}
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        ref={(el) => {
          if (el) autosize(el)
        }}
        onInput={(e) => autosize(e.currentTarget)}
        placeholder="What should the learner keep in mind?"
        rows={2}
        className={cn(INLINE_FIELD, 'resize-none text-sm leading-relaxed')}
      />
    </div>
  )
}

function EmbedFields({ block, onChange }: { block: Extract<LessonBlock, { type: 'embed' }>; onChange: (b: LessonBlock) => void }) {
  const video = resolveLessonVideo(block.url)
  return (
    <div className="space-y-3">
      <div className="relative flex aspect-video max-h-64 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black">
        {video?.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : null}
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
          <Play className="h-5 w-5 text-black" />
        </span>
        <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
          {video ? VIDEO_PROVIDER_LABEL[video.provider] : 'Link'}
        </span>
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
  const video = trimmed ? resolveLessonVideo(trimmed) : null
  const isInvalid = trimmed.length > 0 && !video

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
            if (e.key === 'Enter' && video) onAdd(trimmed)
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Paste a YouTube, Vimeo or Loom link"
          className={cn(INLINE_FIELD, 'text-sm')}
        />
        <button
          type="button"
          onClick={() => video && onAdd(trimmed)}
          disabled={!video}
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
        {video ? `${VIDEO_PROVIDER_LABEL[video.provider]} video detected` : isInvalid ? 'Only YouTube, Vimeo and Loom links are supported' : 'Watch, youtu.be, Shorts, Vimeo and Loom share links all work'}
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
