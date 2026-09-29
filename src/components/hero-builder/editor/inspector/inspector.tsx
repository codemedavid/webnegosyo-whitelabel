'use client'

import { useEffect, useState } from 'react'
import { Columns3, LayoutPanelTop, Monitor, MousePointerClick, Smartphone, Tablet } from 'lucide-react'

import { cn } from '@/lib/utils'
import { WIDGET_DEFAULTS } from '@/lib/hero-builder/defaults'
import { findNode } from '@/lib/hero-builder/tree-ops'
import type { Device, Section, Widget } from '@/lib/hero-builder/types'

import type { HeroBuilderApi } from '../use-hero-builder'
import { ContentPanel } from './content-panel'
import { LayoutPanel } from './layout-panel'
import { bindNodeStyle } from './node-style'
import { StylePanel } from './style-panel'

type Tab = 'content' | 'style' | 'layout'

const DEVICE_ICON: Record<Device, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone }

interface InspectorProps {
  api: HeroBuilderApi
  /** Bumped when the canvas asks to jump to the Content tab (double-click). */
  contentRequest: number
}

export function Inspector({ api, contentRequest }: InspectorProps) {
  const [tab, setTab] = useState<Tab>('content')
  // A new selection (or a double-click) opens on Content, like Elementor.
  useEffect(() => {
    setTab('content')
  }, [contentRequest, api.selectedId])
  const found = findNode(api.design, api.selectedId)

  if (!found) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100">
          <MousePointerClick className="h-5 w-5 text-neutral-500" />
        </span>
        <p className="text-sm font-medium text-neutral-800">Select something to edit it</p>
        <p className="text-xs leading-relaxed text-neutral-500">
          Click any element on the canvas. Double-click text to jump straight to its content.
        </p>
      </div>
    )
  }

  const node = found.node
  const b = bindNodeStyle(api, node)
  const widget = found.kind === 'widget' ? (node as Widget) : undefined
  const title =
    found.kind === 'widget'
      ? WIDGET_DEFAULTS[(node as Widget).kind]?.label ?? 'Element'
      : found.kind === 'section'
        ? (node as Section).label || 'Section'
        : `Column ${found.index + 1}`
  const Icon = found.kind === 'section' ? LayoutPanelTop : found.kind === 'column' ? Columns3 : MousePointerClick
  const DeviceIcon = DEVICE_ICON[api.device]
  const hasOverrides = api.device !== 'desktop' && !!node[api.device] && Object.keys(node[api.device] ?? {}).length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 pb-0 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-neutral-400" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{title}</p>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            {found.kind}
          </span>
        </div>
        {api.device !== 'desktop' && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-sky-50 px-2.5 py-2 text-[11px] leading-snug text-sky-900">
            <DeviceIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              Style and layout changes apply to <strong>{api.device}</strong>
              {api.device === 'tablet' ? ' and phones' : ''} only.
            </span>
            {hasOverrides && (
              <button type="button" onClick={() => api.resetOverrides(node.id)} className="font-semibold underline-offset-2 hover:underline">
                Reset
              </button>
            )}
          </div>
        )}
        <div role="tablist" className="-mb-px flex gap-4">
          {(['content', 'style', 'layout'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 pb-2 text-xs font-semibold capitalize transition',
                tab === t ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {/* Keyed by node + device: every control re-reads its value (e.g. the
          spacing "linked" state) instead of carrying state across devices. */}
      <div key={`${node.id}:${api.device}`} className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'content' && (
          <ContentPanel api={api} node={found.kind === 'column' ? (node as unknown as Section) : (node as Section | Widget)} nodeKind={found.kind} />
        )}
        {tab === 'style' && <StylePanel b={b} nodeKind={found.kind} widgetKind={widget?.kind} />}
        {tab === 'layout' && (
          <LayoutPanel b={b} nodeKind={found.kind} widget={widget} device={api.device} onAnimation={(a) => api.editAnimation(node.id, a)} />
        )}
      </div>
    </div>
  )
}
