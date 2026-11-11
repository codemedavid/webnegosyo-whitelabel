import type { PageBlockRenderer } from '@/components/hero-builder/renderer/page-runtime'
import type { PageId } from '@/lib/page-designer/types'

import { CHECKOUT_SAMPLE_BLOCKS } from './checkout-samples'
import { CONFIRMATION_SAMPLE_BLOCKS } from './confirmation-samples'
import { TRACKING_SAMPLE_BLOCKS } from './tracking-samples'

export const SAMPLE_BLOCKS: Readonly<Record<PageId, Readonly<Partial<Record<string, PageBlockRenderer>>>>> = {
  tracking: TRACKING_SAMPLE_BLOCKS,
  confirmation: CONFIRMATION_SAMPLE_BLOCKS,
  checkout: CHECKOUT_SAMPLE_BLOCKS,
}

/** Sample values behind `{tokens}` while editing. */
export function sampleTokens(page: PageId, storeName: string): Record<string, string> {
  const base = { store: storeName || 'Your store', total: '₱485.00', store_address: '12 Rizal Ave, Your City' }
  if (page === 'checkout') return base
  if (page === 'confirmation') return { ...base, name: 'Maria', order_type: 'Pickup' }
  return { ...base, name: 'Maria', order_number: '#07', order_type: 'Pickup' }
}
