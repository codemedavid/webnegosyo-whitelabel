'use client'

import { useLayoutEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from 'react'

import { readTrackingStyle } from '@/lib/tracking-style/keys'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'
import type { PageBlockRenderer, PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { LoyaltyProgressPanel } from '@/components/customer/loyalty-progress-panel'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { TrackingOptionsProvider } from '@/components/customer/order-tracking/tracking-options'
import { CHECKOUT_BLOCK_VIEWS } from '@/components/page-designer/checkout/checkout-block-views'
import type { CheckoutBlockViewProps } from '@/components/page-designer/checkout/block-views-details'
import { buildSampleCheckout, type SamplePalette } from '@/components/page-designer/checkout/sample-checkout'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

/** The `--co-*` variable behind each palette entry (set on the canvas by page-theme-checkout). */
const PALETTE_VARS: Record<keyof SamplePalette, string> = {
  bg: '--co-bg',
  card: '--co-card',
  summary: '--co-summary',
  text: '--co-text',
  muted: '--co-muted',
  border: '--co-border',
  accent: '--co-accent',
  accentText: '--co-accent-text',
  button: '--co-button',
  success: '--co-success',
  warning: '--co-warning',
  error: '--co-error',
}

/**
 * The checkout components theme themselves from the tenant row, so a sample
 * needs the store's palette as data. The canvas already carries it as
 * `--co-*` variables; read them back once mounted (null until then, or when
 * the canvas has none — the sample then paints the default checkout).
 */
function readCanvasPalette(element: HTMLElement): SamplePalette | null {
  const computed = window.getComputedStyle(element)
  const entries = Object.entries(PALETTE_VARS).map(([key, name]) => [key, computed.getPropertyValue(name).trim()] as const)
  if (entries.some(([, value]) => !value)) return null
  return Object.fromEntries(entries) as unknown as SamplePalette
}

function useSampleCheckout(ref: RefObject<HTMLDivElement | null>): UseCheckoutReturn {
  const [palette, setPalette] = useState<SamplePalette | null>(null)
  useLayoutEffect(() => {
    if (ref.current) setPalette(readCanvasPalette(ref.current))
  }, [ref])
  return useMemo(() => buildSampleCheckout(palette), [palette])
}

const SAMPLE_CARD: OrderStampCard = {
  programName: 'Stamp card',
  earnMode: 'stamp',
  balance: 3,
  threshold: 8,
  rewardsAvailable: 0,
  rewardLabel: 'a free drink',
}

/** The stamp card as a customer with a few stamps sees it (the live block reads the real card). */
function LoyaltySample({ checkout }: CheckoutBlockViewProps) {
  const style = useMemo(() => readTrackingStyle(null), [])
  return (
    <div style={buildTrackingTheme(checkout.branding, style)}>
      <TrackingOptionsProvider options={style.options}>
        <LoyaltyProgressPanel offer={null} card={SAMPLE_CARD} isLoading={false} storeName="your store" />
      </TrackingOptionsProvider>
    </div>
  )
}

function sampleBlock(View: ComponentType<CheckoutBlockViewProps>, id: string): PageBlockRenderer {
  function SampleCheckoutBlock(props: PageBlockRenderProps) {
    const ref = useRef<HTMLDivElement>(null)
    const checkout = useSampleCheckout(ref)
    return (
      // Clicks inside a sample never reach the editor's own handlers as a submit.
      <div ref={ref} inert={props.isEditor || undefined}>
        <View checkout={checkout} block={props} />
      </div>
    )
  }
  SampleCheckoutBlock.displayName = `SampleCheckoutBlock(${id})`
  return SampleCheckoutBlock
}

const SAMPLE_VIEWS: Readonly<Record<string, ComponentType<CheckoutBlockViewProps>>> = {
  ...CHECKOUT_BLOCK_VIEWS,
  'checkout.loyalty': LoyaltySample,
}

/**
 * How each checkout block looks in the Page Designer editor: the real component fed
 * SAMPLE data, buttons inert. Keyed by block id (src/lib/page-designer/blocks-checkout.ts).
 * A block missing here shows a labelled placeholder on the canvas.
 */
export const CHECKOUT_SAMPLE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = Object.fromEntries(
  Object.entries(SAMPLE_VIEWS).map(([id, View]) => [id, sampleBlock(View, id)]),
)
