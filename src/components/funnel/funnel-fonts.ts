import { Figtree, Newsreader } from 'next/font/google'

/**
 * The reference pairs a medium-weight grotesk (Instagram Sans, proprietary)
 * with Newsreader italic for numbers and accents. Figtree stands in for the
 * grotesk; Newsreader is the same open-licence serif.
 */
export const funnelSans = Figtree({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--fn-sans',
})

export const funnelSerif = Newsreader({
  subsets: ['latin'],
  style: ['italic'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--fn-serif',
})

export const funnelFontClass = `${funnelSans.variable} ${funnelSerif.variable}`
