'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Link2, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'
import { MAX_RESOURCES, type LessonResource } from '@/lib/university/blocks'

interface Props {
  resources: LessonResource[]
  onChange: (resources: LessonResource[]) => void
}

const UPLOAD_FOLDER = '/platform/university/resources'
const MAX_FILE_BYTES = 25 * 1024 * 1024
const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'

function fileTypeOf(name: string): string | undefined {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return match ? match[1] : undefined
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,8}$/i, '')
}

/**
 * Documents and links attached to a lesson. Files upload to ImageKit like
 * every other platform asset; links are just labelled https urls. Every
 * change returns a new array.
 */
export function ResourcePanel({ resources, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isAddingLink, setIsAddingLink] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const isFull = resources.length >= MAX_RESOURCES

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Files must be 25 MB or smaller')
      return
    }
    setIsUploading(true)
    try {
      const uploaded = await uploadImageToImageKit(file, { folder: UPLOAD_FOLDER, fileName: file.name })
      onChange([
        ...resources,
        { kind: 'file', label: stripExtension(file.name) || file.name, url: uploaded.url, fileType: fileTypeOf(file.name) },
      ])
      toast.success('Document attached')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const addLink = () => {
    const label = linkLabel.trim()
    const url = linkUrl.trim()
    if (!label || !url.startsWith('https://')) {
      toast.error('A link needs a label and an https:// url')
      return
    }
    onChange([...resources, { kind: 'link', label, url }])
    setLinkLabel('')
    setLinkUrl('')
    setIsAddingLink(false)
  }

  const rename = (index: number, label: string) =>
    onChange(resources.map((resource, i) => (i === index ? { ...resource, label } : resource)))
  const remove = (index: number) => onChange(resources.filter((_, i) => i !== index))

  return (
    <div className="space-y-3">
      {resources.length === 0 && !isAddingLink ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-5 text-center text-xs text-white/45">
          Attach worksheets, templates, PDFs or links learners can open alongside the lesson.
        </p>
      ) : null}

      <ul className="space-y-2">
        {resources.map((resource, index) => {
          const Icon = resource.kind === 'file' ? FileText : Link2
          return (
            <li key={`${resource.url}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/70">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <input
                  value={resource.label}
                  onChange={(event) => rename(index, event.target.value)}
                  aria-label="Resource label"
                  className="w-full bg-transparent text-sm font-medium text-white focus:outline-none"
                />
                <a href={resource.url} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-white/40 hover:text-white/70">
                  {resource.kind === 'file' && resource.fileType ? `${resource.fileType.toUpperCase()} · ` : ''}
                  {resource.url}
                </a>
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove ${resource.label}`}
                className="rounded-md p-1.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>

      {isAddingLink ? (
        <div className="space-y-2 rounded-xl border border-white/25 bg-white/[0.04] p-3">
          <input autoFocus value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label, e.g. Menu pricing worksheet" className={FIELD} />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLink()}
            placeholder="https://…"
            inputMode="url"
            className={FIELD}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAddingLink(false)} className="rounded-xl px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white">
              Cancel
            </button>
            <button type="button" onClick={addLink} className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90">
              Add link
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isUploading || isFull}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50',
          )}
        >
          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {isUploading ? 'Uploading…' : 'Upload document'}
        </button>
        <button
          type="button"
          onClick={() => setIsAddingLink(true)}
          disabled={isAddingLink || isFull}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Add link
        </button>
        {isFull ? <span className="self-center text-[11px] text-white/40">Up to {MAX_RESOURCES} resources per lesson</span> : null}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.zip"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
