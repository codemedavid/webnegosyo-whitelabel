/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { createSection, createWidget } from '@/lib/hero-builder/defaults'
import type { HeroDesignV5, Section, Widget, WidgetContent } from '@/lib/hero-builder/types'

import { ALL_WIDGET_KINDS, designOf } from './helpers'

function widgetOf(content: WidgetContent, extra: Partial<Widget> = {}): Widget {
  return { ...createWidget(content.kind), content, ...extra }
}

function sectionWith(widgets: Widget[], extra: Partial<Section> = {}): Section {
  const s = createSection([100])
  return { ...s, columns: [{ ...s.columns[0], widgets }], ...extra }
}

function renderDesign(design: HeroDesignV5, isEditor = false) {
  return render(<HeroBuilderRenderer design={design} isEditor={isEditor} />)
}

describe('HeroBuilderRenderer — structure', () => {
  it('renders each section and widget exactly once (no per-device duplicates)', () => {
    // Arrange
    const design = designOf([
      sectionWith([createWidget('heading'), createWidget('text')]),
      sectionWith([createWidget('buttons')]),
      createSection([50, 50]),
    ])

    // Act
    const { container } = renderDesign(design)

    // Assert
    expect(container.querySelectorAll('section.hb-section')).toHaveLength(3)
    expect(container.querySelectorAll('.hb-w')).toHaveLength(3)
    expect(container.querySelectorAll('.hb-heading')).toHaveLength(1)
    expect(container.querySelectorAll('style')).toHaveLength(1)
  })

  it('never gives a widget wrapper the same class as its inner element', () => {
    // Arrange: one of every kind, with content so each renders its inner element
    const widgets = ALL_WIDGET_KINDS.map((kind) => createWidget(kind)).map((w) =>
      w.content.kind === 'gallery'
        ? { ...w, content: { kind: 'gallery' as const, images: [{ id: 'g1', src: 'https://x.com/g.png', alt: '' }] } }
        : w.content.kind === 'embed'
          ? { ...w, content: { ...w.content, code: '<p>x</p>' } }
          : w,
    )

    // Act
    const { container } = renderDesign(designOf([sectionWith(widgets)]))

    // Assert
    for (const wrapper of container.querySelectorAll('.hb-w')) {
      for (const cls of wrapper.classList) {
        if (cls === 'hb-w' || /^n[0-9a-z]+$/.test(cls)) continue
        expect(cls).toMatch(/^hb-w--/)
        expect(wrapper.querySelector(`.${cls}`)).toBeNull()
      }
    }
    expect(container.querySelectorAll('.hb-gallery')).toHaveLength(1)
    expect(container.querySelectorAll('.hb-divider')).toHaveLength(1)
    expect(container.querySelectorAll('.hb-badge')).toHaveLength(1)
  })

  it('renders nothing on the storefront for an empty design', () => {
    const { container } = renderDesign(designOf([]))

    expect(container).toBeEmptyDOMElement()
  })

  it('still renders the editor canvas for an empty design', () => {
    const { container } = renderDesign(designOf([]), true)

    expect(container.querySelector('[data-branding-scope="storefront/hero"]')).not.toBeNull()
  })

  it('applies generated node classes and a scoped stylesheet without "<"', () => {
    const w = createWidget('heading')
    const design = designOf([sectionWith([{ ...w, style: { ...w.style, color: 'red;}</style><script>alert(1)</script>' } }])])

    const { container } = renderDesign(design)

    const style = container.querySelector('style')!.innerHTML
    expect(style).not.toContain('<')
    const root = container.firstElementChild as HTMLElement
    expect(style.startsWith(`.${root.classList[0]}{`)).toBe(true)
    expect(container.querySelector('.hb-heading')!.closest('.hb-w')!.className).toMatch(/\bn[0-9a-z]+\b/)
  })

  it('slugifies the section anchor into a safe id', () => {
    const design = designOf([sectionWith([], { anchor: '"><img src=x onerror=alert(1)> Our Menu' })])

    const { container } = renderDesign(design)

    expect(container.querySelector('section')!.id).toBe('img-srcx-onerroralert1-our-menu')
  })
})

