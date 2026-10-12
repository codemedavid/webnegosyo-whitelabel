/** Path geometry for the owl. Everything is absolute viewBox units (0 0 690 915). */

export const AXIS = 345

export const round = (n) => Math.round(n * 10) / 10

/** Mirror an x coordinate across the axis. */
export const mx = (x) => round(2 * AXIS - x)

/** Mirror an absolute-command path (M L C Q Z only) across the axis. */
export function mirror(d) {
  return d.replace(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${round(2 * AXIS - Number(x))},${y}`)
}

/** The cubic segments of an absolute "M … C …" path. */
export function cubics(d) {
  const segs = []
  let cur = null
  for (const [, cmd, args] of d.matchAll(/([MC])\s*([^MCZ]+)/g)) {
    const nums = args.trim().split(/[\s,]+/).map(Number)
    if (cmd === 'M') { cur = [nums[0], nums[1]]; continue }
    for (let i = 0; i < nums.length; i += 6) {
      const [c1x, c1y, c2x, c2y, x, y] = nums.slice(i, i + 6)
      segs.push({ from: cur, c1: [c1x, c1y], c2: [c2x, c2y], to: [x, y] })
      cur = [x, y]
    }
  }
  return segs
}

/** A path drawn from its left half (start on the axis, end on the axis). */
export function symmetric(leftHalf) {
  const m = ([x, y]) => `${round(2 * AXIS - x)},${y}`
  const back = cubics(leftHalf).reverse().map((s) => `C ${m(s.c2)} ${m(s.c1)} ${m(s.from)}`).join(' ')
  return `${leftHalf} ${back} Z`
}

/**
 * Points along a left-half outline every ~step units, with the outward normal
 * (the outline runs from the top of the axis, down the left side, back to the axis).
 */
export function sampleOutline(leftHalf, step) {
  const at = ({ from, c1, c2, to }, t) => {
    const u = 1 - t
    const pt = (i) => u * u * u * from[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * to[i]
    const dt = (i) => 3 * u * u * (c1[i] - from[i]) + 6 * u * t * (c2[i] - c1[i]) + 3 * t * t * (to[i] - c2[i])
    const [dx, dy] = [dt(0), dt(1)]
    const len = Math.hypot(dx, dy) || 1
    return { x: pt(0), y: pt(1), nx: -dy / len, ny: dx / len }
  }
  const out = []
  let carry = 0
  for (const seg of cubics(leftHalf)) {
    const fine = Array.from({ length: 41 }, (_, i) => at(seg, i / 40))
    for (let i = 1; i < fine.length; i++) {
      carry += Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y)
      if (carry >= step) { out.push(fine[i]); carry = 0 }
    }
  }
  return out
}

/** A feather / leaf: rounded base at (bx,by), rounded tip at (tx,ty). */
export function leaf(bx, by, tx, ty, w, tipRound = 0.5) {
  const dx = tx - bx, dy = ty - by
  const len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len
  const nx = -uy, ny = ux
  const h = w / 2
  const p = (along, side) => `${round(bx + ux * along + nx * side)},${round(by + uy * along + ny * side)}`
  return [
    `M ${p(0, 0)}`,
    `C ${p(0, h * 0.9)} ${p(len * 0.35, h * 1.05)} ${p(len * 0.62, h)}`,
    `C ${p(len * 0.9, h * 0.9)} ${p(len, h * tipRound)} ${p(len, 0)}`,
    `C ${p(len, -h * tipRound)} ${p(len * 0.9, -h * 0.9)} ${p(len * 0.62, -h)}`,
    `C ${p(len * 0.35, -h * 1.05)} ${p(0, -h * 0.9)} ${p(0, 0)} Z`,
  ].join(' ')
}

