import { CheckoutForm } from '@/components/landing/checkout-form'
import { ArrowLeft, Check, Shield } from 'lucide-react'
import Link from 'next/link'
import { MetaPixelBootstrap } from '@/components/tracking/meta-pixel-bootstrap'

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const CHECKOUT_TUTORIAL_EMBED_URL =
  'https://www.loom.com/embed/02d3b1e132f4459fa1effcb06e2b8491?autoplay=1&muted=1'

export const metadata = {
  title: 'Checkout - WebNegosyo Smart Menu System',
  description: 'Complete your purchase of the Smart Menu System. One-time ₱3,899.',
}

const INCLUDED_FEATURES = [
  'Smart Bundles & Combo System',
  'Upgrade Pairs Engine',
  'Checkout Upsell Prompts',
  'Menu Engineering Dashboard',
  '12 Menu Card Templates',
  '6 Page Layouts',
  'Custom Hero Designer',
  'Dine-in, Pick-up & Delivery',
  'Mobile-First Ordering Flow',
  'Lifetime Updates',
]

export default async function CheckoutPage() {
  return (
    <>
      <MetaPixelBootstrap pixelId={META_PIXEL_ID} />
      <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        {/* Top bar */}
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
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[-0.04em] text-white">
              Complete Your Purchase
            </h1>
            <p className="mt-2 text-white/45">
              Fill out the form below and we&apos;ll contact you via Messenger to finalize
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-10">
            {/* Form — left side */}
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
                <CheckoutForm />
              </div>
            </div>

            {/* Order summary — right side */}
            <div className="md:col-span-2">
              <div className="sticky top-8 space-y-6">
                {/* Pricing card */}
                <div
                  className="rounded-2xl border-2 p-8"
                  style={{
                    borderColor: 'rgba(124, 58, 237, 0.3)',
                    background: 'linear-gradient(145deg, rgba(124,58,237,0.1), rgba(124,58,237,0.03))',
                  }}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#7c3aed' }}>
                    Smart Menu System
                  </div>
                  <div className="mt-3 text-4xl font-black tracking-[-0.03em] text-white">
                    &#8369;3,899
                  </div>
                  <p className="mt-1 text-sm text-white/40">One-time payment</p>

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

                {/* Trust badges */}
                <div className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-5 py-4">
                  <Shield className="h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="text-sm font-semibold text-white/80">No monthly fees</p>
                    <p className="text-xs text-white/35">One-time payment. Lifetime access. 48-hour setup.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
