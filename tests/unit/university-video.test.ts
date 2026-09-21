/**
 * University hosted-video resolution.
 *
 * A lesson embeds only the three providers it knows (YouTube, Vimeo, Loom),
 * and only over https, so a pasted link can never put an arbitrary origin in
 * an iframe. Every supported url shape maps to one canonical player url.
 */
import { resolveLessonVideo } from '@/lib/university/video'

describe('resolveLessonVideo', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/123456789', 'vimeo', '123456789'],
    ['https://player.vimeo.com/video/123456789', 'vimeo', '123456789'],
    [
      'https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184',
      'loom',
      '0281766fa2d04bb788eaf19e65135184',
    ],
    [
      'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184?sid=abc',
      'loom',
      '0281766fa2d04bb788eaf19e65135184',
    ],
  ])('resolves %s', (url, provider, videoId) => {
    const video = resolveLessonVideo(url)
    expect(video).not.toBeNull()
    expect(video?.provider).toBe(provider)
    expect(video?.videoId).toBe(videoId)
  })

  it('produces a player url on the provider host', () => {
    expect(resolveLessonVideo('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'
    )
    expect(resolveLessonVideo('https://vimeo.com/123456789')?.embedUrl).toBe(
      'https://player.vimeo.com/video/123456789'
    )
    expect(
      resolveLessonVideo('https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184')?.embedUrl
    ).toBe('https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184')
  })

  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.loom.com/share/not-a-loom-id',
    'https://evil.loom.com.attacker.io/share/0281766fa2d04bb788eaf19e65135184',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(resolveLessonVideo(url)).toBeNull()
  })
})
