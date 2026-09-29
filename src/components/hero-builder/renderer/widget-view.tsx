'use client'

import type { MouseEvent, ReactNode } from 'react'

import { resolveVideo } from '@/lib/hero-builder/media'
import { safeHref, safeMediaUrl } from '@/lib/hero-builder/safe-values'
import { parseMarkup } from '@/lib/hero-builder/text-markup'
import type { Widget } from '@/lib/hero-builder/types'

import { HeroIcon } from '../icons'
import { CountdownBlock, EmbedBlock, HtmlBlock } from './live-blocks'

interface WidgetViewProps {
  widget: Widget
  isEditor: boolean
  /** Above-the-fold images load eagerly. */
  isPriority: boolean
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** In-page `#anchor` links scroll smoothly instead of jumping. */
function onAnchorClick(event: MouseEvent<HTMLAnchorElement>): void {
  const href = event.currentTarget.getAttribute('href') ?? ''
  if (!href.startsWith('#') || href.length < 2) return
  const target = document.getElementById(decodeURIComponent(href.slice(1)))
  if (!target) return
  event.preventDefault()
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function linkProps(href: unknown, newTab: unknown): { href: string; target?: string; rel?: string } | null {
  const safe = safeHref(href)
  if (!safe) return null
  return newTab === true ? { href: safe, target: '_blank', rel: 'noopener noreferrer' } : { href: safe }
}

function Placeholder({ show, label }: { show: boolean; label: string }) {
  return show ? <div className="hb-placeholder">{label}</div> : null
}

function Markup({ value }: { value: unknown }) {
  return (
    <>
      {parseMarkup(value).map((token, i) => {
        switch (token.type) {
          case 'break':
            return <br key={i} />
          case 'bold':
            return <strong key={i}>{token.text}</strong>
          case 'italic':
            return <em key={i}>{token.text}</em>
          case 'link': {
            const external = /^https?:/i.test(token.href)
            return (
              <a key={i} href={token.href} onClick={onAnchorClick} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {token.text}
              </a>
            )
          }
          default:
            return <span key={i}>{token.text}</span>
        }
      })}
    </>
  )
}

function Maybe({ link, children }: { link: ReturnType<typeof linkProps>; children: ReactNode }) {
  if (!link) return <>{children}</>
  return (
    <a {...link} onClick={onAnchorClick}>
      {children}
    </a>
  )
}

export function WidgetView({ widget, isEditor, isPriority }: WidgetViewProps): ReactNode {
  const c = widget.content
  switch (c.kind) {
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4', 'p'] as const).includes(c.tag) ? c.tag : 'h2'
      return (
        <Tag className="hb-heading">
          <Markup value={c.text} />
        </Tag>
      )
    }
    case 'text':
      return (
        <p className="hb-text">
          <Markup value={c.text} />
        </p>
      )
    case 'buttons': {
      const items = list<Extract<Widget['content'], { kind: 'buttons' }>['items'][number]>(c.items)
      if (!items.length) return <Placeholder show={isEditor} label="Add a button" />
      return (
        <div className="hb-btns">
          {items.map((item) => {
            const variant = ['solid', 'outline', 'ghost'].includes(item.variant) ? item.variant : 'solid'
            const link = linkProps(item.href, item.newTab) ?? { href: '#storefront-menu' }
            return (
              <a key={item.id} className={`hb-btn hb-btn--${variant}`} {...link} onClick={onAnchorClick}>
                {item.icon && <HeroIcon name={item.icon} />}
                <span>{text(item.label) || 'Button'}</span>
              </a>
            )
          })}
        </div>
      )
    }
    case 'image': {
      const src = safeMediaUrl(c.src)
      if (!src) return <Placeholder show={isEditor} label="Choose an image" />
      return (
        <Maybe link={linkProps(c.href, c.newTab)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- merchant URLs from any host */}
          <img src={src} alt={text(c.alt)} loading={isPriority ? 'eager' : 'lazy'} decoding="async" />
        </Maybe>
      )
    }
    case 'video': {
      const source = resolveVideo(c.url, {
        autoplay: !!c.autoplay,
        muted: c.muted !== false,
        loop: !!c.loop,
        controls: c.controls !== false,
      })
      if (!source) return <Placeholder show={isEditor} label="Paste a YouTube, Vimeo or .mp4 link" />
      return (
        <div className="hb-media">
          {source.type === 'file' ? (
            <video
              src={source.url}
              autoPlay={!!c.autoplay}
              muted={c.muted !== false || !!c.autoplay}
              loop={!!c.loop}
              controls={c.controls !== false}
              playsInline
              preload="metadata"
            />
          ) : (
            <iframe
              src={source.embedUrl}
              title="Video"
              loading={isPriority ? 'eager' : 'lazy'}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          )}
        </div>
      )
    }
    case 'icon':
      return (
        <Maybe link={linkProps(c.href, false)}>
          <span className="hb-icon-inner">
            <HeroIcon name={c.name} />
          </span>
        </Maybe>
      )
    case 'icon-list': {
      const items = list<{ id: string; icon: string; text: string }>(c.items)
      return (
        <ul className={`hb-list${c.layout === 'inline' ? ' hb-list--inline' : ''}`}>
          {items.map((item) => (
            <li key={item.id}>
              <HeroIcon name={item.icon} />
              <span>{text(item.text)}</span>
            </li>
          ))}
        </ul>
      )
    }
    case 'badge':
      return (
        <span className="hb-badge">
          {c.icon && <HeroIcon name={c.icon} />}
          <span>{text(c.text)}</span>
        </span>
      )
    case 'countdown':
      return <CountdownBlock target={text(c.target)} showLabels={c.showLabels !== false} expiredText={text(c.expiredText)} />
    case 'divider': {
      const style = ['dashed', 'dotted'].includes(c.lineStyle) ? ` hb-divider--${c.lineStyle}` : ''
      return <hr className={`hb-divider${style}`} />
    }
    case 'spacer':
      return null
    case 'gallery': {
      const images = list<{ id: string; src: string; alt: string }>(c.images)
        .map((img) => ({ ...img, src: safeMediaUrl(img.src) }))
        .filter((img): img is { id: string; src: string; alt: string } => !!img.src)
      if (!images.length) return <Placeholder show={isEditor} label="Add gallery images" />
      return (
        <div className="hb-gallery">
          {images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element -- merchant URLs from any host
            <img key={img.id} src={img.src} alt={text(img.alt)} loading="lazy" decoding="async" />
          ))}
        </div>
      )
    }
    case 'html':
      if (!text(c.html).trim()) return <Placeholder show={isEditor} label="Write some HTML & CSS" />
      return <HtmlBlock html={text(c.html)} />
    case 'embed':
      if (!text(c.code).trim()) return <Placeholder show={isEditor} label="Paste embed code (maps, forms, booking widgets…)" />
      return <EmbedBlock code={text(c.code)} height={Number(c.height) || 360} autoHeight={c.autoHeight !== false} />
    default:
      return null
  }
}
