import type { Device, NodeStyle, Responsive } from './types'

/** The devices whose overrides apply at `device`, widest first. */
export function cascadeFor(device: Device): readonly Device[] {
  if (device === 'desktop') return ['desktop']
  if (device === 'tablet') return ['desktop', 'tablet']
  return ['desktop', 'tablet', 'mobile']
}

export function styleLayer(node: Responsive, device: Device): NodeStyle | undefined {
  if (device === 'desktop') return node.style
  return node[device]
}

/** A node's effective style at `device` (desktop → tablet → mobile). */
export function resolveStyle(node: Responsive, device: Device): NodeStyle {
  return cascadeFor(device).reduce<NodeStyle>(
    (acc, layer) => ({ ...acc, ...(styleLayer(node, layer) ?? {}) }),
    {},
  )
}

/** True when `device` itself (not an inherited layer) sets `key`. */
export function isOverriddenAt(node: Responsive, device: Device, key: keyof NodeStyle): boolean {
  if (device === 'desktop') return false
  const layer = node[device]
  return !!layer && Object.prototype.hasOwnProperty.call(layer, key)
}