describe('HeroBuilderRenderer — links', () => {
  it('renders buttons as <a> with safe hrefs and falls back for unsafe ones', () => {
    // Arrange
    const buttons = widgetOf({
      kind: 'buttons',
      items: [
        { id: 'b1', label: 'Site', href: 'https://x.com', newTab: true, variant: 'solid' },
        { id: 'b2', label: 'Menu', href: '#menu', newTab: false, variant: 'outline' },
        { id: 'b3', label: 'Evil', href: 'javascript:alert(1)', newTab: false, variant: 'ghost' },
        { id: 'b4', label: 'Evil2', href: ' JaVaScRiPt:alert(1)', newTab: true, variant: 'bogus' as never },
      ],
    })

    // Act
    const { getByText } = renderDesign(designOf([sectionWith([buttons])]))

    // Assert
    const site = getByText('Site').closest('a')!
    expect(site).toHaveAttribute('href', 'https://x.com/')
    expect(site).toHaveAttribute('target', '_blank')
    expect(site).toHaveAttribute('rel', 'noopener noreferrer')
    expect(getByText('Menu').closest('a')).toHaveAttribute('href', '#menu')
    expect(getByText('Menu').closest('a')).toHaveClass('hb-btn--outline')
    expect(getByText('Evil').closest('a')).toHaveAttribute('href', '#storefront-menu')
    const evil2 = getByText('Evil2').closest('a')!
    expect(evil2).toHaveAttribute('href', '#storefront-menu')
    expect(evil2).not.toHaveAttribute('target')
    expect(evil2).toHaveClass('hb-btn--solid')
  })

  it('renders markup links only for safe hrefs', () => {
    const text = widgetOf({ kind: 'text', text: 'A [good](https://x.com) and [bad](javascript:void0)' })

    const { container } = renderDesign(designOf([sectionWith([text])]))

    const links = container.querySelectorAll('.hb-text a')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://x.com/')
    expect(container.querySelector('.hb-text')!.textContent).toBe('A good and bad')
  })

  it('does not render an image with an http:// src or wrap it in a javascript: link', () => {
    const http = widgetOf({ kind: 'image', src: 'http://x.com/a.png', alt: '' })
    const linked = widgetOf({ kind: 'image', src: 'https://x.com/b.png', alt: 'B', href: 'javascript:alert(1)' })

    const { container } = renderDesign(designOf([sectionWith([http, linked])]))

    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', 'https://x.com/b.png')
    expect(imgs[0].closest('a')).toBeNull()
  })

  it('embeds YouTube through youtube-nocookie', () => {
    const video = widgetOf({ kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', autoplay: false, muted: true, loop: false, controls: true })

    const { container } = renderDesign(designOf([sectionWith([video])]))

    expect(container.querySelector('.hb-media iframe')!.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/)
  })
})

describe('HeroBuilderRenderer — isolated blocks', () => {
  it('runs embed code in a sandboxed iframe without allow-same-origin', () => {
    // Arrange
    const embed = widgetOf({ kind: 'embed', code: '<script>document.cookie</script><div>map</div>', height: 300, autoHeight: true })

    // Act
    const { container } = renderDesign(designOf([sectionWith([embed])]))

    // Assert
    const frame = container.querySelector('.hb-embed iframe')!
    const sandbox = frame.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(frame.getAttribute('srcdoc')).toContain('<div>map</div>')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect((frame as HTMLIFrameElement).style.height).toBe('300px')
  })

  it('renders the HTML block into a shadow root with scripts and handlers removed', () => {
    // Arrange
    const html = widgetOf({
      kind: 'html',
      html: '<style>@import url(https://evil.com/x.css); .promo{color:red}</style><div class="promo" onclick="alert(1)">Hi</div><script>alert(1)</script><img src="x" onerror="alert(2)">',
    })

    // Act
    const { container } = renderDesign(designOf([sectionWith([html])]))

    // Assert
    const host = container.querySelector('.hb-html') as HTMLElement
    expect(host.shadowRoot).not.toBeNull()
    const inner = host.shadowRoot!.innerHTML
    expect(inner).not.toContain('<script')
    expect(inner).not.toContain('onclick')
    expect(inner).not.toContain('onerror')
    expect(inner).not.toContain('@import')
    expect(inner).toContain('.promo{color:red}')
    expect(host.shadowRoot!.querySelector('.promo')!.textContent).toBe('Hi')
    expect(host.innerHTML).toBe('')
  })
})

describe('HeroBuilderRenderer — editor mode', () => {
  it('tags sections, columns and widgets with data-hb-id in the editor', () => {
    // Arrange
    const heading = createWidget('heading')
    const s = sectionWith([heading])

    // Act
    const { container } = renderDesign(designOf([s]), true)

    // Assert
    expect(container.querySelector(`[data-hb-id="${s.id}"]`)).toHaveAttribute('data-hb-kind', 'section')
    expect(container.querySelector(`[data-hb-id="${s.columns[0].id}"]`)).toHaveAttribute('data-hb-kind', 'column')
    expect(container.querySelector(`[data-hb-id="${heading.id}"]`)).toHaveAttribute('data-hb-kind', 'widget')
  })

  it('shows a placeholder in empty columns and for empty widgets in the editor', () => {
    const design = designOf([createSection([50, 50]), sectionWith([createWidget('image')])])

    const { container, getAllByText, getByText } = renderDesign(design, true)

    expect(container.querySelectorAll('[data-hb-empty="true"]')).toHaveLength(2)
    expect(getAllByText('Drop or add elements here')).toHaveLength(2)
    expect(getByText('Choose an image')).toBeInTheDocument()
  })

  it('adds no editor attributes or placeholders on the storefront', () => {
    const design = designOf([createSection([50, 50]), sectionWith([createWidget('image')])])

    const { container } = renderDesign(design)

    expect(container.querySelector('[data-hb-id]')).toBeNull()
    expect(container.querySelector('.hb-placeholder')).toBeNull()
  })
})

describe('HeroBuilderRenderer — icon names', () => {
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'renders the fallback icon instead of crashing for the inherited key %s',
    (name) => {
      // Arrange — the save schema accepts any alphanumeric icon name
      const design = designOf([sectionWith([widgetOf({ kind: 'icon', name })])])

      // Act
      const { container } = renderDesign(design)

      // Assert
      expect(container.querySelector('.hb-w svg')).not.toBeNull()
    },
  )
})
