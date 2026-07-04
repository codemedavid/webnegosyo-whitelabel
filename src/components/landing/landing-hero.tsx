'use client'

import { motion } from 'framer-motion'
import { CTAButton } from './cta-button'
import { PRICE_LABEL } from './landing-theme'

const HEADLINE_LINES = ['Your Menu', 'Should Sell', 'For You.'] as const

const lineVariants = {
  hidden: { opacity: 0, y: 60, rotateX: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] as const },
  }),
}

export function LandingHero() {
  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center px-5 text-center">
      {/* Scrim so the headline stays readable over the 3D scene */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,4,3,0.55),rgba(6,4,3,0.15)_45%,transparent_70%)]" />
      {/* Extra dimming on small screens where the phone sits behind the copy */}
      <div className="pointer-events-none absolute inset-0 bg-black/55 md:hidden" />

      <div className="relative max-w-4xl" style={{ perspective: 800 }}>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60 backdrop-blur-md"
        >
          <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          Smart Menu System — One-Time {PRICE_LABEL}
        </motion.p>

        <h1 className="text-[clamp(3rem,10vw,7.5rem)] font-black uppercase leading-[0.92] tracking-[-0.05em] text-white">
          {HEADLINE_LINES.map((line, i) => (
            <motion.span
              key={line}
              custom={i}
              variants={lineVariants}
              initial="hidden"
              animate="visible"
              className="block"
              style={
                i === 1
                  ? {
                      background: 'linear-gradient(100deg, #ea580c 10%, #f59e0b 60%, #fdba74 95%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }
                  : undefined
              }
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mx-auto mt-7 max-w-xl text-[clamp(0.95rem,2vw,1.15rem)] leading-relaxed text-white/60"
        >
          Hindi sapat na maganda lang ang menu mo. Kailangan nitong mag-guide, mag-suggest, at
          mag-push ng bigger orders — automatically.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.75 }}
          className="mt-9 flex flex-col items-center gap-3"
        >
          <CTAButton size="large">Get Smart Menu Now — {PRICE_LABEL}</CTAButton>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/30">
            One-time payment • No monthly fees • Lifetime access
          </p>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-12 w-7 items-start justify-center rounded-full border border-white/20 p-2"
        >
          <div className="h-2 w-1 rounded-full bg-white/50" />
        </motion.div>
      </motion.div>
    </section>
  )
}
