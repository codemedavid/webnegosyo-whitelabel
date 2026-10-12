/** Markup builders for the owl's parts. Each returns an SVG string. */
import { AXIS, leaf, mirror, mx, round, sampleOutline } from './geometry.mjs'
import { C } from './palette.mjs'
import { g } from './rig.mjs'
import { COVERTS_L, HEAD_FEATHERS_C, HEAD_FEATHERS_L, PRIMARIES_L, WING_L } from './shapes.mjs'

export const leafs = (list, fill, mirrorIt = false, tipRound = 0.5) => list
  .map(([bx, by, tx, ty, w]) => {
    const d = leaf(bx, by, tx, ty, w, tipRound)
    return `<path d="${mirrorIt ? mirror(d) : d}" fill="${fill}"/>`
  })
  .join('\n        ')

/** Small pointed feathers poking out of an outline (left half + mirror). */
export function fluffEdge(leftHalf, { fromY, toY, step, len, w }) {
  return sampleOutline(leftHalf, step)
    // Side-facing points only: a ruff along the chin reads as a collar.
    .filter((p) => p.y >= fromY && p.y <= toY && p.x < AXIS - 30 && p.ny < 0.6)
    .flatMap((p, i) => {
      const l = len * [1, 0.6, 0.85][i % 3]
      const d = leaf(p.x - p.nx * 10, p.y - p.ny * 10, p.x + p.nx * l, p.y + p.ny * l + l * 0.55, w, 0.1)
      return [d, mirror(d)]
    })
    .map((d) => `<path d="${d}" fill="url(#g-fluff)"/>`)
    .join('\n          ')
}

export const clipDefs = new Map()
/** A blurred stroke along a shape's edge, kept inside it: soft 3D shading. */
export function innerShade(key, d, { color, width, opacity, blur = 'f-soft' }) {
  clipDefs.set(key, d)
  return `<g clip-path="url(#clip-${key})"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" filter="url(#${blur})"/></g>`
}

export function toes(list, side) {
  return list.map(([bx, by, tx, ty, w]) => {
    const d = leaf(bx, by, tx, ty, w, 0.95)
    const sh = leaf(bx, by + 4, tx, ty + 4, w + 4, 0.95)
    const f = (p) => (side === 'left' ? p : mirror(p))
    const k = (a) => [bx + (tx - bx) * a, by + (ty - by) * a]
    const [kx, ky] = k(0.55)
    const [hx, hy] = k(0.78)
    const nx = -(ty - by), ny = tx - bx
    const nl = Math.hypot(nx, ny)
    const o = (w / 2 - 4) / nl
    const crease = `M ${round(kx - nx * o)},${round(ky - ny * o)} Q ${round(kx + (tx - bx) * 0.06)},${round(ky + (ty - by) * 0.06)} ${round(kx + nx * o)},${round(ky + ny * o)}`
    return `<path d="${f(sh)}" fill="#7E3812" fill-opacity="0.35" filter="url(#f-soft)"/>
          <path d="${f(d)}" fill="url(#g-toe)"/>
          <path d="${f(crease)}" fill="none" stroke="#B4560A" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round" filter="url(#f-tiny)"/>
          <ellipse cx="${side === 'left' ? round(hx) : mx(round(hx))}" cy="${round(hy - 4)}" rx="${round(w * 0.2)}" ry="${round(w * 0.13)}" fill="#FFF0B0" fill-opacity="0.55" filter="url(#f-tiny)"/>`
  }).join('\n          ')
}

/** Leaves with a soft drop shadow under each, so layers read as plush feathers. */
export const layered = (list, fill, mirrorIt, tipRound = 0.5) => list.map(([bx, by, tx, ty, w]) => {
  const d = leaf(bx, by, tx, ty, w, tipRound)
  const sh = leaf(bx + 2, by + 6, tx + 2, ty + 6, w, tipRound)
  return `<path d="${mirrorIt ? mirror(sh) : sh}" fill="${C.redShadow}" fill-opacity="0.2" filter="url(#f-soft)"/>
        <path d="${mirrorIt ? mirror(d) : d}" fill="${fill}"/>`
}).join('\n        ')

