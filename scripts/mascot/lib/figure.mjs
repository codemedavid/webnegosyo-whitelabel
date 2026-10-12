/** The owl himself: legs, body, wings, neckerchief, head and hat. */
import { leaf, mirror, mx } from './geometry.mjs'
import { C } from './palette.mjs'
import { eye, fluffEdge, headFeathers, innerShade, leafs, toes, wing } from './parts.mjs'
import { g } from './rig.mjs'
import {
  BEAK_LOWER, BEAK_UPPER, BROW_L, HEAD, HEAD_L, JACKET, MASK, MOUTH, SCARF_BAND, SCARF_KNOT,
  SCARF_TAIL, THIGH_L, TOES_L, TORSO, TUFT_BASE_L, TUFT_L,
} from './shapes.mjs'

export function figureMarkup() {
  return `  <ellipse id="shadow" cx="345" cy="884" rx="240" ry="18" fill="url(#g-shadow)"/>

  ${g('owl-figure')}

    <!-- ================= LEGS & FEET ================= -->
    ${g('leg-left')}
      <path d="M 272,790 L 240,836" stroke="url(#g-leg)" stroke-width="32" stroke-linecap="round"/>
      ${g('foot-left')}
          ${toes(TOES_L, 'left')}
      </g>
    </g>
    ${g('leg-right')}
      <path d="${mirror('M 272,790 L 240,836')}" stroke="url(#g-leg-r)" stroke-width="32" stroke-linecap="round"/>
      ${g('foot-right')}
          ${toes(TOES_L, 'right')}
      </g>
    </g>

    ${g('owl-upper')}

      <!-- ================= BODY ================= -->
      ${g('body')}
        <path id="torso" d="${TORSO}" fill="url(#g-torso)"/>
        <path id="thigh-left" d="${THIGH_L}" fill="url(#g-thigh)"/>
        <path id="thigh-right" d="${mirror(THIGH_L)}" fill="url(#g-thigh)"/>
        <ellipse cx="345" cy="768" rx="160" ry="14" fill="${C.redShadow}" fill-opacity="0.6" filter="url(#f-soft)"/>
        ${g('jacket')}
          <path d="${JACKET}" fill="url(#g-jacket)"/>
          <path d="${JACKET}" fill="url(#g-jacket-hem)"/>
          ${innerShade('jacket', JACKET, { color: '#A88E86', width: 46, opacity: 0.4, blur: 'f-softer' })}
          <ellipse cx="345" cy="482" rx="165" ry="14" fill="url(#g-chin-shadow)" fill-opacity="0.6"/>
          ${g('buttons')}
            ${[[268, 612], [271, 663], [276, 712], [mx(271), 663], [mx(276), 712]].map(([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="10.5" fill="url(#g-button)"/>
            <circle cx="${x - 3}" cy="${y - 4}" r="2.6" fill="#FFFFFF" fill-opacity="0.45"/>`).join('\n            ')}
          </g>
          <g id="chest-logo" data-note="stand-in for the SM monogram; swap in the real mark" transform="translate(-10 0)">
            <path d="M 459,557 C 453,549 437,550 436,560 C 435,571 458,568 458,580 C 458,591 440,592 432,584" fill="none" stroke="${C.red}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M 465,590 L 468,557 L 481,577 L 494,557 C 500,570 500,584 494,596" fill="none" stroke="${C.red}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M 470,606 C 470,594 490,594 490,606 Z" fill="${C.red}"/>
            <circle cx="480" cy="593" r="2.4" fill="${C.red}"/>
            <path d="M 465,607 L 495,607" stroke="${C.red}" stroke-width="3" stroke-linecap="round"/>
            <path d="M 430,596 C 436,614 466,622 500,606" fill="none" stroke="${C.logoOrange}" stroke-width="4" stroke-linecap="round"/>
          </g>
        </g>
      </g>

      <!-- ================= NECKERCHIEF ================= -->
      ${g('neckerchief')}
        <path d="${SCARF_BAND}" fill="url(#g-scarf)"/>
        ${innerShade('scarf-band', SCARF_BAND, { color: '#8E0206', width: 12, opacity: 0.3, blur: 'f-tiny' })}
        <path d="${'M 180,470 C 230,474 290,494 340,512'}" fill="none" stroke="#FF6B5E" stroke-opacity="0.5" stroke-width="4" stroke-linecap="round" filter="url(#f-tiny)"/>
        <path d="${mirror('M 180,470 C 230,474 290,494 340,512')}" fill="none" stroke="#FF6B5E" stroke-opacity="0.5" stroke-width="4" stroke-linecap="round" filter="url(#f-tiny)"/>
        ${g('neckerchief-tail')}
          <path d="${SCARF_TAIL}" transform="translate(5 8)" fill="#5E0A0A" fill-opacity="0.3" filter="url(#f-soft)"/>
          <path d="${SCARF_TAIL}" fill="url(#g-scarf-tail)"/>
          ${innerShade('scarf-tail', SCARF_TAIL, { color: '#8E0206', width: 12, opacity: 0.45, blur: 'f-tiny' })}
          <path d="M 344,550 C 341,580 342,615 346,648" fill="none" stroke="#9E0408" stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round"/>
        </g>
        <path d="${SCARF_KNOT}" fill="url(#g-knot)"/>
        ${innerShade('scarf-knot', SCARF_KNOT, { color: '#8E0206', width: 12, opacity: 0.5, blur: 'f-tiny' })}
        <path d="M 330,506 C 324,522 326,540 334,552 M 360,506 C 366,522 364,540 356,552" fill="none" stroke="#A50308" stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M 322,512 C 334,505 356,505 368,512" fill="none" stroke="#FF8A7C" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>
        <path d="M 316,536 C 326,546 340,550 352,549" fill="none" stroke="#9E0408" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>
      </g>

      <!-- ================= WINGS ================= -->
      ${g('wing-left')}${wing('left')}
      </g>
      ${g('wing-right')}${wing('right')}
      </g>

      <!-- ================= HEAD ================= -->
      ${g('head')}
        <ellipse cx="345" cy="476" rx="160" ry="8" fill="${C.redShadow}" fill-opacity="0.18" filter="url(#f-soft)"/>
        ${g('tuft-left')}
          <path d="${TUFT_BASE_L}" fill="url(#g-tuft)"/>
          ${leafs(TUFT_L, 'url(#g-tuft)', false, 0.08)}
        </g>
        ${g('tuft-right')}
          <path d="${mirror(TUFT_BASE_L)}" fill="url(#g-tuft)"/>
          ${leafs(TUFT_L, 'url(#g-tuft)', true, 0.08)}
        </g>

        ${g('head-fluff')}
          ${fluffEdge(HEAD_L, { fromY: 250, toY: 476, step: 14, len: 9, w: 14 })}
        </g>
        <path id="head-shape" d="${HEAD}" fill="url(#g-head)"/>
        ${innerShade('head', HEAD, { color: '#8A040A', width: 40, opacity: 0.35, blur: 'f-softer' })}
        ${g('head-feathers')}
          ${headFeathers()}
        </g>
        <ellipse cx="345" cy="174" rx="165" ry="14" fill="${C.redShadow}" fill-opacity="0.55" filter="url(#f-soft)"/>

        <path id="face-mask" d="${MASK}" fill="url(#g-mask)"/>
        ${innerShade('mask', MASK, { color: '#C8968A', width: 20, opacity: 0.55 })}
        <ellipse cx="345" cy="400" rx="62" ry="40" fill="#8A5A48" fill-opacity="0.22" filter="url(#f-soft)"/>
        ${eye('left')}
        ${eye('right')}

        ${g('brow-left')}
          <path d="${BROW_L}" fill="url(#g-brow)"/>
        </g>
        ${g('brow-right')}
          <path d="${mirror(BROW_L)}" fill="url(#g-brow)"/>
        </g>

        ${g('beak')}
          ${g('mouth')}
            <path d="${MOUTH}" fill="${C.mouth}"/>
            <g clip-path="url(#clip-mouth)">
              <ellipse cx="346" cy="414" rx="24" ry="16" fill="url(#g-tongue)"/>
            </g>
          </g>
          ${g('beak-lower')}
            <path d="${BEAK_LOWER}" fill="url(#g-beak-lower)"/>
            ${innerShade('beak-lower', BEAK_LOWER, { color: '#B05000', width: 10, opacity: 0.5, blur: 'f-tiny' })}
          </g>
          <path id="beak-upper" d="${BEAK_UPPER}" fill="url(#g-beak)"/>
          ${innerShade('beak-upper', BEAK_UPPER, { color: '#C25A00', width: 12, opacity: 0.55, blur: 'f-tiny' })}
          <path d="${leaf(339, 318, 341, 372, 16, 0.4)}" fill="#FFF3C0" fill-opacity="0.65" filter="url(#f-tiny)"/>
        </g>

        <!-- ================= HAT (serving cloche) ================= -->
        ${g('hat')}
          <g transform="rotate(-3 345 160)">
            <path id="hat-dome" d="M 196,163 C 194,64 496,64 494,163 Z" fill="url(#g-dome)"/>
            <path d="M 196,163 C 194,64 496,64 494,163 Z" fill="url(#g-dome-shade)"/>
            <path d="M 196,163 C 194,64 496,64 494,163 Z" fill="url(#g-dome-red)"/>
            <path d="M 222,140 C 236,104 280,88 322,84" fill="none" stroke="#FFFBE8" stroke-opacity="0.6" stroke-width="7" stroke-linecap="round" filter="url(#f-tiny)"/>
            <path d="M 470,146 C 466,124 452,108 434,98" fill="none" stroke="#FFE7A0" stroke-opacity="0.5" stroke-width="5" stroke-linecap="round" filter="url(#f-tiny)"/>
            <path id="hat-rim" d="M 188,156 Q 345,170 502,156 C 507,159 507,166 502,168 Q 345,183 188,168 C 183,166 183,159 188,156 Z" fill="url(#g-rim)"/>
            <path d="M 190,168 Q 345,183 500,168" fill="none" stroke="${C.goldDeep}" stroke-opacity="0.55" stroke-width="2"/>
            ${g('hat-knob')}
              <ellipse cx="345" cy="88" rx="30" ry="7" fill="url(#g-gold-h)"/>
              <path d="M 328,86 C 330,78 332,72 334,66 L 356,66 C 358,72 360,78 362,86 Z" fill="url(#g-gold-h)"/>
              <ellipse cx="345" cy="50" rx="34" ry="24" fill="url(#g-knob)"/>
              <ellipse cx="333" cy="40" rx="11" ry="6" fill="#FFFBE6" fill-opacity="0.8"/>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>`
}
