// Pure helpers over a design's page blocks: which are present, which may be
// removed or duplicated, and how a widget for one is made.

import { createWidget } from '@/lib/hero-builder/defaults'
import { findNode } from '@/lib/hero-builder/tree-ops'
import type { Column, HeroDesignV5, PageBlockContent, Section, Widget } from '@/lib/hero-builder/types'

import { blockDef } from './blocks'
import type { PageBlockDef } from './types'

export type PageBlockWidget = Widget & { kind: 'page-block'; content: PageBlockContent }

export function isPageBlockWidget(widget: Widget): widget is PageBlockWidget {
  return widget.kind === 'page-block' && widget.content.kind === 'page-block'
}

function widgetsOf(node: Section | Column | Widget): Widget[] {
  if ('columns' in node) return node.columns.flatMap((c) => c.widgets)
  if ('widgets' in node) return node.widgets
  return [node]
}

/** Every page-block id in the design, in reading order (duplicates kept). */
export function blockIdsIn(design: HeroDesignV5): string[] {
  return design.sections.flatMap((s) => widgetsOf(s)).filter(isPageBlockWidget).map((w) => w.content.block)
}

/** Required blocks inside a node — what removing it would take away. */
function requiredBlocksIn(node: Section | Column | Widget): PageBlockDef[] {
  return widgetsOf(node)
    .filter(isPageBlockWidget)
    .map((w) => blockDef(w.content.block))
    .filter((def): def is PageBlockDef => !!def?.required)
}

/** Removing a node is refused while it holds a required block. */
export function canRemoveNode(design: HeroDesignV5, id: string): boolean {
  const found = findNode(design, id)
  if (!found) return false
  return requiredBlocksIn(found.node as Section | Column | Widget).length === 0
}

/** Each page block appears once: a node holding one is never duplicated. */
export function canDuplicateNode(design: HeroDesignV5, id: string): boolean {
  const found = findNode(design, id)
  if (!found) return false
  return !widgetsOf(found.node as Section | Column | Widget).some(isPageBlockWidget)
}

/** Why a node cannot be removed, for the editor's lock hint. */
export function removeBlockedReason(design: HeroDesignV5, id: string): string | null {
  const found = findNode(design, id)
  if (!found) return null
  const held = requiredBlocksIn(found.node as Section | Column | Widget)
  if (!held.length) return null
  const names = held.map((d) => `"${d.label}"`).join(', ')
  return found.kind === 'widget'
    ? `${names} keeps this page working, so it can't be removed. Move it, restyle it or change its words instead.`
    : `This holds ${names}, which keeps the page working. Move it out first.`
}

/** A widget for one page block, with the registry's defaults. */
export function createPageBlock(def: PageBlockDef): PageBlockWidget {
  const base = createWidget('page-block')
  const options = Object.fromEntries(def.options.map((o) => [o.key, o.default]))
  return { ...base, kind: 'page-block', content: { kind: 'page-block', block: def.id, texts: {}, options } }
}
