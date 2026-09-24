import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  type ReceiptLayout,
  type ReceiptPresetName,
} from '@/lib/receipt-layout'

export interface ReceiptTemplate {
  name: ReceiptPresetName
  label: string
  description: string
  layout: ReceiptLayout
}

/** The starting points the Studio offers, Modern (the default) first. */
export const RECEIPT_TEMPLATES: ReceiptTemplate[] = [
  {
    name: 'modern',
    label: 'Modern',
    description: 'Big name, headline order #, QR',
    layout: MODERN_RECEIPT_LAYOUT,
  },
  {
    name: 'classic',
    label: 'Classic',
    description: 'The flat, ruled slip',
    layout: CLASSIC_RECEIPT_LAYOUT,
  },
  {
    name: 'compact',
    label: 'Compact',
    description: 'Short — saves paper',
    layout: COMPACT_RECEIPT_LAYOUT,
  },
  {
    name: 'detailed',
    label: 'Detailed',
    description: 'Adds contact and QR',
    layout: DETAILED_RECEIPT_LAYOUT,
  },
]

export function templateLayout(name: ReceiptPresetName): ReceiptLayout {
  return RECEIPT_TEMPLATES.find((t) => t.name === name)?.layout ?? MODERN_RECEIPT_LAYOUT
}
