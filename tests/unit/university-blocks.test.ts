/**
 * SmartMenu University content model.
 *
 * Lesson bodies are typed blocks rather than HTML, resources are files or
 * links, and every course / module / lesson submission is validated at the
 * server boundary with the same rules the reader re-checks on render.
 */
import {
  lessonKind,
  parseCourseInput,
  parseLessonBlocks,
  parseLessonInput,
  parseLessonResources,
  parseModuleInput,
  slugify,
} from '@/lib/university/blocks'

const LOOM = 'https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184'

describe('slugify', () => {
  it.each([
    ['Getting Started with SmartMenu', 'getting-started-with-smartmenu'],
    ['  Menu Engineering: BCG 101!  ', 'menu-engineering-bcg-101'],
    ['Café Résumé', 'cafe-resume'],
    ['---', ''],
  ])('turns %p into %p', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})

describe('parseLessonBlocks', () => {
  it('accepts every block type and keeps the order', () => {
    const result = parseLessonBlocks([
      { type: 'heading', text: 'Why upsells matter' },
      { type: 'paragraph', text: 'Average order value is the lever.' },
      { type: 'list', style: 'bullet', items: ['Stars', 'Plowhorses'] },
      { type: 'callout', tone: 'tip', text: 'Start with your top seller.' },
      { type: 'image', url: 'https://ik.imagekit.io/x/matrix.png', caption: 'The matrix' },
      { type: 'embed', url: LOOM },
      { type: 'divider' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'callout',
      'image',
      'embed',
      'divider',
    ])
  })

  it('rejects an unknown block type and unsupported embeds', () => {
    expect(parseLessonBlocks([{ type: 'html', html: '<b>x</b>' }]).ok).toBe(false)
    expect(parseLessonBlocks([{ type: 'embed', url: 'https://example.com/v' }]).ok).toBe(false)
  })

  it('rejects an empty list and a blank paragraph', () => {
    expect(parseLessonBlocks([{ type: 'list', style: 'bullet', items: [] }]).ok).toBe(false)
    expect(parseLessonBlocks([{ type: 'paragraph', text: '   ' }]).ok).toBe(false)
  })
})

describe('parseLessonResources', () => {
  it('accepts files and links over https only', () => {
    const ok = parseLessonResources([
      { kind: 'file', label: 'Menu template', url: 'https://ik.imagekit.io/x/template.pdf', fileType: 'pdf' },
      { kind: 'link', label: 'Help center', url: 'https://www.webnegosyo.com/support' },
    ])
    expect(ok.ok).toBe(true)
    expect(parseLessonResources([{ kind: 'link', label: 'x', url: 'http://insecure.example' }]).ok).toBe(false)
    expect(parseLessonResources([{ kind: 'file', label: '', url: 'https://x.example/a.pdf' }]).ok).toBe(false)
  })
})

describe('parseCourseInput', () => {
  const valid = {
    slug: 'getting-started',
    title: 'Getting started',
    description: null,
    coverImageUrl: null,
    level: 'beginner',
    category: 'Basics',
  }

  it('accepts a well-formed course', () => {
    expect(parseCourseInput(valid).ok).toBe(true)
  })

  it.each([
    ['a bad slug', { ...valid, slug: 'Getting Started' }],
    ['an unknown level', { ...valid, level: 'expert' }],
    ['a blank title', { ...valid, title: '' }],
  ])('rejects %s', (_label, input) => {
    expect(parseCourseInput(input).ok).toBe(false)
  })
})

describe('parseModuleInput', () => {
  it('needs a title', () => {
    expect(parseModuleInput({ title: 'Week 1', description: null }).ok).toBe(true)
    expect(parseModuleInput({ title: ' ', description: null }).ok).toBe(false)
  })
})

describe('parseLessonInput', () => {
  const valid = {
    slug: 'welcome',
    title: 'Welcome',
    summary: null,
    videoUrl: LOOM,
    durationMinutes: 5,
    blocks: [],
    resources: [],
  }

  it('accepts a video-only lesson and an article-only lesson', () => {
    expect(parseLessonInput(valid).ok).toBe(true)
    expect(
      parseLessonInput({ ...valid, videoUrl: null, blocks: [{ type: 'paragraph', text: 'Read me' }] }).ok
    ).toBe(true)
  })

  it('rejects a lesson with neither a video nor content', () => {
    const result = parseLessonInput({ ...valid, videoUrl: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('video or at least one content block')
  })

  it('rejects a video link it cannot embed', () => {
    expect(parseLessonInput({ ...valid, videoUrl: 'https://example.com/video.mp4' }).ok).toBe(false)
  })

  it('bounds the duration', () => {
    expect(parseLessonInput({ ...valid, durationMinutes: 601 }).ok).toBe(false)
    expect(parseLessonInput({ ...valid, durationMinutes: 4.5 }).ok).toBe(false)
  })
})

describe('lessonKind', () => {
  it('is video when a video url is set, article otherwise', () => {
    expect(lessonKind({ videoUrl: LOOM })).toBe('video')
    expect(lessonKind({ videoUrl: null })).toBe('article')
  })
})
