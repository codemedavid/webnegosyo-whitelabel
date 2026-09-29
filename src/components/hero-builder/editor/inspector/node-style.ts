'use client'

import { resolveStyle, isOverriddenAt } from '@/lib/hero-builder/resolve'
import type { NodeStyle, Responsive } from '@/lib/hero-builder/types'

import type { HeroBuilderApi } from '../use-hero-builder'

export interface NodeStyleBinding {
  /** Effective style at the device being edited. */
  style: NodeStyle
  set: (patch: Partial<NodeStyle>, key?: string) => void
  /** Props for <Field>: override dot + reset for one style key. */
  field: (key: keyof NodeStyle) => { isOverridden: boolean; onReset: () => void }
}

export function bindNodeStyle(api: HeroBuilderApi, node: Responsive & { id: string }): NodeStyleBinding {
  return {
    style: resolveStyle(node, api.device),
    set: (patch, key) => api.editStyle(node.id, patch, key),
    field: (key) => ({
      isOverridden: isOverriddenAt(node, api.device, key),
      onReset: () => api.editStyle(node.id, { [key]: undefined }),
    }),
  }
}
