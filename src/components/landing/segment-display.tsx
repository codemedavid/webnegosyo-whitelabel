/**
 * A real seven-segment display, drawn segment by segment.
 *
 * The detail that separates a scoreboard from "dark UI with a glow" is the
 * unlit segment: on a physical board you can always see the ghosts of the
 * segments that are off. Every digit here renders all seven, and turns six of
 * them down rather than removing them.
 */

type Segment = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'

const DIGIT_SEGMENTS: Record<string, readonly Segment[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
  ' ': [],
}

const ALL_SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const

const W = 100
const H = 180
const T = 17
const MID = (H - T) / 2
const ARM = MID + T / 2

/** Hexagonal bar, the shape a real LED segment is cut to. */
function horizontal(x: number, y: number, length: number): string {
  return [
    `${x + T / 2},${y}`,
    `${x + length - T / 2},${y}`,
    `${x + length},${y + T / 2}`,
    `${x + length - T / 2},${y + T}`,
    `${x + T / 2},${y + T}`,
    `${x},${y + T / 2}`,
  ].join(' ')
}

function vertical(x: number, y: number, length: number): string {
  return [
    `${x},${y + T / 2}`,
    `${x + T / 2},${y}`,
    `${x + T},${y + T / 2}`,
    `${x + T},${y + length - T / 2}`,
    `${x + T / 2},${y + length}`,
    `${x},${y + length - T / 2}`,
  ].join(' ')
}

const SEGMENT_POINTS: Record<Segment, string> = {
  a: horizontal(0, 0, W),
  b: vertical(W - T, 0, ARM),
  c: vertical(W - T, MID, ARM),
  d: horizontal(0, H - T, W),
  e: vertical(0, MID, ARM),
  f: vertical(0, 0, ARM),
  g: horizontal(0, MID, W),
}

interface DigitProps {
  char: string
  color: string
  /** Any CSS length, so one element scales instead of a hidden desktop twin. */
  height: string
}

/** Digit height multiplied by a factor, kept in CSS so clamp() survives. */
function scale(height: string, factor: number): string {
  return `calc(${height} * ${factor})`
}

function Digit({ char, color, height }: DigitProps) {
  const lit = new Set(DIGIT_SEGMENTS[char] ?? DIGIT_SEGMENTS['8'])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ height, width: scale(height, W / H), display: 'block', overflow: 'visible' }}
      aria-hidden
      focusable="false"
    >
      {ALL_SEGMENTS.map((segment) => {
        const isLit = lit.has(segment)
        return (
          <polygon
            key={segment}
            points={SEGMENT_POINTS[segment]}
            fill={color}
            opacity={isLit ? 1 : 0.07}
            style={
              isLit
                ? { filter: `drop-shadow(0 0 ${scale(height, 0.06)} ${color}aa)` }
                : undefined
            }
          />
        )
      })}
    </svg>
  )
}

/** Separators are not segments — a board prints them as fixed marks. */
function Mark({ char, color, height }: DigitProps) {
  if (char === ',') {
    return (
      <span
        style={{
          width: scale(height, 0.2),
          height,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: scale(height, 0.02),
        }}
        aria-hidden
      >
        <span
          style={{
            width: scale(height, 0.09),
            height: scale(height, 0.16),
            background: color,
            borderRadius: '1px',
            transform: 'skewX(-12deg)',
          }}
        />
      </span>
    )
  }

  if (char === '.') {
    return (
      <span
        style={{
          width: scale(height, 0.2),
          height,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        <span
          style={{
            width: scale(height, 0.09),
            height: scale(height, 0.09),
            background: color,
            borderRadius: 1,
          }}
        />
      </span>
    )
  }

  // ₱, %, +, and unit words ride the board as printed glyphs at LED colour.
  return (
    <span
      aria-hidden
      style={{
        color,
        fontSize: scale(height, 0.62),
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        alignSelf: 'center',
        paddingInline: scale(height, 0.03),
      }}
    >
      {char}
    </span>
  )
}

export interface SegmentDisplayProps {
  /** Rendered character by character. Digits become segments; the rest are marks. */
  value: string
  color: string
  /** Digit height as any CSS length, so it can be a clamp(). */
  height: string
  /** Screen-reader text; the segments themselves are decorative. */
  label?: string
  className?: string
}

export function SegmentDisplay({
  value,
  color,
  height,
  label,
  className = '',
}: SegmentDisplayProps) {
  return (
    <span className={`inline-flex items-stretch ${className}`} style={{ gap: scale(height, 0.075) }}>
      <span className="sr-only">{label ?? value}</span>
      {value.split('').map((char, i) =>
        char in DIGIT_SEGMENTS && char !== ' ' ? (
          <Digit key={`${char}-${i}`} char={char} color={color} height={height} />
        ) : (
          <Mark key={`${char}-${i}`} char={char} color={color} height={height} />
        ),
      )}
    </span>
  )
}
