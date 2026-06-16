/**
 * Inline-SVG icon components for the storefront footer.
 *
 * Each icon accepts { className?, style? } and draws its glyph with
 * `currentColor`, so the caller controls color via the `color` CSS property
 * (or inline style). Brand glyphs are hand-rolled because lucide-react lacks
 * most of them. All icons are decorative (aria-hidden).
 */

import type { CSSProperties } from 'react'

interface IconProps {
  className?: string
  style?: CSSProperties
}

const BASE_PROPS = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  'aria-hidden': 'true' as const,
  focusable: 'false' as const,
}

export function MapPinIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

export function PhoneIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M6.6 2.5a1.6 1.6 0 0 1 1.5 1l1 2.5a1.6 1.6 0 0 1-.36 1.7L7.4 9.65a13 13 0 0 0 6.95 6.95l1.95-1.34a1.6 1.6 0 0 1 1.7-.36l2.5 1a1.6 1.6 0 0 1 1 1.5v2.4a1.6 1.6 0 0 1-1.75 1.6C11.8 21.92 2.08 12.2 1.2 4.25A1.6 1.6 0 0 1 2.8 2.5h3.8Z" />
    </svg>
  )
}

export function WhatsappIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M12 2a10 10 0 0 0-8.6 15.06L2 22l5.07-1.33A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 0 1 6.94 12.57l-.2.32.78 2.85-2.93-.77-.31.18A8.2 8.2 0 1 1 12 3.8Zm-3.2 4.1c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.2.87 2.35.99 2.51.12.16 1.7 2.7 4.2 3.68 2.07.82 2.5.66 2.95.62.45-.04 1.45-.59 1.66-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28-.24-.12-1.45-.72-1.67-.8-.22-.08-.39-.12-.55.12-.16.24-.63.8-.77.96-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.2-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.32-.76-1.81-.2-.46-.4-.4-.55-.41h-.27Z" />
    </svg>
  )
}

export function ViberIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M12 2.4c-2.5 0-5.5.3-7.2 1.86C3.45 5.55 3 7.3 3 9.7v3.9c0 2.4.45 4.16 1.8 5.45.7.64 1.74 1 2.6 1.18v2.07c0 .47.57.7.9.36l2.2-2.27c.5.02 1 .02 1.5.02 2.5 0 5.5-.3 7.2-1.86C20.55 17.5 21 15.75 21 13.35V9.7c0-2.4-.45-4.16-1.8-5.45C17.5 2.7 14.5 2.4 12 2.4Zm.04 2.5c2.2 0 4.74.25 5.94 1.33.83.74 1.12 2.02 1.12 3.97v3.65c0 1.95-.29 3.23-1.12 3.97-1.2 1.08-3.74 1.33-5.94 1.33-.6 0-1.2-.01-1.78-.05l-.4-.03-1.36 1.4v-1.66l-.7-.12c-.86-.15-1.55-.4-2.02-.82C4.95 16.8 4.66 15.52 4.66 13.6V9.95c0-1.95.29-3.23 1.12-3.97 1.2-1.08 3.74-1.33 5.94-1.33h.32ZM10 7.4a.7.7 0 0 0-.06 1.4c.86.08 1.43.34 1.83.74.4.4.66.97.74 1.83a.7.7 0 0 0 1.4-.12c-.1-1.1-.47-2.02-1.15-2.7-.68-.68-1.6-1.05-2.7-1.15a.7.7 0 0 0-.06 0Zm.06 2a.7.7 0 0 0-.12 1.4c.28.04.43.12.53.22.1.1.18.25.22.53a.7.7 0 0 0 1.4-.16 2 2 0 0 0-.61-1.2 2 2 0 0 0-1.2-.6.7.7 0 0 0-.22 0Zm-2.4-2.07c-.2 0-.43.05-.64.21-.3.22-.66.66-.74 1.32-.08.66.1 1.43.6 2.5.5 1.07 1.32 2.3 2.5 3.47 1.17 1.17 2.4 2 3.47 2.5 1.07.5 1.84.68 2.5.6.66-.08 1.1-.44 1.32-.74.16-.21.21-.45.2-.65-.02-.36-.27-.58-.5-.74-.24-.16-1.1-.65-1.3-.74-.2-.1-.43-.14-.63.06-.13.13-.4.46-.5.57-.1.12-.22.13-.4.05-.18-.08-.76-.3-1.45-.94-.55-.51-.92-1.13-1.03-1.32-.1-.2-.01-.31.08-.4.08-.08.18-.21.27-.32.1-.11.13-.2.2-.33.06-.13.03-.25-.01-.34-.05-.1-.43-1.1-.59-1.5-.15-.4-.31-.34-.43-.34h-.37Z" />
    </svg>
  )
}

export function MailIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  )
}

export function FacebookIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M14 9V7.5c0-.7.3-1 1-1h1.5V4h-2.3C12 4 11 5.3 11 7.3V9H9v2.6h2V20h3v-8.4h2.2l.4-2.6H14Z" />
    </svg>
  )
}

export function InstagramIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TiktokIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M16.5 3c.3 1.9 1.4 3.4 3.5 3.7v2.6c-1.2 0-2.4-.3-3.5-.95v5.9a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6.02.9.07v2.7a2.8 2.8 0 1 0 1.9 2.63V3h2.6Z" />
    </svg>
  )
}

export function XIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M17.5 3h2.9l-6.34 7.25L21.5 21h-5.84l-4.58-5.98L5.84 21H2.94l6.78-7.75L2.5 3h6l4.14 5.47L17.5 3Zm-1.02 16.2h1.61L7.6 4.7H5.87l10.6 14.5Z" />
    </svg>
  )
}

export function YoutubeIcon({ className, style }: IconProps) {
  return (
    <svg
      {...BASE_PROPS}
      className={className}
      style={style}
      fill="currentColor"
    >
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3-5.2 3Z" />
    </svg>
  )
}
