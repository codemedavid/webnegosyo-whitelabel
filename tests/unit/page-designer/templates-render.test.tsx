/**
 * Every Page Designer template renders through the editor's sample runtime
 * (the canvas and the gallery thumbnails, drawn at the 390px phone width)
 * without throwing, and shows each of its page blocks.
 */

import { render, cleanup } from '@testing-library/react'

import { PAGE_IDS } from '@/lib/page-designer/pages'
import { PAGE_META } from '@/lib/page-designer/pages'
import { PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import type { PageId } from '@/lib/page-designer/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))
jest.mock('@/hooks/use-loyalty-progress', () => ({
  useLoyaltyProgress: () => ({ offer: null, card: null, isLoading: false, error: null, refresh: jest.fn() }),
}))

// next/jest leaves static imports ahead of jest.mock: load the components lazily.
/* eslint-disable @typescript-eslint/no-require-imports -- lazy on purpose, see above */
const load = () => ({
  ...(require('@/components/hero-builder/renderer/hero-builder-renderer') as typeof import('@/components/hero-builder/renderer/hero-builder-renderer')),
  ...(require('@/components/hero-builder/renderer/page-runtime') as typeof import('@/components/hero-builder/renderer/page-runtime')),
  ...(require('@/components/page-designer/samples') as typeof import('@/components/page-designer/samples')),
})
/* eslint-enable @typescript-eslint/no-require-imports */

const PHONE_WIDTH = 390

const cases = PAGE_IDS.flatMap((page) => PAGE_TEMPLATES[page].map((t) => [`${page} / ${t.id}`, page, t.id] as const))

function renderTemplate(page: PageId, templateId: string, isEditor: boolean) {
  const { HeroBuilderRenderer, PageRuntimeProvider, SAMPLE_BLOCKS, sampleTokens } = load()
  const template = PAGE_TEMPLATES[page].find((t) => t.id === templateId)!
  const state = PAGE_META[page].states[0]?.id ?? null
  return render(
    <PageRuntimeProvider value={{ page, state, tokens: sampleTokens(page, 'Island Silog'), labels: {}, blocks: SAMPLE_BLOCKS[page] }}>
      <div style={{ width: PHONE_WIDTH }}>
        <HeroBuilderRenderer design={template.build()} isEditor={isEditor} viewportHeight={694} />
      </div>
    </PageRuntimeProvider>,
  )
}

describe('Page Designer templates render with sample data', () => {
  afterEach(cleanup)

  it.each(cases)('%s renders in the editor and in the gallery', (_, page, id) => {
    const template = PAGE_TEMPLATES[page].find((t) => t.id === id)!
    const blockCount = template
      .build()
      .sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))
      .filter((w) => w.kind === 'page-block').length
    const editor = renderTemplate(page, id, true)
    expect(editor.container.querySelectorAll('[data-hb-id]').length).toBeGreaterThan(blockCount)
    // No block falls back to the "no renderer" placeholder.
    expect(editor.queryByText(/shows here/)).toBeNull()
    editor.unmount()
    expect(() => renderTemplate(page, id, false).unmount()).not.toThrow()
  })
})
