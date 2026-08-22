import { Baloo_2, Figtree, Fraunces } from 'next/font/google'

/**
 * The brand's three voices. Baloo 2 carries the rounded geometry of the
 * SmartMenu wordmark for headings and UI; Fraunces is the serif accent that
 * gives headlines the personality of a printed menu; Figtree is the workhorse
 * that stays legible at 13px on a cheap phone in daylight.
 */
export const displayFont = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-landing-display',
})

export const serifFont = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-landing-serif',
})

export const textFont = Figtree({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-landing-text',
})

export const landingFontClass = `${displayFont.variable} ${serifFont.variable} ${textFont.variable}`
