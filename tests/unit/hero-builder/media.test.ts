import { LIMITS } from '@/lib/hero-builder/constants'
import { buildEmbedDocument, EMBED_MESSAGE_TYPE, EMBED_SANDBOX, resolveVideo } from '@/lib/hero-builder/media'

const OPTS = { autoplay: false, muted: true, loop: false, controls: true }
const YT_ID = 'dQw4w9WgXcQ'

describe('resolveVideo — YouTube', () => {
  it.each([
    `https://www.youtube.com/watch?v=${YT_ID}`,
    `https://m.youtube.com/watch?v=${YT_ID}&t=10`,
    `https://youtube.com/shorts/${YT_ID}`,
    `https://youtu.be/${YT_ID}?si=abc`,
    `https://www.youtube.com/embed/${YT_ID}`,
    `https://www.youtube-nocookie.com/embed/${YT_ID}`,
    `https://www.youtube.com/live/${YT_ID}`,
  ])('turns %p into a youtube-nocookie embed', (url) => {
    // Act
    const source = resolveVideo(url, OPTS)

    // Assert
    expect(source?.type).toBe('youtube')
    const embed = new URL((source as { embedUrl: string }).embedUrl)
    expect(embed.origin).toBe('https://www.youtube-nocookie.com')
    expect(embed.pathname).toBe(`/embed/${YT_ID}`)
    expect(embed.searchParams.get('rel')).toBe('0')
    expect(embed.searchParams.get('playsinline')).toBe('1')
  })

  it('forces mute when autoplaying and adds a playlist for loop', () => {
    const source = resolveVideo(`https://youtu.be/${YT_ID}`, { autoplay: true, muted: false, loop: true, controls: false })

    const embed = new URL((source as { embedUrl: string }).embedUrl)
    expect(embed.searchParams.get('autoplay')).toBe('1')
    expect(embed.searchParams.get('mute')).toBe('1')
    expect(embed.searchParams.get('controls')).toBe('0')
    expect(embed.searchParams.get('loop')).toBe('1')
    expect(embed.searchParams.get('playlist')).toBe(YT_ID)
  })

  it('does not embed a YouTube URL with a malformed id', () => {
    const source = resolveVideo('https://www.youtube.com/watch?v=%22%3E%3Cscript%3E', OPTS)

    expect(source?.type).not.toBe('youtube')
  })
})

describe('resolveVideo — Vimeo and files', () => {
  it.each(['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789', 'https://vimeo.com/channels/staff/123456789'])(
    'turns %p into a player.vimeo.com embed',
    (url) => {
      const source = resolveVideo(url, OPTS)

      expect(source?.type).toBe('vimeo')
      const embed = new URL((source as { embedUrl: string }).embedUrl)
      expect(embed.origin).toBe('https://player.vimeo.com')
      expect(embed.pathname).toBe('/video/123456789')
      expect(embed.searchParams.get('dnt')).toBe('1')
    },
  )

  it('returns null for a Vimeo URL without a numeric id', () => {
    expect(resolveVideo('https://vimeo.com/about', OPTS)).toBeNull()
  })

  it('treats a direct https mp4 as a file', () => {
    expect(resolveVideo('https://cdn.example.com/clip.mp4', OPTS)).toEqual({ type: 'file', url: 'https://cdn.example.com/clip.mp4' })
  })

  it.each([
    `http://www.youtube.com/watch?v=${YT_ID}`,
    'http://cdn.example.com/clip.mp4',
    'javascript:alert(1)',
    'data:video/mp4;base64,AAAA',
    '',
    null,
  ])('rejects %p', (url) => {
    expect(resolveVideo(url, OPTS)).toBeNull()
  })
})

describe('buildEmbedDocument', () => {
  it('wraps the code in a full document with the height reporter', () => {
    // Act
    const doc = buildEmbedDocument('<div id="map"></div>', 'frame1')

    // Assert
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain('<div id="map"></div>')
    expect(doc).toContain('var id="frame1"')
    expect(doc).toContain(`type:'${EMBED_MESSAGE_TYPE}'`)
    expect(doc).toContain('parent.postMessage(')
    expect(doc).toContain('ResizeObserver')
    expect(doc).toContain('<base target="_blank">')
  })

  it('escapes a hostile frame id so it cannot close the reporter script', () => {
    // Arrange
    const hostileId = '"</script><script>alert(1)</script>'

    // Act
    const doc = buildEmbedDocument('', hostileId)

    // Assert
    expect(doc.match(/<\/script>/gi)).toHaveLength(1)
    expect(doc).not.toContain('<script>alert(1)')
    expect(doc).toContain('\\u003c/script>')
    expect(doc).toContain('var id="\\"\\u003c/script>')
  })

  it('treats non-string code as empty and truncates oversize code', () => {
    expect(buildEmbedDocument({ evil: true }, 'f')).toContain('<body><script>')
    const long = buildEmbedDocument('a'.repeat(LIMITS.embedLength + 500), 'f')
    expect(long).toContain('a'.repeat(LIMITS.embedLength))
    expect(long).not.toContain('a'.repeat(LIMITS.embedLength + 1))
  })
})

describe('EMBED_SANDBOX', () => {
  const flags = EMBED_SANDBOX.split(/\s+/)

  it('allows scripts in an opaque origin', () => {
    expect(flags).toContain('allow-scripts')
  })

  it('never grants same-origin or top navigation', () => {
    expect(flags).not.toContain('allow-same-origin')
    expect(EMBED_SANDBOX).not.toContain('allow-top-navigation')
    expect(EMBED_SANDBOX).not.toContain('allow-modals')
  })
})
