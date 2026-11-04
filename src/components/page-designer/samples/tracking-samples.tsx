'use client'

import type { PageBlockRenderer } from '@/components/hero-builder/renderer/page-runtime'

/**
 * How each tracking block looks in the Page Designer editor: the real component fed
 * SAMPLE data, buttons inert. Keyed by block id (src/lib/page-designer/blocks-tracking.ts).
 * A block missing here shows a labelled placeholder on the canvas.
 */
export const TRACKING_SAMPLE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = {}
