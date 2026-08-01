import { Anton, Archivo } from 'next/font/google'

/**
 * The court's two faces. Anton is the heavy condensed cap that Philippine
 * tarpaulin and scoreboard lettering is actually set in; Archivo is the
 * workhorse that stays legible at 13px on a cheap phone in daylight.
 */
export const displayFont = Anton({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-landing-display',
})

export const textFont = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-landing-text',
})

export const landingFontClass = `${displayFont.variable} ${textFont.variable}`
