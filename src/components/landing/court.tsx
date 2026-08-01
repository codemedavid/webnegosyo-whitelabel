import Link from 'next/link'
import { CHECKOUT_URL, COURT, TARP, type CapabilityIcon, type TarpInk } from './landing-theme'

/* ────────────────────────────────────────────────────────────────────────────
   Court atoms. Every control on this page is built from the covered court:
   painted lane plates, steel housings, printed vinyl, stencil marks.
   ──────────────────────────────────────────────────────────────────────────── */

/** The angled edge every control on this page is cut to. */
const LANE_CLIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)'

interface CourtButtonProps {
  children: React.ReactNode
  href?: string
  /** `vinyl` and `tarpGhost` are for saturated tarpaulin grounds, where
   *  scoring red disappears into the print. */
  tone?: 'score' | 'chalk' | 'vinyl' | 'tarpGhost'
  size?: 'default' | 'large'
  fullWidth?: boolean
  /** What shows through an outlined plate — the surface it is sitting on. */
  ghostFill?: string
}

/**
 * The lane plate. Hard-edged and slightly angled, like a number painted onto
 * the floor — it depresses on press instead of lifting on hover.
 */
export function CourtButton({
  children,
  href = CHECKOUT_URL,
  tone = 'score',
  size = 'default',
  fullWidth = false,
  ghostFill = COURT.ground,
}: CourtButtonProps) {
  const isScore = tone === 'score'
  const isVinyl = tone === 'vinyl'
  const isGhost = tone === 'chalk' || tone === 'tarpGhost'
  const outline = tone === 'tarpGhost' ? `${TARP.vinyl}8c` : `${COURT.lane}59`
  const ghostInk = tone === 'tarpGhost' ? TARP.vinyl : COURT.lane
  const pad =
    size === 'large' ? 'px-8 py-4 text-[15px] md:px-10 md:py-5 md:text-lg' : 'px-6 py-3 text-sm'

  const className = [
    'group relative inline-flex items-center justify-center gap-3 font-display uppercase',
    'tracking-[0.02em] leading-none transition-[transform,box-shadow,background-color] duration-150',
    'active:translate-y-[3px]',
    pad,
    fullWidth ? 'w-full' : '',
  ].join(' ')

  // The angled edge is a clip, and a clip cuts a border into open corners. The
  // chalk variant paints its outline as a clipped layer behind an inset fill
  // instead, so the whole lane plate stays enclosed.
  const style: React.CSSProperties = isScore
    ? {
        backgroundColor: COURT.plateRed,
        color: '#FFF6F3',
        clipPath: LANE_CLIP,
        boxShadow: `0 6px 0 0 ${COURT.plateRedDeep}, 0 14px 26px rgba(201,33,10,0.3)`,
      }
    : isVinyl
      ? {
          backgroundColor: TARP.vinyl,
          color: TARP.ink,
          clipPath: LANE_CLIP,
          boxShadow: '0 6px 0 0 rgba(0,0,0,0.32), 0 14px 26px rgba(0,0,0,0.26)',
        }
      : {
          backgroundColor: outline,
          color: ghostInk,
          clipPath: LANE_CLIP,
        }

  const inner = (
    <>
      {isGhost && (
        <span
          aria-hidden
          className="landing-chalk-fill pointer-events-none"
          style={{ backgroundColor: ghostFill, clipPath: LANE_CLIP }}
        />
      )}
      <span className="relative inline-flex items-center gap-3">
        {children}
        <span
          aria-hidden
          className="inline-flex transition-transform duration-200 group-hover:translate-x-1"
        >
          <ArrowMark />
        </span>
      </span>
    </>
  )

  const shared = {
    className: `${className} ${
      isScore
        ? 'landing-plate hover:brightness-110'
        : isVinyl
          ? 'hover:brightness-95'
          : tone === 'tarpGhost'
            ? 'landing-tarpghost'
            : 'landing-chalk'
    }`,
    style,
  }

  if (href.startsWith('#')) {
    return (
      <a href={href} {...shared}>
        {inner}
      </a>
    )
  }

  return (
    <Link href={href} {...shared}>
      {inner}
    </Link>
  )
}

function ArrowMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M4 12h15M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

/**
 * The chalk rule — a painted court line. Used to separate zones the way the
 * floor does, instead of a 1px UI divider.
 */
