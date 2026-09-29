import { LIMITS } from './constants'
import { safeMediaUrl } from './safe-values'

export type VideoSource =
  | { type: 'youtube'; embedUrl: string }
  | { type: 'vimeo'; embedUrl: string }
  | { type: 'file'; url: string }

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/
const VIMEO_ID = /^\d{4,15}$/

interface VideoOptions {
  autoplay: boolean
  muted: boolean
  loop: boolean
  controls: boolean
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
  if (url.pathname === '/watch') return url.searchParams.get('v')
  const match = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname)
  return match?.[1] ?? null
}

/** Turn a pasted video link into something safe to embed, or null. */
export function resolveVideo(raw: unknown, opts: VideoOptions): VideoSource | null {
  const href = safeMediaUrl(raw)
  if (!href) return null
  const url = new URL(href)
  const flags = (on: boolean) => (on ? '1' : '0')

  const yt = youtubeId(url)
  if (yt && YOUTUBE_ID.test(yt)) {
    const params = new URLSearchParams({
      autoplay: flags(opts.autoplay),
      mute: flags(opts.muted || opts.autoplay),
      controls: flags(opts.controls),
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
    })
    if (opts.loop) {
      params.set('loop', '1')
      params.set('playlist', yt)
    }
    return { type: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?${params}` }
  }

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).find((part) => VIMEO_ID.test(part))
    if (!id) return null
    const params = new URLSearchParams({
      autoplay: flags(opts.autoplay),
      muted: flags(opts.muted || opts.autoplay),
      loop: flags(opts.loop),
      controls: flags(opts.controls),
      playsinline: '1',
      dnt: '1',
    })
    return { type: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}?${params}` }
  }

  return { type: 'file', url: href }
}

export const EMBED_MESSAGE_TYPE = 'hb-embed-size'

/**
 * The sandboxed document for an Embed widget. The merchant's code runs in an
 * opaque origin (no allow-same-origin), so it cannot read the store's
 * cookies, storage or DOM, and cannot navigate the page. The appended script
 * only reports the content height so the frame can grow to fit.
 */
export function buildEmbedDocument(code: unknown, frameId: string): string {
  const body = typeof code === 'string' ? code.slice(0, LIMITS.embedLength) : ''
  const id = JSON.stringify(frameId).replace(/</g, '\\u003c')
  const reporter =
    '<script>(function(){var id=' + id + ';var last=0;function send(){var h=Math.ceil(Math.max(' +
    'document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));if(h!==last){last=h;' +
    "parent.postMessage({type:'" + EMBED_MESSAGE_TYPE + "',id:id,height:h},'*');}}" +
    "if(window.ResizeObserver){new ResizeObserver(send).observe(document.documentElement);}" +
    "window.addEventListener('load',send);setInterval(send,1000);send();})();</script>"
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_blank"><style>html,body{margin:0;padding:0;background:transparent;font-family:system-ui,sans-serif}</style>' +
    '</head><body>' + body + reporter + '</body></html>'
  )
}

/**
 * Sandbox flags for embeds. Deliberately WITHOUT allow-same-origin (would let
 * the code reach the store's cookies/DOM) and WITHOUT allow-top-navigation
 * (would let it redirect the store to a lookalike page).
 */
export const EMBED_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation'
