/**
 * Platform "What's New" content model — shared by the superadmin composer and
 * (as a synced copy) the merchant app's renderer:
 * `webnegosyo-app/lib/announcements/blocks.ts`. Change both.
 *
 * A post body is an ordered list of typed blocks, never HTML. The app draws
 * each block with a native component, so nothing an author types is ever
 * interpreted as markup, and a row that passes `parseAnnouncementBlocks` is a
 * row the phone can render. Video is deliberately two things: an uploaded
 * file (`video`) and a hosted link (`embed`) — the app opens both externally
 * until it ships an in-app player.
 */
import { z } from 'zod'

export const ANNOUNCEMENT_KINDS = ['post', 'notice'] as const
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number]

export const MAX_TITLE_LENGTH = 200
export const MAX_SUMMARY_LENGTH = 500
export const MAX_TEXT_BLOCK_LENGTH = 5000
export const MAX_BLOCKS = 60

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith('https://'), 'Must be an https:// url')

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max)

export type VideoEmbedProvider = 'youtube' | 'vimeo'

export interface VideoEmbed {
  provider: VideoEmbedProvider
  videoId: string
  /** The canonical page to open when the phone has no in-app player. */
  watchUrl: string
  /** A still to draw behind the play button; null when the provider has none we can guess. */
  thumbnailUrl: string | null
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/
const VIMEO_ID = /^\d{5,15}$/

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
  const fromQuery = url.searchParams.get('v')
  if (fromQuery) return fromQuery
  const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)
  return match ? match[1] : null
}

function vimeoIdFrom(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
  const match = url.pathname.match(/(\d+)/)
  return match ? match[1] : null
}

/** The hosted video a link points at, or null when it is not one we support. */
export function resolveVideoEmbed(input: string): VideoEmbed | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const youtubeId = youtubeIdFrom(url)
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return {
      provider: 'youtube',
      videoId: youtubeId,
      watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    }
  }

  const vimeoId = vimeoIdFrom(url)
  if (vimeoId && VIMEO_ID.test(vimeoId)) {
    return {
      provider: 'vimeo',
      videoId: vimeoId,
      watchUrl: `https://vimeo.com/${vimeoId}`,
      thumbnailUrl: null,
    }
  }

  return null
}

const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: nonEmptyText(MAX_TITLE_LENGTH) }),
  z.object({ type: z.literal('paragraph'), text: nonEmptyText(MAX_TEXT_BLOCK_LENGTH) }),
  z.object({
    type: z.literal('image'),
    url: httpsUrl,
    caption: z.string().trim().max(MAX_SUMMARY_LENGTH).optional(),
  }),
  z.object({
    type: z.literal('video'),
    url: httpsUrl,
    caption: z.string().trim().max(MAX_SUMMARY_LENGTH).optional(),
  }),
  z.object({
    type: z.literal('embed'),
    url: httpsUrl.refine((value) => resolveVideoEmbed(value) !== null, 'Only YouTube and Vimeo links are supported'),
    caption: z.string().trim().max(MAX_SUMMARY_LENGTH).optional(),
  }),
])

export type AnnouncementBlock = z.infer<typeof blockSchema>
export type AnnouncementBlockType = AnnouncementBlock['type']

const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS)

export type ParseResult<T> = { ok: true } & T | { ok: false; error: string }

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid content'
  const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
  return `${path}${issue.message}`
}

/** The blocks a stored/submitted body contains, or why it cannot be shown. */
export function parseAnnouncementBlocks(
  input: unknown
): ParseResult<{ blocks: AnnouncementBlock[] }> {
  const parsed = blocksSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return { ok: true, blocks: parsed.data }
}

const announcementInputSchema = z
  .object({
    kind: z.enum(ANNOUNCEMENT_KINDS),
    title: nonEmptyText(MAX_TITLE_LENGTH),
    summary: z.string().trim().max(MAX_SUMMARY_LENGTH).nullable(),
    coverImageUrl: httpsUrl.nullable(),
    blocks: blocksSchema,
    showPopup: z.boolean(),
    /** null = every store; a list must name at least one. */
    audienceTenantIds: z.array(z.string().uuid()).min(1).nullable(),
    pushTitle: z.string().trim().max(MAX_TITLE_LENGTH).nullable(),
    pushBody: z.string().trim().max(MAX_SUMMARY_LENGTH).nullable(),
  })
  .refine((value) => value.kind === 'notice' || value.blocks.length > 0, {
    message: 'A post needs at least one content block',
    path: ['blocks'],
  })

export type AnnouncementInput = z.infer<typeof announcementInputSchema>

/** The composer's submission, validated at the server boundary. */
export function parseAnnouncementInput(input: unknown): ParseResult<{ input: AnnouncementInput }> {
  const parsed = announcementInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return { ok: true, input: parsed.data }
}
