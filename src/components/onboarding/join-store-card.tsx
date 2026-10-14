'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bike, Lock, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { previewStoreLink } from './join-steps'
import { EASE_OUT } from './motion/parts'

/**
 * The sign-up link's dream: a busy store with THEIR name over the door and
 * THEIR link under it, writing itself as they type, with orders landing.
 * Decorative sample orders; the caption says it is a preview.
 */

const PHOTO = { src: '/landing/photos/spread.jpg', alt: 'A busy café full of customers' }
const ORDER_EVERY_MS = 2600
const AMBER = '#F5A623'
const RED = '#D7261D'

interface SampleOrder {
  icon: LucideIcon
  title: string
  detail: string
}

const SAMPLE_ORDERS: readonly SampleOrder[] = [
  { icon: ShoppingBag, title: 'Bagong order!', detail: '2× Chicken Inasal · ₱245' },
  { icon: Bike, title: 'Delivery order', detail: '3 items · ₱560' },
  { icon: UtensilsCrossed, title: 'Table 4 ordered', detail: 'Sisig + 2 rice · ₱310' },
]

/** One sample order after another, while there is a name on the door. */
function useOrderTicker(isRunning: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => setTick((value) => value + 1), ORDER_EVERY_MS)
    return () => clearInterval(timer)
  }, [isRunning])
  return tick
}

function OrderToast({ tick }: { tick: number }) {
  const order = SAMPLE_ORDERS[tick % SAMPLE_ORDERS.length]
  const Icon = order.icon
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={tick}
        className="flex items-center gap-2.5 rounded-2xl bg-white py-2 pl-2 pr-3.5 text-[#1C1613] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.55)]"
        initial={{ opacity: 0, y: -14, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: RED }}>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <span className="leading-tight">
          <b className="block text-[13px]">{order.title}</b>
          <span className="text-[12px] text-[#4A3F37]">{order.detail}</span>
        </span>
      </motion.div>
    </AnimatePresence>
  )
}

function TypedLink({ link }: { link: string }) {
  const isReducedMotion = useReducedMotion()
  return (
    <span className="min-w-0 font-mono text-[13px] font-semibold [overflow-wrap:anywhere] sm:text-[14px]">
      <span className="sr-only">{link}</span>
      {link.split('').map((char, index) => (
        <motion.span
          aria-hidden
          key={`${index}-${char}`}
          initial={isReducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  )
}

export function JoinStoreCard({ businessName, rootDomain }: { businessName: string; rootDomain: string }) {
  const name = businessName.trim()
  const hasName = name.length > 0
  const isReducedMotion = useReducedMotion()
  const tick = useOrderTicker(hasName && !isReducedMotion)

  return (
    <figure>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        <Image src={PHOTO.src} alt={PHOTO.alt} fill priority sizes="(min-width: 1024px) 34rem, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" aria-hidden />

        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-bold text-[#1C1613]">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Bukas · taking orders
        </span>

        <div className="absolute right-3 top-14 w-[68%] max-w-[15rem] sm:top-3.5" aria-hidden>
          {hasName && <OrderToast tick={tick} />}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <motion.p
            key={hasName ? 'named' : 'empty'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="truncate text-[2rem] font-extrabold leading-none tracking-[-0.01em] sm:text-[2.5rem]"
            style={{ fontFamily: 'var(--font-landing-display), system-ui', color: hasName ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }}
          >
            {hasName ? name : 'Your store'}
          </motion.p>
          <p className="mt-2.5 inline-flex max-w-full items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-white ring-1 ring-white/15 backdrop-blur-md">
            <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: AMBER }} strokeWidth={2.5} aria-hidden />
            <TypedLink link={previewStoreLink(businessName, rootDomain)} />
          </p>
        </div>
      </div>
      <figcaption className="mt-3 pr-24 text-[12px] leading-snug text-white/55 lg:pr-0 lg:text-center">
        {hasName ? 'A preview. Your store gets your own menu, photos and colors.' : 'Type your store name below and watch it go up.'}
      </figcaption>
    </figure>
  )
}
