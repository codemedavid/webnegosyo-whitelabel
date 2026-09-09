'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react'
import { Bell, ChevronLeft, Play, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveVideoEmbed, type AnnouncementBlock, type AnnouncementKind } from '@/lib/announcements/blocks'
import { GENERIC_ANNOUNCEMENT_BODY } from '@/lib/push/announcement-push'

interface Props {
  kind: AnnouncementKind
  title: string
  summary: string | null
  coverImageUrl: string | null
  blocks: AnnouncementBlock[]
  showPopup: boolean
  pushTitle: string | null
  pushBody: string | null
}

type Surface = 'article' | 'popup' | 'push'

const SURFACE_LABEL: Record<Surface, string> = {
  article: 'Article',
  popup: 'Popup',
  push: 'Notification',
}

const PHONE_SCREEN_HEIGHT = 640
const PREVIEW_DATE = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/**
 * A phone-shaped rendering of every surface the merchant will meet: the article
 * screen, the greeting popup, and the lock-screen notification. Mirrors
 * `webnegosyo-app/components/AnnouncementBlocks.tsx`, `WhatsNewPopup.tsx`, and
 * the push copy precedence in `src/lib/push/announcement-push.ts`.
 */
export function AnnouncementPreview(props: Props) {
  const surfaces: Surface[] = props.kind === 'post' ? ['article', 'popup', 'push'] : ['push']
  const [surface, setSurface] = useState<Surface>(surfaces[0])

  useEffect(() => {
    if (!surfaces.includes(surface)) setSurface(surfaces[0])
    // surfaces is derived from kind; re-running on kind is what we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.kind])

  const isPopupOff = surface === 'popup' && !props.showPopup

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Merchant sees</p>
        {surfaces.length > 1 ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {surfaces.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSurface(option)}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                  surface === option ? 'bg-white text-black' : 'text-white/60 hover:text-white',
                )}
              >
                {SURFACE_LABEL[option]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <PhoneFrame dark={surface === 'push'}>
        {surface === 'article' ? <ArticleSurface {...props} /> : null}
        {surface === 'popup' ? <PopupSurface {...props} /> : null}
        {surface === 'push' ? <PushSurface {...props} /> : null}
      </PhoneFrame>

      {isPopupOff ? (
        <p className="text-center text-xs text-amber-300/90">Popup is switched off for this post, so merchants will only find it in the inbox.</p>
      ) : (
        <p className="text-center text-xs text-white/40">
          {surface === 'article' && 'Reached from the popup, the inbox, or a tapped notification.'}
          {surface === 'popup' && 'Greets once, the next time the merchant opens the app.'}
          {surface === 'push' && 'Delivered when you press Send notification.'}
        </p>
      )}
    </div>
  )
}

function PhoneFrame({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.6rem] border border-white/15 bg-neutral-900 p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
      <div
        style={{ height: PHONE_SCREEN_HEIGHT }}
        className={cn('relative flex flex-col overflow-hidden rounded-[2.1rem]', dark ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-900')}
      >
        <div className="absolute left-1/2 top-2.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className={cn('relative z-10 flex shrink-0 items-center justify-between px-6 pb-1 pt-3.5 text-[11px] font-semibold', dark ? 'text-white' : 'text-neutral-900')}>
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Wifi className="h-3 w-3" />
            <span className="inline-block h-2.5 w-5 rounded-[3px] border border-current p-px">
              <span className="block h-full w-4/5 rounded-[1px] bg-current" />
            </span>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className={cn('pointer-events-none absolute bottom-1.5 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full', dark ? 'bg-white/60' : 'bg-black/70')} />
      </div>
    </div>
  )
}

function ArticleSurface({ title, summary, coverImageUrl, blocks }: Props) {
  return (
    <div>
      <div className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-neutral-900">
        <ChevronLeft className="h-4 w-4" />
        What&apos;s New
      </div>
      <div className="space-y-4 px-4 pb-10 pt-1">
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
        ) : null}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{PREVIEW_DATE}</p>
          <h3 className="mt-1 text-xl font-bold leading-tight">{title || 'Untitled post'}</h3>
          {summary ? <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{summary}</p> : null}
        </div>
        {blocks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
            Blocks you add will render here.
          </div>
        ) : (
          blocks.map((block, index) => <PreviewBlock key={index} block={block} />)
        )}
      </div>
    </div>
  )
}

function PopupSurface({ title, summary, coverImageUrl, showPopup }: Props) {
  return (
    <div className="relative h-full bg-neutral-100">
      <div className="space-y-3 p-4 opacity-60">
        <div className="h-5 w-24 rounded bg-neutral-300" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl bg-white" />
          <div className="h-20 rounded-2xl bg-white" />
        </div>
        <div className="h-32 rounded-2xl bg-white" />
        <div className="h-32 rounded-2xl bg-white" />
      </div>
      <div className={cn('absolute inset-0 flex items-center justify-center bg-black/55 p-5 transition-opacity', !showPopup && 'opacity-40')}>
        <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl">
          {coverImageUrl ? <img src={coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" /> : null}
          <div className="space-y-2 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">What&apos;s new</p>
            <h3 className="text-lg font-bold leading-tight">{title || 'Untitled post'}</h3>
            {summary ? <p className="text-sm leading-relaxed text-neutral-500">{summary}</p> : null}
            <div className="pt-2">
              <div className="rounded-xl bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white">Read more</div>
              <p className="pt-2.5 text-center text-sm font-semibold text-neutral-500">Maybe later</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PushSurface({ kind, title, summary, pushTitle, pushBody }: Props) {
  const effectiveTitle = pushTitle || title || 'Untitled'
  const effectiveBody = pushBody || summary || GENERIC_ANNOUNCEMENT_BODY
  return (
    <div className="flex h-full flex-col bg-[radial-gradient(120%_80%_at_50%_0%,#1f2a44_0%,#0a0a0a_70%)] px-4">
      <div className="pt-10 text-center">
        <p className="text-sm font-medium text-white/70">{PREVIEW_DATE}</p>
        <p className="text-6xl font-semibold tracking-tight text-white">9:41</p>
      </div>
      <div className="mt-8 rounded-2xl bg-white/15 p-3 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-black">W</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-white">{effectiveTitle}</p>
              <span className="shrink-0 text-[11px] text-white/60">now</span>
            </div>
            <p className="line-clamp-3 text-[13px] leading-snug text-white/85">{effectiveBody}</p>
          </div>
        </div>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/45">
        <Bell className="h-3 w-3" />
        Tapping opens {kind === 'post' ? 'the article' : 'the inbox'}
      </p>
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
