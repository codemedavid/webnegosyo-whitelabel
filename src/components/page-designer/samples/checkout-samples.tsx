'use client'

import type { PageBlockRenderer } from '@/components/hero-builder/renderer/page-runtime'

/**
 * How each checkout block looks in the Page Designer editor: the real component fed
 * SAMPLE data, buttons inert. Keyed by block id (src/lib/page-designer/blocks-checkout.ts).
 * A block missing here shows a labelled placeholder on the canvas.
 */
export const CHECKOUT_SAMPLE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = {}
