/**
 * @jest-environment jsdom
 */
import { LIMITS } from '@/lib/hero-builder/constants'
import { sanitizeCss, sanitizeWidgetHtml } from '@/lib/hero-builder/html-sanitize'

/** Parse sanitized output into a detached container for structural checks. */
function parse(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('sanitizeWidgetHtml — removals', () => {
  it('removes <script> elements and their content', () => {
    const out = sanitizeWidgetHtml('<p>hi</p><script>alert(1)</script><SCRIPT src="https://x.com/a.js"></SCRIPT>')

    expect(out).toBe('<p>hi</p>')
  })

  it('removes inline event handlers', () => {
    const el = parse(sanitizeWidgetHtml('<img src="https://x.com/a.png" onerror="alert(1)"><div onclick="x()" onmouseover="y()">t</div>'))

    expect(el.querySelector('img')?.getAttribute('onerror')).toBeNull()
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://x.com/a.png')
    expect(el.querySelector('div')?.attributes).toHaveLength(0)
  })

  it.each([
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'java&#x09;script:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.com/x',
    'vbscript:x',
  ])('drops href %p', (href) => {
    const el = parse(sanitizeWidgetHtml(`<a href="${href}">x</a>`))

    expect(el.querySelector('a')?.getAttribute('href') ?? null).toBeNull()
  })

  it.each(['https://x.com/', 'mailto:a@b.co', 'tel:+63917', '#menu', '/menu'])('keeps href %p', (href) => {
    const el = parse(sanitizeWidgetHtml(`<a href="${href}">x</a>`))

    expect(el.querySelector('a')?.getAttribute('href')).toBe(href)
  })

  it.each([
    ['iframe', '<iframe src="https://evil.com"></iframe>'],
    ['frame set', '<frameset><frame src="https://evil.com"></frameset>'],
    ['form', '<form action="https://evil.com"><input name="card"><button>Pay</button></form>'],
    ['base', '<base href="https://evil.com/">'],
    ['object', '<object data="https://evil.com/x.swf"></object>'],
    ['embed', '<embed src="https://evil.com/x.swf">'],
    ['link', '<link rel="stylesheet" href="https://evil.com/x.css">'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.com">'],
    ['template', '<template><script>alert(1)</script></template>'],
  ])('removes %s', (_label, html) => {
    const el = parse(sanitizeWidgetHtml(`<p>keep</p>${html}`))

    expect(el.querySelector('iframe, frame, frameset, form, input, button, base, object, embed, link, meta, template, script')).toBeNull()
    expect(el.textContent).toContain('keep')
  })

  it('removes srcdoc, formaction and ping attributes', () => {
    const el = parse(sanitizeWidgetHtml('<a href="https://x.com" ping="https://evil.com">x</a><div srcdoc="<script>" formaction="https://e.com">y</div>'))

    expect(el.querySelector('[ping], [srcdoc], [formaction]')).toBeNull()
  })

  it('strips data-* attributes', () => {
    expect(parse(sanitizeWidgetHtml('<div data-x="1">t</div>')).querySelector('[data-x]')).toBeNull()
  })

  it('does not execute an SVG onload payload', () => {
    const out = sanitizeWidgetHtml('<svg onload="alert(1)"><circle r="4"/></svg>')

    expect(out).not.toContain('onload')
  })
})

describe('sanitizeWidgetHtml — styles and links', () => {
  it('keeps a <style> element but strips @import', () => {
    // Act
    const out = sanitizeWidgetHtml('<style>@import url("https://evil.com/x.css"); .promo { color: red }</style><div class="promo">x</div>')

    // Assert
    const style = parse(out).querySelector('style')
    expect(style).not.toBeNull()
    expect(style!.textContent).not.toContain('@import')
    expect(style!.textContent).toContain('.promo { color: red }')
    expect(parse(out).querySelector('.promo')).not.toBeNull()
  })

  it('strips javascript:, expression() and -moz-binding from inline styles', () => {
    const el = parse(sanitizeWidgetHtml('<div style="background:url(javascript:alert(1));width:expression(alert(1));-moz-binding:url(x);color:red">x</div>'))

    const style = el.querySelector('div')?.getAttribute('style') ?? ''
    expect(style).not.toMatch(/javascript:/i)
    expect(style).not.toMatch(/expression\s*\(/i)
    expect(style).not.toMatch(/-moz-binding/i)
    expect(style).toContain('color:red')
  })

  it('adds rel="noopener noreferrer" to target=_blank links', () => {
    const el = parse(sanitizeWidgetHtml('<a href="https://x.com" target="_blank">x</a>'))

    const a = el.querySelector('a')!
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('overrides a merchant-supplied rel on target=_blank links', () => {
    const el = parse(sanitizeWidgetHtml('<a href="https://x.com" target="_blank" rel="opener">x</a>'))

    expect(el.querySelector('a')!.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('does not keep a named target that would open a window with an opener', () => {
    const a = parse(sanitizeWidgetHtml('<a href="https://x.com" target="popup">x</a>')).querySelector('a')!

    expect(a.getAttribute('target')).not.toBe('popup')
  })
})

describe('sanitizeWidgetHtml — input handling', () => {
  it.each([null, undefined, 42, '', {}])('returns an empty string for %p', (input) => {
    expect(sanitizeWidgetHtml(input)).toBe('')
  })

  it('truncates input to LIMITS.htmlLength before sanitizing', () => {
    const out = sanitizeWidgetHtml('a'.repeat(LIMITS.htmlLength + 100))

    expect(out).toHaveLength(LIMITS.htmlLength)
  })
})

describe('sanitizeCss', () => {
  it('removes @import in any case', () => {
    expect(sanitizeCss('@IMPORT url(x.css);a{b:c}')).toBe('a{b:c}')
  })

  it('neutralises expression(), javascript:, -moz-binding and behavior', () => {
    const out = sanitizeCss('a{width:expression(alert(1));background:url(javascript:x);-moz-binding:url(x);behavior:url(x.htc);color:red}')

    expect(out).not.toMatch(/expression\s*\(|javascript:|-moz-binding|behavior/i)
    expect(out).toContain('color:red')
  })
})

describe('sanitizeWidgetHtml — target normalisation', () => {
  it.each(['_top', '_parent', '_self', 'popup'])('removes target=%p', (target) => {
    const a = parse(sanitizeWidgetHtml(`<a href="https://x.com" target="${target}">x</a>`)).querySelector('a')!

    expect(a.hasAttribute('target')).toBe(false)
  })

  it('normalises an upper-case _BLANK and adds rel', () => {
    const a = parse(sanitizeWidgetHtml('<a href="https://x.com" target="_BLANK">x</a>')).querySelector('a')!

    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('removes target from non-link elements', () => {
    const el = parse(sanitizeWidgetHtml('<div target="_blank">x</div>'))

    expect(el.querySelector('[target]')).toBeNull()
  })
})

describe('sanitizeWidgetHtml — benign attributes survive', () => {
  it('keeps plain presentational attribute values (width, colspan, dir, loading)', () => {
    // Act
    const el = parse(sanitizeWidgetHtml(
      '<img src="https://x.com/a.png" width="200" loading="lazy"><table><tr><td colspan="2" dir="rtl">x</td></tr></table>',
    ))

    // Assert
    expect(el.querySelector('img')?.getAttribute('width')).toBe('200')
    expect(el.querySelector('img')?.getAttribute('loading')).toBe('lazy')
    expect(el.querySelector('td')?.getAttribute('colspan')).toBe('2')
    expect(el.querySelector('td')?.getAttribute('dir')).toBe('rtl')
  })

  it.each(['//evil.com/a.png', '/\\evil.com/a.png', 'javascript:alert(1)', 'vbscript:x'])(
    'still drops img src %p',
    (src) => {
      const img = parse(sanitizeWidgetHtml(`<img src="${src}">`)).querySelector('img')

      expect(img?.getAttribute('src') ?? null).toBeNull()
    },
  )
})

describe('sanitizeWidgetHtml namespaces', () => {
  it('drops SVG and MathML (HTML-only profile)', () => {
    const out = sanitizeWidgetHtml('<p>ok</p><svg><a href="#x"><text>t</text></a><animate attributeName="href" values="javascript:alert(1)"/></svg><math><mi>x</mi></math>')
    expect(out).toContain('<p>ok</p>')
    expect(out).not.toMatch(/<svg|<math|<animate/i)
  })

  it('still keeps <style> blocks', () => {
    expect(sanitizeWidgetHtml('<style>p{color:red}</style><p>x</p>')).toContain('<style>')
  })
})
