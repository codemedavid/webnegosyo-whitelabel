/**
 * Effects a state reveals around the owl: sleep "Z z", thinking dots, a sweat
 * drop, sparkles and confetti. All start hidden (opacity 0, see rig.mjs).
 */
import { g } from './rig.mjs'

const INK = '#2B2321'
const GOLD = '#FFB52E'
const CONFETTI_COLORS = ['#E50914', '#FFA400', '#1A1A1A', '#FF6A5A', '#FFD25A']

/** A four-point sparkle centred on (cx, cy). */
const sparkle = (cx, cy, r) =>
  `M ${cx},${cy - r} Q ${cx},${cy} ${cx + r},${cy} Q ${cx},${cy} ${cx},${cy + r} Q ${cx},${cy} ${cx - r},${cy} Q ${cx},${cy} ${cx},${cy - r} Z`

/** A stroked "Z" with its top-left corner at (x, y). */
const zee = (x, y, s) => `M ${x},${y} L ${x + s},${y} L ${x},${y + s} L ${x + s},${y + s}`

// [x, y, width, height, rotateDeg] — spread over the top of the frame.
const CONFETTI = [
  [70, 60, 16, 9, 20], [150, 20, 12, 12, 45], [230, 70, 16, 9, -30], [300, 10, 10, 10, 0],
  [390, 40, 16, 9, 60], [460, 14, 12, 12, 30], [540, 64, 16, 9, -15], [610, 24, 10, 10, 45],
  [110, 160, 12, 12, 10], [600, 150, 16, 9, -40], [40, 250, 10, 10, 30], [640, 260, 16, 9, 15],
  [190, 130, 16, 9, -60], [500, 120, 12, 12, 25],
]

export function fxMarkup() {
  const confetti = CONFETTI.map(([x, y, w, h, r], i) =>
    `<rect class="o-confetti" x="${x}" y="${y}" width="${w}" height="${h}" rx="2" transform="rotate(${r} ${x + w / 2} ${y + h / 2})" fill="${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}"/>`,
  ).join('\n      ')
  return `
  ${g('fx')}
    ${g('fx-zz')}
      <path d="${zee(530, 112, 48)}" fill="none" stroke="${INK}" stroke-opacity="0.75" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${zee(600, 50, 30)}" fill="none" stroke="${INK}" stroke-opacity="0.6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    ${g('fx-dots')}
      <circle cx="566" cy="150" r="12" fill="${INK}" fill-opacity="0.5"/>
      <circle cx="604" cy="110" r="16" fill="${INK}" fill-opacity="0.6"/>
      <circle cx="648" cy="62" r="21" fill="${INK}" fill-opacity="0.7"/>
    </g>
    ${g('fx-sweat')}
      <path d="M 566,196 C 552,220 548,236 566,246 C 584,236 580,220 566,196 Z" fill="#7CC8F2"/>
      <path d="M 560,222 C 558,230 560,236 564,238" fill="none" stroke="#FFFFFF" stroke-opacity="0.8" stroke-width="3" stroke-linecap="round"/>
    </g>
    ${g('fx-sparkles')}
      <path d="${sparkle(110, 150, 24)}" fill="${GOLD}"/>
      <path d="${sparkle(590, 190, 20)}" fill="${GOLD}"/>
      <path d="${sparkle(70, 430, 14)}" fill="${GOLD}"/>
      <path d="${sparkle(626, 400, 18)}" fill="${GOLD}"/>
      <path d="${sparkle(548, 60, 12)}" fill="${GOLD}"/>
    </g>
    ${g('fx-confetti')}
      ${confetti}
    </g>
  </g>`
}
