import { render, screen } from '@testing-library/react'

import { createWidget } from '@/lib/hero-builder/defaults'
import type { Widget } from '@/lib/hero-builder/types'
import { blockDef } from '@/lib/page-designer/blocks'
import { createPageBlock } from '@/lib/page-designer/design-blocks'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageBlockRenderProps, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'

import { column, designOf, section } from '../hero-builder/helpers'

function Back({ text }: PageBlockRenderProps) {
  return <button type="button">{text('label')}</button>
}

const runtime = (state: string | null, extra: Partial<PageRuntime> = {}): PageRuntime => ({
  page: 'tracking',
  state,
  tokens: { name: 'Maria', store: 'Lola’s' },
  labels: { 'tracking.back': 'Menu please' },
  blocks: { 'tracking.back': Back },
  ...extra,
})

const textWidget = (id: string, value: string, showWhen?: string[]): Widget => ({
  ...createWidget('text'),
  id,
  content: { kind: 'text', text: value },
  ...(showWhen ? { showWhen } : {}),
})

const design = designOf([
  section('s', [
    column('c', [
      { ...createPageBlock(blockDef('tracking.back')!), id: 'b' },
      textWidget('t-prep', 'Cooking for {name} at {store}', ['preparing']),
      textWidget('t-all', 'Always here'),
    ]),
  ]),
])

describe('Page Designer rendering', () => {
  it('renders a page block through the page’s renderer, with label fallback and tokens', () => {
    render(
      <PageRuntimeProvider value={runtime('preparing')}>
        <HeroBuilderRenderer design={design} />
      </PageRuntimeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Menu please' })).toBeInTheDocument()
    expect(screen.getByText('Cooking for Maria at Lola’s')).toBeInTheDocument()
    expect(screen.getByText('Always here')).toBeInTheDocument()
  })

  it('leaves "Show when" nodes out of other states on the storefront', () => {
    render(
      <PageRuntimeProvider value={runtime('ready')}>
        <HeroBuilderRenderer design={design} />
      </PageRuntimeProvider>,
    )
    expect(screen.queryByText(/Cooking for/)).not.toBeInTheDocument()
    expect(screen.getByText('Always here')).toBeInTheDocument()
  })

  it('keeps off-state nodes in the editor, marked so they can be faded', () => {
    const { container } = render(
      <PageRuntimeProvider value={runtime('ready')}>
        <HeroBuilderRenderer design={design} isEditor />
      </PageRuntimeProvider>,
    )
    expect(container.querySelector('[data-hb-id="t-prep"]')?.getAttribute('data-hb-state-off')).toBe('true')
  })

  it('renders nothing for a page block outside a page (hero / welcome storefront)', () => {
    const { container } = render(<HeroBuilderRenderer design={design} />)
    expect(container.querySelector('button')).toBeNull()
    // Without a page, {name} stays as typed and show-when is ignored.
    expect(screen.getByText('Cooking for {name} at {store}')).toBeInTheDocument()
  })

  it('shows a labelled placeholder in the editor when the page has no renderer for a block', () => {
    render(
      <PageRuntimeProvider value={runtime(null, { blocks: {} })}>
        <HeroBuilderRenderer design={design} isEditor />
      </PageRuntimeProvider>,
    )
    expect(screen.getByText('Back to menu shows here')).toBeInTheDocument()
  })
})
