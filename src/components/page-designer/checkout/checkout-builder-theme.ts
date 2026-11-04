import type { CSSProperties } from 'react'

/**
 * The builder's theme colours (`@text`, `@muted`, `@background`, `@surface`)
 * fall back to the store's `--brand-*` variables. On a designed checkout they
 * follow the checkout palette instead, so an owner's own headings and text sit
 * readably on the checkout's background (which may differ from the menu's).
 * Only references to `--co-*` — no colour is fixed here.
 */
export const CHECKOUT_BUILDER_BRIDGE: CSSProperties = {
  '--brand-text-primary': 'var(--co-text)',
  '--brand-text-secondary': 'var(--co-muted)',
  '--brand-background': 'var(--co-bg)',
  '--brand-cards': 'var(--co-card)',
} as CSSProperties
