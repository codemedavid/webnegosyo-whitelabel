'use client'

import { useState } from 'react'
import { CheckoutForm } from '@/components/landing/checkout-form'
import { ArrowLeft, Check, Shield } from 'lucide-react'
import Link from 'next/link'
import {
  CHECKOUT_BASE_PRICE,
  DEFAULT_PAYMENT_TERM,
  getCheckoutPayableAmount,
  type CheckoutPaymentTerm,
} from '@/lib/checkout-leads/payment-terms'

const CHECKOUT_TUTORIAL_EMBED_URL =
  'https://www.loom.com/embed/70da55654c904a60b18ef9ee8dae4ea0?autoplay=1&muted=1'

  
const INCLUDED_FEATURES = [
  'Smart Bundles & Combo System',
  'Upgrade Pairs Engine',
  'Checkout Upsell Prompts',
  'Menu Engineering Dashboard',
  '12 Menu Card Templates',
  '6 Page Layouts',
  'Product Management Dashboard',
  'Dine-in, Pick-up & Delivery',
  'Mobile-First Ordering Flow',
  'Lifetime Updates',
]

export function CheckoutPageClient() {
  const [selectedPaymentTerm, setSelectedPaymentTerm] =
    useState<CheckoutPaymentTerm>(DEFAULT_PAYMENT_TERM)
  const payTodayAmount = getCheckoutPayableAmount(selectedPaymentTerm)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="border-b border-white/6 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="text-sm font-black text-white tracking-[-0.02em]">
            Web<span style={{ color: '#7c3aed' }}>Negosyo</span>
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[-0.04em] text-white">
            Complete Your Purchase
          </h1>
          <p className="mt-2 text-white/45">
            Fill out the form below and we&apos;ll contact you via Messenger to finalize
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-10">
          <div className="md:col-span-3 space-y-6">
            <section
              data-testid="checkout-tutorial"
              className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
            >
              <div className="border-b border-white/8 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/50">
                  Watch Before You Checkout
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">
                  Quick walkthrough of the checkout process
                </h2>
              </div>
              <div className="aspect-video w-full">
                <iframe
                  src={CHECKOUT_TUTORIAL_EMBED_URL}
                  title="Checkout Tutorial Video"
                  className="h-full w-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </section>

            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8">
              <h2 className="text-lg font-bold text-white mb-6">Your Details</h2>
              <CheckoutForm
                selectedPaymentTerm={selectedPaymentTerm}
                onPaymentTermChange={setSelectedPaymentTerm}
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="sticky top-8 space-y-6">
              <div
                className="rounded-2xl border-2 p-8"
                style={{
                  borderColor: 'rgba(124, 58, 237, 0.3)',
                  background: 'linear-gradient(145deg, rgba(124,58,237,0.1), rgba(124,58,237,0.03))',
                }}
              >
                <div
                  className="text-[11px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: '#7c3aed' }}
                >
                  Smart Menu System
                </div>
                <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/50">
                    Pay Today
                  </p>
                  <div className="mt-2 text-4xl font-black tracking-[-0.03em] text-white">
                    &#8369;{payTodayAmount.toLocaleString()}
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/50">
                    Full Price
                  </p>
                  <div className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">
                    &#8369;{CHECKOUT_BASE_PRICE.toLocaleString()}
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/40">
                  {selectedPaymentTerm === 'downpayment_50'
                    ? '50% downpayment today. Remaining balance is settled before turnover.'
                    : 'One-time payment'}
                </p>
                <div className="mt-3 text-xs text-white/35">
                  {selectedPaymentTerm === 'downpayment_50'
                    ? 'Default payment term selected'
                    : 'Full payment selected'}
                </div>

                <div className="mt-6 pt-6 border-t border-white/8">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/50 mb-3">
                    What&apos;s included
                  </p>
                  <ul className="space-y-2">
                    {INCLUDED_FEATURES.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm text-white/60">
                        <Check className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-5 py-4">
                <Shield className="h-5 w-5 shrink-0 text-green-500" />
                <div>
                  <p className="text-sm font-semibold text-white/80">No monthly fees</p>
                  <p className="text-xs text-white/35">
                    One-time payment. Lifetime access. 48-hour setup.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