export function ChalkRule({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-[3px] w-full ${className}`}
      style={{
        background: `repeating-linear-gradient(90deg, ${COURT.lane}2e 0 22px, transparent 22px 34px)`,
      }}
    />
  )
}

interface SectionTitleProps {
  children: React.ReactNode
  body?: React.ReactNode
  align?: 'center' | 'left'
  tone?: 'court' | 'vinyl'
}

/**
 * Section headings carry themselves — the board's own labels live inside the
 * board, never floating above a heading as an eyebrow.
 */
export function SectionTitle({
  children,
  body,
  align = 'center',
  tone = 'court',
}: SectionTitleProps) {
  const isVinyl = tone === 'vinyl'
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <h2
        className="font-display t-section uppercase leading-[0.92] tracking-[-0.025em]"
        style={{ color: isVinyl ? TARP.ink : COURT.lane, textWrap: 'balance' }}
      >
        {children}
      </h2>
      {body && (
        <p
          className={`mt-5 text-[15px] leading-relaxed md:text-base ${align === 'center' ? 'mx-auto max-w-[58ch]' : 'max-w-[62ch]'}`}
          style={{ color: isVinyl ? '#4A4A42' : COURT.laneDim }}
        >
          {body}
        </p>
      )}
    </div>
  )
}

/** Emphasis inside a heading: the lit word. Colour and weight, never a gradient. */
export function Lit({ children, color = COURT.ledAmber }: { children: React.ReactNode; color?: string }) {
  return <span style={{ color }}>{children}</span>
}

/* ────────────────────────────────────────────────────────────────────────────
   Sponsor tarpaulin. Printed vinyl, eyeletted at the corners, hung on the
   court fence. The hard drop shadow on the lettering is how banner printing
   actually sets type — it is the medium, not a costume.
   ──────────────────────────────────────────────────────────────────────────── */

/** How printed vinyl catches the floodlight. */
export const VINYL_SHEEN =
  'linear-gradient(118deg, rgba(255,255,255,0.16) 0%, transparent 34%, transparent 68%, rgba(0,0,0,0.14) 100%)'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

/** The eyelet a tarpaulin is tied to the fence through. */
export function Grommet({ corner, inset = 'panel' }: { corner: Corner; inset?: 'panel' | 'wide' }) {
  return <span aria-hidden className={`landing-grommet g-${corner} g-${inset}`} />
}

/** All four eyelets, in one call. */
export function Grommets({ inset = 'panel' }: { inset?: 'panel' | 'wide' }) {
  return (
    <>
      <Grommet corner="tl" inset={inset} />
      <Grommet corner="tr" inset={inset} />
      <Grommet corner="bl" inset={inset} />
      <Grommet corner="br" inset={inset} />
    </>
  )
}

export function TarpPanel({
  ink,
  children,
  className = '',
}: {
  ink: TarpInk
  children: React.ReactNode
  className?: string
}) {
  // Which inks take dark ink. Cream on green measures 2.3:1 and is unreadable.
  const isLight = ink === 'vinyl' || ink === 'yellow' || ink === 'green'
  return (
    <div
      className={`relative overflow-hidden p-6 md:p-7 ${className}`}
      style={{
        // The vinyl sheen rides as a background layer: a banner catches the
        // floodlight across one diagonal.
        backgroundImage: VINYL_SHEEN,
        backgroundColor: TARP[ink],
        color: isLight ? TARP.ink : TARP.vinyl,
        boxShadow: '0 18px 44px rgba(0,0,0,0.45)',
      }}
    >
      <Grommets />
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Stencil marks. Drawn for this page in one weight and one cap style, the way
   signage stencils are cut — no icon library, no glyph substitutes.
   ──────────────────────────────────────────────────────────────────────────── */

const STENCIL_PATHS: Record<CapabilityIcon, React.ReactNode> = {
  store: (
    <>
      <path d="M4 10h24v16H4z" />
      <path d="M4 10 7 5h18l3 5" />
      <path d="M12 26v-8h8v8" />
    </>
  ),
  sparkles: (
    <>
      <path d="M16 4v9M16 19v9M4 16h9M19 16h9" />
      <path d="M9 9l4 4M23 9l-4 4M9 23l4-4M23 23l-4-4" />
    </>
  ),
  layers: (
    <>
      <path d="M16 4 4 11l12 7 12-7z" />
      <path d="M4 17l12 7 12-7" />
      <path d="M4 23l12 7 12-7" />
    </>
  ),
  truck: (
    <>
      <path d="M2 8h16v13H2z" />
      <path d="M18 13h6l4 5v3h-10z" />
      <circle cx="9" cy="24" r="3" />
      <circle cx="23" cy="24" r="3" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 24a12 12 0 1 1 24 0" />
      <path d="M16 24l7-8" />
      <path d="M4 24h4M24 24h4M16 12v-4" />
    </>
  ),
  palette: (
    <>
      <path d="M16 4a12 12 0 1 0 0 24c2 0 2-2 1-3s0-3 2-3h4a5 5 0 0 0 5-5A12 12 0 0 0 16 4z" />
      <path d="M10 14h.01M15 10h.01M21 13h.01" strokeWidth="3.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 8h20v18H4z" />
      <path d="M4 8V6h17" />
      <path d="M24 14h5v6h-5z" />
    </>
  ),
  phone: (
    <>
      <path d="M9 3h14v26H9z" />
      <path d="M14 25h4" />
      <path d="M13 8h6" />
    </>
  ),
}

export function StencilMark({
  icon,
  size = 32,
  className = '',
}: {
  icon: CapabilityIcon
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden
      focusable="false"
    >
      {STENCIL_PATHS[icon]}
    </svg>
  )
}

export function CheckMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M4 13l5 5L20 6" />
    </svg>
  )
}

export function CrossMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="square"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
