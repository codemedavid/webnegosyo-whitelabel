'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Heading, ImagePlus, Link2, Text, Trash2, Video } from 'lucide-react'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'
import { resolveVideoEmbed, type AnnouncementBlock } from '@/lib/announcements/blocks'

interface Props {
  blocks: AnnouncementBlock[]
  onChange: (blocks: AnnouncementBlock[]) => void
}

const UPLOAD_FOLDER = '/platform/whats-new'

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'

function moveBlock(blocks: AnnouncementBlock[], from: number, to: number): AnnouncementBlock[] {
  if (to < 0 || to >= blocks.length) return blocks
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Ordered typed blocks; every change returns a new array (no in-place edits). */
export function BlockEditor({ blocks, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingKind, setPendingKind] = useState<'image' | 'video' | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const append = (block: AnnouncementBlock) => onChange([...blocks, block])
  const update = (index: number, block: AnnouncementBlock) =>
    onChange(blocks.map((existing, i) => (i === index ? block : existing)))
  const remove = (index: number) => onChange(blocks.filter((_, i) => i !== index))

  const pickFile = (kind: 'image' | 'video') => {
    setPendingKind(kind)
    fileInput.current?.click()
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !pendingKind) return
    setIsUploading(true)
    try {
      const uploaded = await uploadImageToImageKit(file, { folder: UPLOAD_FOLDER })
      append({ type: pendingKind, url: uploaded.url })
      toast.success(`${pendingKind === 'image' ? 'Image' : 'Video'} uploaded`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setPendingKind(null)
    }
  }

  const addEmbed = () => {
    const url = window.prompt('Paste a YouTube or Vimeo link')
    if (!url) return
    if (!resolveVideoEmbed(url)) {
      toast.error('Only YouTube and Vimeo links are supported')
      return
    }
    append({ type: 'embed', url: url.trim() })
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div key={index} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{block.type}</span>
            <div className="flex items-center gap-1">
              <IconButton label="Move up" onClick={() => onChange(moveBlock(blocks, index, index - 1))} disabled={index === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Move down" onClick={() => onChange(moveBlock(blocks, index, index + 1))} disabled={index === blocks.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Remove block" onClick={() => remove(index)} danger>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <BlockFields block={block} onChange={(next) => update(index, next)} />
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <AddButton icon={Heading} label="Heading" onClick={() => append({ type: 'heading', text: '' })} />
        <AddButton icon={Text} label="Paragraph" onClick={() => append({ type: 'paragraph', text: '' })} />
        <AddButton icon={ImagePlus} label={isUploading && pendingKind === 'image' ? 'Uploading…' : 'Image'} onClick={() => pickFile('image')} disabled={isUploading} />
        <AddButton icon={Video} label={isUploading && pendingKind === 'video' ? 'Uploading…' : 'Video file'} onClick={() => pickFile('video')} disabled={isUploading} />
        <AddButton icon={Link2} label="YouTube / Vimeo" onClick={addEmbed} />
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={pendingKind === 'video' ? 'video/*' : 'image/*'}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

function BlockFields({ block, onChange }: { block: AnnouncementBlock; onChange: (b: AnnouncementBlock) => void }) {
  if (block.type === 'heading') {
    return (
      <input
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        placeholder="Section heading"
        className={FIELD}
      />
    )
  }
  if (block.type === 'paragraph') {
    return (
      <textarea
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        placeholder="Write the paragraph…"
        rows={4}
        className={FIELD}
      />
    )
  }
  const embed = block.type === 'embed' ? resolveVideoEmbed(block.url) : null
  return (
    <div className="space-y-2">
      <p className="truncate text-xs text-white/50">
        {embed ? `${embed.provider} · ${embed.videoId}` : block.url}
      </p>
      <input
        value={block.caption ?? ''}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Caption (optional)"
        className={FIELD}
      />
    </div>
  )
}

function AddButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
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
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'rounded-lg p-1.5 text-red-400/80 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30'
          : 'rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30'
      }
    >
      {children}
    </button>
  )
}
