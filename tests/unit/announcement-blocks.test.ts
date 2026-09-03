/**
 * Platform "What's New" content model.
 *
 * A post is an ordered list of typed blocks (heading, paragraph, image,
 * video, embed) rather than HTML: the merchant app renders them natively and
 * nothing user-authored is ever interpreted as markup. The same rules run on
 * the web composer (before save) and in the app (before render), so a row
 * that passes here is a row the phone can draw.
 */
import {
  parseAnnouncementBlocks,
  parseAnnouncementInput,
  resolveVideoEmbed,
} from '@/lib/announcements/blocks'

describe('parseAnnouncementBlocks', () => {
  it('accepts every block type in order and keeps the order', () => {
    const result = parseAnnouncementBlocks([
      { type: 'heading', text: 'Kitchen Display is here' },
      { type: 'paragraph', text: 'Chits now print price-free.' },
      { type: 'image', url: 'https://ik.imagekit.io/x/kds.png', caption: 'The board' },
      { type: 'video', url: 'https://ik.imagekit.io/x/kds.mp4' },
      { type: 'embed', url: 'https://www.youtube.com/watch?v=abc123DEF45' },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'image',
      'video',
      'embed',
    ])
  })

  it('rejects an unknown block type', () => {
    const result = parseAnnouncementBlocks([{ type: 'html', html: '<b>x</b>' }])
    expect(result.ok).toBe(false)
  })

  it('rejects a non-array body', () => {
    expect(parseAnnouncementBlocks('not blocks').ok).toBe(false)
    expect(parseAnnouncementBlocks(null).ok).toBe(false)
  })

  it('rejects image and video urls that are not https', () => {
    expect(parseAnnouncementBlocks([{ type: 'image', url: 'javascript:alert(1)' }]).ok).toBe(
      false
    )
    expect(parseAnnouncementBlocks([{ type: 'video', url: 'http://x/y.mp4' }]).ok).toBe(false)
  })

  it('rejects an embed url from an unsupported provider', () => {
    const result = parseAnnouncementBlocks([{ type: 'embed', url: 'https://example.com/v/1' }])
    expect(result.ok).toBe(false)
  })

  it('rejects empty text blocks', () => {
    expect(parseAnnouncementBlocks([{ type: 'paragraph', text: '   ' }]).ok).toBe(false)
    expect(parseAnnouncementBlocks([{ type: 'heading', text: '' }]).ok).toBe(false)
  })
})

describe('resolveVideoEmbed', () => {
  it('parses a youtube watch url', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch?v=abc123DEF45')).toEqual({
      provider: 'youtube',
      videoId: 'abc123DEF45',
      watchUrl: 'https://www.youtube.com/watch?v=abc123DEF45',
      thumbnailUrl: 'https://img.youtube.com/vi/abc123DEF45/hqdefault.jpg',
    })
  })

  it('parses youtu.be and shorts urls', () => {
    expect(resolveVideoEmbed('https://youtu.be/abc123DEF45?t=4')?.videoId).toBe('abc123DEF45')
    expect(resolveVideoEmbed('https://youtube.com/shorts/abc123DEF45')?.videoId).toBe(
      'abc123DEF45'
    )
  })

  it('parses a vimeo url without a thumbnail', () => {
    expect(resolveVideoEmbed('https://vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      videoId: '123456789',
      watchUrl: 'https://vimeo.com/123456789',
      thumbnailUrl: null,
    })
  })

  it('returns null for anything else', () => {
    expect(resolveVideoEmbed('https://example.com/watch?v=abc')).toBeNull()
    expect(resolveVideoEmbed('not a url')).toBeNull()
  })
})

describe('parseAnnouncementInput', () => {
  const valid = {
    kind: 'post',
    title: 'Kitchen Display',
    summary: 'A board for the kitchen',
    coverImageUrl: 'https://ik.imagekit.io/x/cover.png',
    blocks: [{ type: 'paragraph', text: 'Hello' }],
    showPopup: true,
    audienceTenantIds: null,
    pushTitle: null,
    pushBody: null,
  }

  it('accepts a complete post', () => {
    const result = parseAnnouncementInput(valid)
    expect(result.ok).toBe(true)
  })

  it('requires a title', () => {
    expect(parseAnnouncementInput({ ...valid, title: '  ' }).ok).toBe(false)
  })

  it('lets a notice carry no blocks but a post must have at least one', () => {
    expect(parseAnnouncementInput({ ...valid, kind: 'notice', blocks: [] }).ok).toBe(true)
    expect(parseAnnouncementInput({ ...valid, kind: 'post', blocks: [] }).ok).toBe(false)
  })

  it('rejects an audience that is an empty list (that would reach nobody)', () => {
    expect(parseAnnouncementInput({ ...valid, audienceTenantIds: [] }).ok).toBe(false)
  })

  it('rejects a malformed tenant id in the audience', () => {
    expect(parseAnnouncementInput({ ...valid, audienceTenantIds: ['nope'] }).ok).toBe(false)
  })
})
