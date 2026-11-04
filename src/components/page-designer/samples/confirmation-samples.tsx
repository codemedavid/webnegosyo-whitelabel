'use client'

import type { PageBlockRenderer } from '@/components/hero-builder/renderer/page-runtime'

/**
 * How each confirmation block looks in the Page Designer editor: the real component fed
 * SAMPLE data, buttons inert. Keyed by block id (src/lib/page-designer/blocks-confirmation.ts).
 * A block missing here shows a labelled placeholder on the canvas.
 */
export const CONFIRMATION_SAMPLE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = {}
