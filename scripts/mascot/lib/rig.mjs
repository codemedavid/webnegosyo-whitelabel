/**
 * The rig: every part that moves or swaps, and the point it pivots on.
 *
 * Each part is a <g id="X" class="o-X"> with transform-origin set inline, so
 * a CSS/JS animation can rotate or scale it without choosing an origin. No
 * rigged group carries a transform attribute, so animations never fight a rest
 * pose. Parts with `hidden: true` start at opacity 0 (expression variants and
 * effects that a state reveals).
 */
export const RIG = {
  'owl-figure': [345, 885],
  'leg-left': [256, 800],
  'leg-right': [434, 800],
  'foot-left': [244, 836],
  'foot-right': [446, 836],
  'owl-upper': [345, 815],
  body: null,
  jacket: null,
  buttons: null,
  neckerchief: null,
  'neckerchief-tail': [345, 535],
  'wing-left': [165, 505],
  'wing-right': [525, 505],
  head: [345, 472],
  'tuft-left': [170, 200],
  'tuft-right': [520, 200],
  'head-fluff': null,
  'head-feathers': null,
  'eye-left': [242, 320],
  'eye-right': [448, 320],
  'iris-left': [255, 326],
  'iris-right': [435, 326],
  'lid-left': [242, 250],
  'lid-right': [448, 250],
  'eye-happy-left': [242, 320, { hidden: true }],
  'eye-happy-right': [448, 320, { hidden: true }],
  'eye-closed-left': [242, 330, { hidden: true }],
  'eye-closed-right': [448, 330, { hidden: true }],
  'brow-left': [238, 212],
  'brow-right': [452, 212],
  beak: null,
  mouth: [345, 380],
  'beak-lower': [345, 380],
  hat: [345, 160],
  'hat-knob': [345, 84],
  fx: null,
  'fx-zz': [540, 140, { hidden: true }],
  'fx-dots': [590, 100, { hidden: true }],
  'fx-sweat': [566, 226, { hidden: true }],
  'fx-sparkles': [345, 300, { hidden: true }],
  'fx-confetti': [345, 160, { hidden: true }],
}

/** Opening tag for a rigged group. */
export function g(id) {
  if (!(id in RIG)) throw new Error(`"${id}" is not in the rig`)
  const entry = RIG[id]
  const attrs = [`id="${id}"`, `class="o-${id}"`]
  if (entry) {
    const [x, y, opts = {}] = entry
    attrs.push(`style="transform-origin:${x}px ${y}px"`)
    if (opts.hidden) attrs.push('opacity="0"')
  }
  return `<g ${attrs.join(' ')}>`
}
