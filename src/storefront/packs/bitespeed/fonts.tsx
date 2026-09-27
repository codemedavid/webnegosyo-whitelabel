import { BITESPEED_FONTS_HREF } from './tokens'

/**
 * Loads the BiteSpeed typefaces. Rendered by the pack itself (not a server
 * layout) so the Branding Studio can preview the pack before it is saved;
 * React hoists and de-duplicates the stylesheet into <head>.
 */
export function BiteSpeedFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={BITESPEED_FONTS_HREF} precedence="default" />
    </>
  )
}
