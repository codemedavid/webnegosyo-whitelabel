/* eslint-disable @next/next/no-img-element */
import { Play } from 'lucide-react'
import { resolveVideoEmbed, type AnnouncementBlock } from '@/lib/announcements/blocks'

interface Props {
  title: string
  summary: string | null
  coverImageUrl: string | null
  blocks: AnnouncementBlock[]
}

/**
 * A phone-shaped rendering of the post, block for block, so the author sees
 * roughly what the merchant app will draw before publishing. Mirrors
 * `webnegosyo-app/components/AnnouncementBlocks.tsx`.
 */
export function AnnouncementPreview({ title, summary, coverImageUrl, blocks }: Props) {
  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-white/15 bg-white text-neutral-900 shadow-2xl">
      {coverImageUrl ? (
        <img src={coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
      ) : null}
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-xl font-bold leading-tight">{title || 'Untitled post'}</h3>
          {summary ? <p className="mt-1 text-sm text-neutral-500">{summary}</p> : null}
        </div>
        {blocks.length === 0 ? (
          <p className="text-sm text-neutral-400">Add a block to see it here.</p>
        ) : (
          blocks.map((block, index) => <PreviewBlock key={index} block={block} />)
        )}
      </div>
    </div>
  )
}

function PreviewBlock({ block }: { block: AnnouncementBlock }) {
  switch (block.type) {
    case 'heading':
      return <h4 className="text-base font-semibold">{block.text || '…'}</h4>
    case 'paragraph':
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{block.text || '…'}</p>
    case 'image':
      return (
        <figure>
          <img src={block.url} alt={block.caption ?? ''} className="w-full rounded-xl" />
          {block.caption ? <figcaption className="mt-1 text-xs text-neutral-500">{block.caption}</figcaption> : null}
        </figure>
      )
    case 'video':
      return (
        <figure>
          <video src={block.url} controls className="w-full rounded-xl bg-black" />
          {block.caption ? <figcaption className="mt-1 text-xs text-neutral-500">{block.caption}</figcaption> : null}
        </figure>
      )
    case 'embed': {
      const embed = resolveVideoEmbed(block.url)
      return (
        <figure>
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-900">
            {embed?.thumbnailUrl ? (
              <img src={embed.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            ) : null}
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
              <Play className="h-5 w-5 text-neutral-900" />
            </span>
          </div>
          <figcaption className="mt-1 text-xs text-neutral-500">
            {block.caption || (embed ? `Opens in ${embed.provider === 'youtube' ? 'YouTube' : 'Vimeo'}` : block.url)}
          </figcaption>
        </figure>
      )
    }
  }
}
