'use client'

import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'

import type { PageBlockContent, Widget } from '@/lib/hero-builder/types'
import { pageBlockDef } from '@/lib/page-designer/blocks'
import { applyTokens, resolveBlockOption, resolveBlockText } from '@/lib/page-designer/text'
import type { PageBlockDef, PageId } from '@/lib/page-designer/types'

/** What a page block's renderer receives: its wording and switches, already resolved. */
export interface PageBlockRenderProps {
  def: PageBlockDef
  /** The slot's wording (owner → store label → default), tokens applied. */
  text: (slot: string) => string
  option: (key: string) => string | boolean | undefined
  isEditor: boolean
}

export type PageBlockRenderer = ComponentType<PageBlockRenderProps>

/**
 * What a Page Designer page gives the shared renderer: which page it is, its
 * current state (for "Show when"), the values behind `{tokens}`, the store's
 * labels, and a renderer per block. The storefront passes live renderers; the
 * editor passes sample ones. The engine never imports checkout or tracking.
 */
export interface PageRuntime {
  page: PageId
  /** e.g. `preparing`; null = page without states (checkout). */
  state: string | null
  tokens: Readonly<Record<string, string>>
  labels: Readonly<Record<string, string | undefined>>
  blocks: Readonly<Partial<Record<string, PageBlockRenderer>>>
  /**
   * Editor only: the store row the page paints from, with the Look tab's
   * unsaved edits in it, so sample blocks preview them. The storefront's
   * live blocks read the real store and leave this unset.
   */
  store?: Readonly<Record<string, unknown>>
  /**
   * Step-by-step / accordion layouts: why the customer can't leave a step
   * holding these blocks yet ("Please fill in: Phone"), or null. Pages
   * without it let every step through (the final button still checks).
   */
  stepProblem?: (blockIds: readonly string[]) => string | null
  /**
   * Editor only: extra panels for a block's Content tab, by block id (the
   * checkout's customer block → its form editor). Rendered under Settings.
   */
  blockPanels?: Readonly<Partial<Record<string, ComponentType<{ widget: Widget }>>>>
}

const PageRuntimeContext = createContext<PageRuntime | null>(null)

export function PageRuntimeProvider({ value, children }: { value: PageRuntime; children: ReactNode }) {
  return <PageRuntimeContext.Provider value={value}>{children}</PageRuntimeContext.Provider>
}

export function usePageRuntime(): PageRuntime | null {
  return useContext(PageRuntimeContext)
}

/** Whether a node limited by "Show when" shows in the page's current state. */
export function isShownInState(showWhen: readonly string[] | undefined, state: string | null): boolean {
  if (!showWhen?.length || state === null) return true
  return showWhen.includes(state)
}

export function PageBlockView({ content, isEditor }: { content: PageBlockContent; isEditor: boolean }): ReactNode {
  const runtime = usePageRuntime()
  const def = runtime ? pageBlockDef(runtime.page, content.block) : null
  const Renderer = def ? runtime?.blocks[def.id] : undefined
  const { texts: rawTexts, options: rawOptions } = content
  const props = useMemo<PageBlockRenderProps | null>(() => {
    if (!def || !runtime) return null
    // Stored designs are untrusted: a missing or mistyped map reads as empty.
    const texts = rawTexts && typeof rawTexts === 'object' ? rawTexts : {}
    const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {}
    return {
      def,
      text: (slot) => applyTokens(resolveBlockText(def, slot, texts, runtime.labels), runtime.tokens),
      option: (key) => resolveBlockOption(def, key, options),
      isEditor,
    }
  }, [def, runtime, rawTexts, rawOptions, isEditor])

  if (!props || !Renderer) {
    return isEditor ? <div className="hb-placeholder">{def ? `${def.label} shows here` : 'This block belongs to another page'}</div> : null
  }
  return <Renderer {...props} />
}
