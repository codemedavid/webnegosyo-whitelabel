'use client'

import { memo, useId, useMemo } from 'react'

import { buildDesignCss } from '@/lib/hero-builder/css'
import { safeAnchor, safeMediaUrl } from '@/lib/hero-builder/safe-values'
import type { Column, HeroDesignV5, Section, Widget } from '@/lib/hero-builder/types'

import { PageLayout, ScrollingSections } from './page-layout'
import { isShownForOrder, isShownInState, usePageRuntime } from './page-runtime'
import { WidgetView } from './widget-view'

export interface HeroBuilderRendererProps {
  design: HeroDesignV5
  /** Editor canvas: tags nodes for selection and shows hidden/empty nodes. */
  isEditor?: boolean
  className?: string
  /** Template thumbnails: fixed px height for "fill the screen" sections. */
  viewportHeight?: number
}

interface NodeContext {
  classes: Record<string, string>
  isEditor: boolean
  /** Page Designer state ("preparing"…) for "Show when"; null = no states. */
  pageState: string | null
  /** The order's type for "Show for"; null = unknown. */
  orderKind: string | null
}

/** Both page conditions a section or widget can carry. */
function isNodeShown(node: Pick<Widget, 'showWhen' | 'showFor'>, pageState: string | null, orderKind: string | null): boolean {
  return isShownInState(node.showWhen, pageState) && isShownForOrder(node.showFor, orderKind)
}

function editorAttrs(ctx: NodeContext, id: string, kind: 'section' | 'column' | 'widget') {
  return ctx.isEditor ? { 'data-hb-id': id, 'data-hb-kind': kind } : {}
}

/**
 * "Show when": off-state nodes are left out of the storefront; the editor
 * keeps them (faded) so they stay selectable.
 */
function stateAttrs(ctx: NodeContext, node: Pick<Widget, 'showWhen' | 'showFor'>): { skip: boolean; attrs: Record<string, string> } {
  if (isNodeShown(node, ctx.pageState, ctx.orderKind)) return { skip: false, attrs: {} }
  return ctx.isEditor ? { skip: false, attrs: { 'data-hb-state-off': 'true' } } : { skip: true, attrs: {} }
}

/** The first mp4 any device layer asks for; CSS shows it only where used. */
function sectionVideo(section: Section): string | null {
  for (const layer of [section.style, section.tablet, section.mobile]) {
    const bg = layer?.background
    if (bg?.type === 'video') {
      const url = safeMediaUrl(bg.videoUrl)
      if (url) return url
    }
  }
  return null
}

function WidgetNode({ widget, ctx, isPriority }: { widget: Widget; ctx: NodeContext; isPriority: boolean }) {
  const state = stateAttrs(ctx, widget)
  if (state.skip) return null
  return (
    // `hb-w--<kind>`, not `hb-<kind>`: the inner elements already use
    // hb-heading / hb-text / hb-badge / hb-divider / hb-gallery / hb-html, and
    // sharing the class made the base sheet style the wrapper too (a 3-column
    // grid around the gallery, a second divider line).
    <div className={`hb-w hb-w--${widget.kind} ${ctx.classes[widget.id] ?? ''}`} {...editorAttrs(ctx, widget.id, 'widget')} {...state.attrs}>
      <WidgetView widget={widget} isEditor={ctx.isEditor} isPriority={isPriority} />
    </div>
  )
}

function ColumnNode({ column, ctx, isPriority }: { column: Column; ctx: NodeContext; isPriority: boolean }) {
  return (
    <div className={`hb-col ${ctx.classes[column.id] ?? ''}`} {...editorAttrs(ctx, column.id, 'column')}>
      {column.widgets.map((widget) => (
        <WidgetNode key={widget.id} widget={widget} ctx={ctx} isPriority={isPriority} />
      ))}
      {ctx.isEditor && column.widgets.length === 0 && (
        <div className="hb-placeholder" data-hb-empty="true">
          Drop or add elements here
        </div>
      )}
    </div>
  )
}

function SectionNode({ section, ctx, isPriority }: { section: Section; ctx: NodeContext; isPriority: boolean }) {
  const video = sectionVideo(section)
  const anchor = safeAnchor(section.anchor)
  const state = stateAttrs(ctx, section)
  if (state.skip) return null
  return (
    <section
      id={anchor ?? undefined}
      aria-label={section.label || undefined}
      className={`hb-section ${ctx.classes[section.id] ?? ''}`}
      data-pin={section.pin === 'bottom' ? 'bottom' : undefined}
      {...editorAttrs(ctx, section.id, 'section')}
      {...state.attrs}
    >
      {video && (
        <>
          <div className="hb-bg-video" aria-hidden="true">
            <video src={video} autoPlay muted loop playsInline preload="metadata" />
          </div>
          <div className="hb-bg-overlay" aria-hidden="true" />
        </>
      )}
      <div className="hb-row">
        {section.columns.map((column) => (
          <ColumnNode key={column.id} column={column} ctx={ctx} isPriority={isPriority} />
        ))}
      </div>
    </section>
  )
}

/**
 * Renders a v5 hero design ONCE. Responsiveness comes from the generated
 * sheet's container queries, so the storefront and the editor's device
 * frames share exactly the same output.
 */
export const HeroBuilderRenderer = memo(function HeroBuilderRenderer({
  design,
  isEditor = false,
  className,
  viewportHeight,
}: HeroBuilderRendererProps) {
  const reactId = useId()
  const scope = useMemo(() => `hb-${reactId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'root'}`, [reactId])
  const built = useMemo(
    () => buildDesignCss(design, { scope, showHidden: isEditor, viewportHeight }),
    [design, scope, isEditor, viewportHeight],
  )
  const runtime = usePageRuntime()
  const pageState = runtime?.state ?? null
  const orderKind = runtime?.orderKind ?? null
  const ctx: NodeContext = { classes: built.classes, isEditor, pageState, orderKind }

  if (!design.sections.length && !isEditor) return null
  // Page Designer: one step at a time / folding panels (only on a page, never a hero).
  const layout = runtime ? design.page?.layout : undefined
  const isStepped = layout === 'steps' || layout === 'accordion'

  return (
    <div className={`${scope}${className ? ` ${className}` : ''}`} data-branding-scope="storefront/hero">
      {built.fontsHref && <link rel="stylesheet" href={built.fontsHref} />}
      <style dangerouslySetInnerHTML={{ __html: built.css }} />
      {isStepped && design.page ? (
        <PageLayout
          settings={design.page}
          isEditor={isEditor}
          stepProblem={runtime?.stepProblem}
          sections={design.sections
            .filter((section) => isEditor || isNodeShown(section, pageState, orderKind))
            .map((section, i) => ({ section, node: <SectionNode section={section} ctx={ctx} isPriority={i === 0} /> }))}
        />
      ) : runtime && !isEditor ? (
        <ScrollingSections sections={design.sections.map((section, i) => ({ section, node: <SectionNode section={section} ctx={ctx} isPriority={i === 0} /> }))} />
      ) : (
        design.sections.map((section, i) => <SectionNode key={section.id} section={section} ctx={ctx} isPriority={i === 0} />)
      )}
    </div>
  )
})
