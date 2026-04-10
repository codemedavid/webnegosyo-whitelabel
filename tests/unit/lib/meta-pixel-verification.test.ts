import {
  countMetaPixelInitOccurrences,
  verifyMetaPixelHtml,
} from '@/lib/meta-pixel-verification'

describe('meta pixel verification', () => {
  it('counts matching init calls for the expected pixel id', () => {
    const html = `
      <script>fbq('init', '939808131983849');</script>
      <script>fbq("init","939808131983849");</script>
      <script>fbq('init', '111111111111111');</script>
    `

    expect(countMetaPixelInitOccurrences(html, '939808131983849')).toBe(2)
  })

  it('passes when exactly one init call exists for the expected pixel id', () => {
    const html = `<script>fbq('init', '939808131983849');</script>`

    expect(verifyMetaPixelHtml(html, '939808131983849')).toEqual({
      occurrences: 1,
      ok: true,
    })
  })

  it('fails when the expected pixel id is missing', () => {
    const html = `<html><body>No pixel</body></html>`

    expect(verifyMetaPixelHtml(html, '939808131983849')).toEqual({
      occurrences: 0,
      ok: false,
    })
  })

  it('fails when duplicate init calls exist for the expected pixel id', () => {
    const html = `
      <script>fbq('init', '939808131983849');</script>
      <script>fbq('init', '939808131983849');</script>
    `

    expect(verifyMetaPixelHtml(html, '939808131983849')).toEqual({
      occurrences: 2,
      ok: false,
    })
  })
})
