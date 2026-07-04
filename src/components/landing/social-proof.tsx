'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { CTAButton, SectionTag } from './cta-button'
import { LANDING_COLORS, PRICE_LABEL, STATS } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.3 } as const

function StatsBand() {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/8 bg-white/8 md:grid-cols-4">
      {STATS.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, delay: i * 0.08 }}
          className="flex flex-col items-center gap-1 px-6 py-8 text-center"
          style={{ backgroundColor: LANDING_COLORS.inkSoft }}
        >
          <span
            className="text-[clamp(1.8rem,4vw,2.6rem)] font-black tracking-[-0.03em]"
            style={{
              background: `linear-gradient(120deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.gold})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {stat.value}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
            {stat.label}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

function DemoVideo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto mt-16 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10"
      style={{ aspectRatio: '16/9', boxShadow: `0 40px 120px ${LANDING_COLORS.brand}1f` }}
    >
      <iframe
        src="https://www.youtube.com/embed/q1GZEDwFLv8?rel=0"
        title="Smart Menu System demo"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </motion.div>
  )
}

function TestimonialVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  function handlePlayClick() {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play()
      setIsPlaying(true)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6 }}
      className="relative mx-auto w-full max-w-[560px] cursor-pointer overflow-hidden rounded-3xl border border-white/10"
      onClick={handlePlayClick}
    >
      <video
        ref={videoRef}
        src="/testimonial.mp4"
        className="block w-full"
        style={{ aspectRatio: '1/1', objectFit: 'cover' }}
        playsInline
        onEnded={() => setIsPlaying(false)}
      />
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors hover:bg-black/25">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110"
            style={{
              backgroundColor: `${LANDING_COLORS.brand}e6`,
              boxShadow: `0 0 60px ${LANDING_COLORS.brand}80`,
            }}
          >
            <Play className="ml-1 h-9 w-9 fill-white text-white" />
          </div>
        </div>
      )}
    </motion.div>
  )
}

function TestimonialCards() {
  return (
    <div className="relative mx-auto mt-4 flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center md:gap-10">
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: -6 }}
        whileInView={{ opacity: 1, y: 0, rotate: -3 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.55, delay: 0.05 }}
        className="w-full max-w-[320px] overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <Image
          src="/testimonial1.jpg"
          alt="Client testimonial — praising the hero banner feature"
          width={320}
          height={400}
          className="h-auto w-full" style={{ width: '100%', height: 'auto' }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40, rotate: 5 }}
        whileInView={{ opacity: 1, y: 0, rotate: 2 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.55, delay: 0.15 }}
        className="w-full max-w-[320px] overflow-hidden rounded-2xl bg-white shadow-2xl md:mt-12"
      >
        <Image
          src="/testimonial2.png"
          alt="Facebook review from Kenya Mendoza recommending WebNegosyo"
          width={320}
          height={120}
          className="h-auto w-full" style={{ width: '100%', height: 'auto' }}
        />
      </motion.div>
    </div>
  )
}

export function SocialProofSection() {
  return (
    <section className="relative z-10 py-24 md:py-32" style={{ backgroundColor: LANDING_COLORS.ink }}>
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <StatsBand />

        <div className="mt-24 text-center md:mt-32">
          <SectionTag>See It In Action</SectionTag>
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.6 }}
            className="text-[clamp(2rem,5.5vw,3.4rem)] font-black uppercase leading-[1.02] tracking-[-0.04em] text-white"
          >
            Watch the Smart Menu
            <br />
            do the selling.
          </motion.h2>
          <DemoVideo />
        </div>

        <div className="mt-24 text-center md:mt-32">
          <SectionTag>Real Results</SectionTag>
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.6 }}
            className="mb-12 text-[clamp(2rem,5.5vw,3.4rem)] font-black uppercase leading-[1.02] tracking-[-0.04em] text-white"
          >
            What people are saying
          </motion.h2>
          <TestimonialVideo />
          <TestimonialCards />
          <p className="mx-auto mt-10 max-w-xl text-[11px] leading-relaxed text-white/25">
            Individual experiences presented here may not be typical. Their background, education,
            effort, and application affected their experience.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.7 }}
          className="mt-24 overflow-hidden rounded-3xl border border-orange-600/15 text-center md:mt-32"
          style={{
            background: `linear-gradient(160deg, ${LANDING_COLORS.brand}12, transparent 55%)`,
            backgroundColor: LANDING_COLORS.inkSoft,
          }}
        >
          <div className="px-6 pt-12">
            <Image
              src="/product.png"
              alt="Smart Menu product preview"
              width={720}
              height={520}
              className="mx-auto h-auto w-full max-w-[720px] rounded-2xl"
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
          <div className="px-6 pb-12 pt-10">
            <CTAButton>Join 100+ Restaurants — {PRICE_LABEL}</CTAButton>
            <p className="mt-3 text-xs text-white/30">One-time investment. Lifetime returns.</p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
