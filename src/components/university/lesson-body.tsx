/* eslint-disable @next/next/no-img-element */
import { AlertTriangle, Info, Lightbulb, type LucideIcon } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import type { CalloutTone, LessonBlock } from '@/lib/university/blocks'
import { VideoPlayer } from './video-player'

const TONE: Record<CalloutTone, { icon: LucideIcon; label: string; color: string; bg: string }> = {
  info: { icon: Info, label: 'Note', color: '#1D5FA8', bg: '#E8F1FB' },
  tip: { icon: Lightbulb, label: 'Tip', color: SMARTMENU.green, bg: '#E7F5EC' },
  warning: { icon: AlertTriangle, label: 'Watch out', color: '#B45309', bg: '#FCEFD9' },
}

/** Draws a lesson body block by block. Text is text; nothing is interpreted as markup. */
export function LessonBody({ blocks }: { blocks: LessonBlock[] }) {
  if (blocks.length === 0) return null
  return (
    <div className="prose-lesson space-y-5 text-[17px]" style={{ color: SMARTMENU.cocoa }}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <h2 className="font-display pt-4 text-2xl font-bold leading-tight" style={{ color: SMARTMENU.ink }}>
          {block.text}
        </h2>
      )
    case 'paragraph':
      return <Paragraphs text={block.text} />
    case 'list': {
      const Tag = block.style === 'number' ? 'ol' : 'ul'
      return (
        <Tag className={block.style === 'number' ? 'list-decimal space-y-2 pl-6' : 'list-disc space-y-2 pl-6'}>
          {block.items.map((item, index) => (
            <li key={index} className="leading-relaxed">
              {item}
            </li>
          ))}
        </Tag>
      )
    }
    case 'callout': {
      const tone = TONE[block.tone]
      const Icon = tone.icon
      return (
        <aside className="flex gap-3 rounded-2xl border px-5 py-4" style={{ backgroundColor: tone.bg, borderColor: `${tone.color}33` }}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: tone.color }} />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.color }}>
              {tone.label}
            </p>
            <Paragraphs text={block.text} />
          </div>
        </aside>
      )
    }
    case 'image':
      return (
        <figure>
          <img src={block.url} alt={block.caption ?? ''} className="w-full rounded-2xl border" style={{ borderColor: `${SMARTMENU.ink}14` }} loading="lazy" />
          {block.caption ? (
            <figcaption className="mt-2 text-center text-sm italic" style={{ color: `${SMARTMENU.cocoa}B3` }}>
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      )
    case 'embed':
      return (
        <figure>
          <VideoPlayer url={block.url} title={block.caption ?? 'Lesson video'} />
          {block.caption ? (
            <figcaption className="mt-2 text-center text-sm italic" style={{ color: `${SMARTMENU.cocoa}B3` }}>
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      )
    case 'divider':
      return <hr className="my-2 border-0 border-t" style={{ borderColor: `${SMARTMENU.ink}1F` }} />
  }
}

/** Blank lines in a paragraph block become separate paragraphs. */
function Paragraphs({ text }: { text: string }) {
  const parts = text.split(/\n{2,}/).filter((part) => part.trim().length > 0)
  return (
    <>
      {parts.map((part, index) => (
        <p key={index} className="whitespace-pre-line">
          {part}
        </p>
      ))}
    </>
  )
}
