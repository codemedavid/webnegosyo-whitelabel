/**
 * SmartMenu University content model.
 *
 * A lesson body is an ordered list of typed blocks, never HTML: the page
 * draws each block with its own component, so nothing an author types is
 * interpreted as markup. Resources are a flat list of uploaded files and
 * outside links. The same schemas validate the editor's submission at the
 * server boundary and re-check stored rows before render.
 */
import { z } from 'zod'
import { resolveLessonVideo } from './video'

export const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type CourseLevel = (typeof COURSE_LEVELS)[number]

export const COURSE_LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const CALLOUT_TONES = ['info', 'tip', 'warning'] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]

export const MAX_TITLE_LENGTH = 200
export const MAX_SLUG_LENGTH = 80
export const MAX_SUMMARY_LENGTH = 500
export const MAX_DESCRIPTION_LENGTH = 1000
export const MAX_CATEGORY_LENGTH = 80
export const MAX_TEXT_BLOCK_LENGTH = 5000
export const MAX_LIST_ITEMS = 30
export const MAX_BLOCKS = 80
export const MAX_RESOURCES = 20
export const MAX_DURATION_MINUTES = 600

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith('https://'), 'Must be an https:// url')

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max)

const slug = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens')

/** A url-safe slug derived from a title; empty when nothing survives. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
}

/**
 * `slugify` for a field the author is still typing into.
 *
 * The finished form strips trailing hyphens, which run on every keystroke eats
 * the separator the moment it is pressed — so `getting-` collapses back to
 * `getting` and a multi-word slug can never be typed by hand. This keeps a
 * single trailing hyphen and is otherwise identical; the value is normalised
 * again by `slugify` on save, and the schema still rejects anything malformed.
 */
export function slugifyWhileTyping(input: string): string {
  const endsWithSeparator = /[^a-z0-9]$/i.test(input)
  const slug = slugify(input)
  if (!slug || !endsWithSeparator) return slug
  return slug.length < MAX_SLUG_LENGTH ? `${slug}-` : slug
}

const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: nonEmptyText(MAX_TITLE_LENGTH) }),
  z.object({ type: z.literal('paragraph'), text: nonEmptyText(MAX_TEXT_BLOCK_LENGTH) }),
  z.object({
    type: z.literal('list'),
    style: z.enum(['bullet', 'number']),
    items: z.array(nonEmptyText(MAX_TEXT_BLOCK_LENGTH)).min(1).max(MAX_LIST_ITEMS),
  }),
  z.object({
    type: z.literal('callout'),
    tone: z.enum(CALLOUT_TONES),
    text: nonEmptyText(MAX_TEXT_BLOCK_LENGTH),
  }),
  z.object({
    type: z.literal('image'),
    url: httpsUrl,
    caption: z.string().trim().max(MAX_SUMMARY_LENGTH).optional(),
  }),
  z.object({
    type: z.literal('embed'),
    url: httpsUrl.refine((value) => resolveLessonVideo(value) !== null, 'Only YouTube, Vimeo and Loom links are supported'),
    caption: z.string().trim().max(MAX_SUMMARY_LENGTH).optional(),
  }),
  z.object({ type: z.literal('divider') }),
])

export type LessonBlock = z.infer<typeof blockSchema>
export type LessonBlockType = LessonBlock['type']

const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS)

const resourceSchema = z.object({
  kind: z.enum(['file', 'link']),
  label: nonEmptyText(MAX_TITLE_LENGTH),
  url: httpsUrl,
  /** Lowercase extension or short type hint ("pdf", "xlsx"); files only. */
  fileType: z.string().trim().max(16).optional(),
})

export type LessonResource = z.infer<typeof resourceSchema>

const resourcesSchema = z.array(resourceSchema).max(MAX_RESOURCES)

export type ParseResult<T> = ({ ok: true } & T) | { ok: false; error: string }

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid content'
  const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
  return `${path}${issue.message}`
}

function parseWith<S extends z.ZodTypeAny, K extends string>(
  schema: S,
  key: K,
  input: unknown
): ParseResult<Record<K, z.infer<S>>> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return { ok: true, [key]: parsed.data } as { ok: true } & Record<K, z.infer<S>>
}

/** The blocks a stored/submitted body contains, or why it cannot be shown. */
export function parseLessonBlocks(input: unknown): ParseResult<{ blocks: LessonBlock[] }> {
  return parseWith(blocksSchema, 'blocks', input)
}

/** The resources a stored/submitted list contains, or why it cannot be shown. */
export function parseLessonResources(input: unknown): ParseResult<{ resources: LessonResource[] }> {
  return parseWith(resourcesSchema, 'resources', input)
}

const courseInputSchema = z.object({
  slug,
  title: nonEmptyText(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).nullable(),
  coverImageUrl: httpsUrl.nullable(),
  level: z.enum(COURSE_LEVELS),
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH).nullable(),
})

export type CourseInput = z.infer<typeof courseInputSchema>

export function parseCourseInput(input: unknown): ParseResult<{ input: CourseInput }> {
  return parseWith(courseInputSchema, 'input', input)
}

const moduleInputSchema = z.object({
  title: nonEmptyText(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_SUMMARY_LENGTH).nullable(),
})

export type ModuleInput = z.infer<typeof moduleInputSchema>

export function parseModuleInput(input: unknown): ParseResult<{ input: ModuleInput }> {
  return parseWith(moduleInputSchema, 'input', input)
}

const lessonInputSchema = z
  .object({
    slug,
    title: nonEmptyText(MAX_TITLE_LENGTH),
    summary: z.string().trim().max(MAX_SUMMARY_LENGTH).nullable(),
    videoUrl: httpsUrl
      .refine((value) => resolveLessonVideo(value) !== null, 'Only YouTube, Vimeo and Loom links are supported')
      .nullable(),
    durationMinutes: z.number().int().min(0).max(MAX_DURATION_MINUTES).nullable(),
    blocks: blocksSchema,
    resources: resourcesSchema,
  })
  .refine((value) => value.videoUrl !== null || value.blocks.length > 0, {
    message: 'A lesson needs a video or at least one content block',
    path: ['blocks'],
  })

export type LessonInput = z.infer<typeof lessonInputSchema>

export function parseLessonInput(input: unknown): ParseResult<{ input: LessonInput }> {
  return parseWith(lessonInputSchema, 'input', input)
}

/** What a lesson mainly is, for icons and badges. */
export function lessonKind(lesson: { videoUrl: string | null }): 'video' | 'article' {
  return lesson.videoUrl ? 'video' : 'article'
}