export function wing(side) {
  const m = side === 'right'
  const d = (p) => (m ? mirror(p) : p)
  return `
        <path d="${d(WING_L)}" transform="translate(${m ? -10 : 10} 8)" fill="${C.redShadow}" fill-opacity="0.35" filter="url(#f-soft)"/>
        ${leafs(PRIMARIES_L, 'url(#g-primary)', m, 0.3)}
        <path d="${d(WING_L)}" fill="url(#g-wing-${side})"/>
        ${innerShade(`wing-${side}`, d(WING_L), { color: C.redShadow, width: 30, opacity: 0.45 })}
        ${layered(COVERTS_L, 'url(#g-covert)', m, 0.3)}`
}

// Upper lid, parked just above the eye (clipped away) until a state lowers it.
const LID_FILL_L = 'M 170,160 L 316,160 L 316,244 C 290,252 200,252 170,244 Z'
const LID_EDGE_L = 'M 172,245 C 200,253 290,253 314,245'
// Expression eyes that replace the open eye: a happy "^" and a closed, relaxed "u".
const EYE_HAPPY_L = 'M 194,336 C 212,298 272,298 290,336'
const EYE_CLOSED_L = 'M 194,320 C 214,348 270,348 290,320'

export function eye(side) {
  const m = side === 'right'
  const f = (d) => (m ? mirror(d) : d)
  const ex = m ? mx(242) : 242
  const lx = m ? mx(241) : 241
  const ix = m ? mx(255) : 255
  const px = m ? mx(256) : 256
  // Highlights come from one light (upper right), so they are NOT mirrored.
  const hx = px + 16
  const sx = px - 15
  return `
        ${g(`eye-${side}`)}
          <ellipse cx="${ex}" cy="320" rx="80" ry="82" fill="url(#g-socket)"/>
          <ellipse cx="${lx}" cy="316" rx="68" ry="70" fill="url(#g-liner)"/>
          <ellipse cx="${ex}" cy="322" rx="63" ry="64" fill="url(#g-sclera)"/>
          <g clip-path="url(#clip-eye-${side})">
            ${g(`iris-${side}`)}
              <circle cx="${ix}" cy="326" r="47" fill="url(#g-iris)"/>
              <circle cx="${px}" cy="321" r="34" fill="url(#g-pupil)"/>
              <ellipse cx="${hx}" cy="297" rx="12.5" ry="11.5" fill="#FFFFFF"/>
              <circle cx="${sx}" cy="344" r="4.5" fill="#FFFFFF" fill-opacity="0.75"/>
            </g>
            ${g(`lid-${side}`)}
              <path d="${f(LID_FILL_L)}" fill="url(#g-lid)"/>
              <path d="${f(LID_EDGE_L)}" fill="none" stroke="${C.liner}" stroke-width="7" stroke-linecap="round"/>
            </g>
          </g>
        </g>
        ${g(`eye-happy-${side}`)}
          <path d="${f(EYE_HAPPY_L)}" fill="none" stroke="${C.liner}" stroke-width="13" stroke-linecap="round"/>
        </g>
        ${g(`eye-closed-${side}`)}
          <path d="${f(EYE_CLOSED_L)}" fill="none" stroke="${C.liner}" stroke-width="11" stroke-linecap="round"/>
        </g>`
}

export function headFeathers() {
  const one = ([x, y], i, flip) => {
    const tip = x === AXIS ? [x, y + 36] : [x - 9, y + 36]
    const d = leaf(x, y, tip[0], tip[1], 13)
    const fill = i % 2 ? '#B00610' : '#FF6A5A'
    const op = i % 2 ? 0.1 : 0.14
    return `<path d="${flip ? mirror(d) : d}" fill="${fill}" fill-opacity="${op}"/>`
  }
  return [
    ...HEAD_FEATHERS_L.map((p, i) => one(p, i, false)),
    ...HEAD_FEATHERS_L.map((p, i) => one(p, i + 1, true)),
    ...HEAD_FEATHERS_C.map((p, i) => one(p, i, false)),
  ].join('\n          ')
}

// Toes, left foot, outer → inner → middle (middle is in front): base → tip, width.
