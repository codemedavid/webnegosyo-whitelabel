/** <defs>: gradients, blur filters and clip paths shared by every part. */
import { mx } from './geometry.mjs'
import { C } from './palette.mjs'
import { MOUTH } from './shapes.mjs'

/** `clips` is the markup for the clip paths the parts registered (innerShade). */
export function defsMarkup(clips) {
  return `  <defs>
    <radialGradient id="g-head" cx="40%" cy="30%" r="75%">
      <stop offset="0" stop-color="${C.redLit}"/>
      <stop offset="0.55" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDeep}"/>
    </radialGradient>
    <linearGradient id="g-tuft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.redLit}"/>
      <stop offset="1" stop-color="${C.red}"/>
    </linearGradient>
    <radialGradient id="g-fluff" cx="30%" cy="50%" r="80%">
      <stop offset="0" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDeep}"/>
    </radialGradient>
    <radialGradient id="g-mask" cx="50%" cy="38%" r="65%">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.62" stop-color="${C.mask}"/>
      <stop offset="0.9" stop-color="#F2E2DA"/>
      <stop offset="1" stop-color="${C.maskShade}"/>
    </radialGradient>
    <radialGradient id="g-socket" cx="50%" cy="50%" r="50%">
      <stop offset="0.8" stop-color="${C.socket}" stop-opacity="0.25"/>
      <stop offset="1" stop-color="${C.socket}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-sclera" cx="55%" cy="45%" r="60%">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.8" stop-color="#FBF8F6"/>
      <stop offset="1" stop-color="#E4DAD6"/>
    </radialGradient>
    <radialGradient id="g-iris" cx="50%" cy="72%" r="72%">
      <stop offset="0" stop-color="#FFC24A"/>
      <stop offset="0.4" stop-color="#F08A1C"/>
      <stop offset="0.75" stop-color="#B04A0E"/>
      <stop offset="1" stop-color="${C.irisDark}"/>
    </radialGradient>
    <radialGradient id="g-pupil" cx="45%" cy="40%" r="60%">
      <stop offset="0" stop-color="#2A1A16"/>
      <stop offset="1" stop-color="${C.pupil}"/>
    </radialGradient>
    <!-- Lid line: heavy on top, fading out along the bottom of the eye. -->
    <linearGradient id="g-liner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.liner}"/>
      <stop offset="0.55" stop-color="${C.liner}"/>
      <stop offset="0.8" stop-color="#3A2620" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#6A5048" stop-opacity="0.25"/>
    </linearGradient>
    <linearGradient id="g-lid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#EAD6CD"/>
      <stop offset="1" stop-color="#FFF4EE"/>
    </linearGradient>
    <linearGradient id="g-brow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A2A1E"/>
      <stop offset="1" stop-color="${C.brow}"/>
    </linearGradient>

    <linearGradient id="g-beak" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.beakLit}"/>
      <stop offset="0.45" stop-color="${C.beak}"/>
      <stop offset="1" stop-color="${C.beakDeep}"/>
    </linearGradient>
    <linearGradient id="g-beak-lower" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.beak}"/>
      <stop offset="1" stop-color="${C.beakDeep}"/>
    </linearGradient>
    <radialGradient id="g-tongue" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="${C.tongueLit}"/>
      <stop offset="1" stop-color="${C.tongue}"/>
    </radialGradient>

    <linearGradient id="g-dome" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#B0560A"/>
      <stop offset="0.18" stop-color="#DD7C16"/>
      <stop offset="0.42" stop-color="#F6A626"/>
      <stop offset="0.55" stop-color="#FFE08A"/>
      <stop offset="0.6" stop-color="${C.goldShine}"/>
      <stop offset="0.68" stop-color="#FBC24E"/>
      <stop offset="0.9" stop-color="#E88A16"/>
      <stop offset="1" stop-color="#B0560A"/>
    </linearGradient>
    <linearGradient id="g-dome-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.25"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="${C.goldDeep}" stop-opacity="0.35"/>
    </linearGradient>
    <radialGradient id="g-dome-red" cx="25%" cy="85%" r="45%">
      <stop offset="0" stop-color="${C.red}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${C.red}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="g-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF8D6"/>
      <stop offset="0.6" stop-color="#FBE3A0"/>
      <stop offset="1" stop-color="#E3A13C"/>
    </linearGradient>
    <radialGradient id="g-knob" cx="38%" cy="30%" r="70%">
      <stop offset="0" stop-color="${C.goldShine}"/>
      <stop offset="0.35" stop-color="${C.goldLit}"/>
      <stop offset="0.75" stop-color="${C.gold}"/>
      <stop offset="1" stop-color="#D0582A"/>
    </radialGradient>
    <linearGradient id="g-gold-h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.goldDeep}"/>
      <stop offset="0.45" stop-color="${C.goldLit}"/>
      <stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <radialGradient id="g-under-rim" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${C.redShadow}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${C.redShadow}" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="g-torso" cx="50%" cy="40%" r="65%">
      <stop offset="0" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDeep}"/>
    </radialGradient>
    <linearGradient id="g-jacket" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#DCC6C0"/>
      <stop offset="0.16" stop-color="#F6ECE9"/>
      <stop offset="0.45" stop-color="${C.jacket}"/>
      <stop offset="0.84" stop-color="#F6ECE9"/>
      <stop offset="1" stop-color="#DCC6C0"/>
    </linearGradient>
    <linearGradient id="g-jacket-hem" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.62" stop-color="${C.jacketDeep}" stop-opacity="0"/>
      <stop offset="1" stop-color="${C.jacketDeep}" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="g-chin-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#6E0A0A" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#6E0A0A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-button" cx="38%" cy="35%" r="65%">
      <stop offset="0" stop-color="#4A4644"/>
      <stop offset="1" stop-color="${C.button}"/>
    </radialGradient>
    <linearGradient id="g-thigh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.redShadow}"/>
      <stop offset="0.35" stop-color="${C.redDeep}"/>
      <stop offset="1" stop-color="${C.red}"/>
    </linearGradient>

    <linearGradient id="g-scarf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F01A1F"/>
      <stop offset="1" stop-color="#C80309"/>
    </linearGradient>
    <radialGradient id="g-knot" cx="45%" cy="35%" r="65%">
      <stop offset="0" stop-color="#F8322E"/>
      <stop offset="0.7" stop-color="#E81419"/>
      <stop offset="1" stop-color="#B80309"/>
    </radialGradient>
    <linearGradient id="g-scarf-tail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#C90308"/>
      <stop offset="0.48" stop-color="#E50D14"/>
      <stop offset="0.52" stop-color="#F6262A"/>
      <stop offset="1" stop-color="#E0131A"/>
    </linearGradient>

    <linearGradient id="g-wing-left" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${C.redLit}"/>
      <stop offset="0.5" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDeep}"/>
    </linearGradient>
    <linearGradient id="g-wing-right" x1="1" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${C.redLit}"/>
      <stop offset="0.5" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDeep}"/>
    </linearGradient>
    <radialGradient id="g-covert" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#FF3D33"/>
      <stop offset="0.7" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDeep}"/>
    </radialGradient>
    <radialGradient id="g-covert-upper" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#FF4A3E"/>
      <stop offset="0.75" stop-color="#F0161C"/>
      <stop offset="1" stop-color="#C8080E"/>
    </radialGradient>
    <radialGradient id="g-primary" cx="50%" cy="62%" r="70%">
      <stop offset="0" stop-color="#FFC445"/>
      <stop offset="0.65" stop-color="#FA9812"/>
      <stop offset="1" stop-color="${C.orangeDeep}"/>
    </radialGradient>

    <linearGradient id="g-leg" gradientUnits="userSpaceOnUse" x1="228" y1="0" x2="292" y2="0">
      <stop offset="0" stop-color="${C.footDeep}"/>
      <stop offset="0.45" stop-color="${C.orangeLit}"/>
      <stop offset="1" stop-color="${C.footDeep}"/>
    </linearGradient>
    <linearGradient id="g-leg-r" gradientUnits="userSpaceOnUse" x1="${mx(292)}" y1="0" x2="${mx(228)}" y2="0">
      <stop offset="0" stop-color="${C.footDeep}"/>
      <stop offset="0.55" stop-color="${C.orangeLit}"/>
      <stop offset="1" stop-color="${C.footDeep}"/>
    </linearGradient>
    <radialGradient id="g-toe" cx="50%" cy="28%" r="78%">
      <stop offset="0" stop-color="${C.footLit}"/>
      <stop offset="0.5" stop-color="${C.foot}"/>
      <stop offset="1" stop-color="${C.footDeep}"/>
    </radialGradient>
    <radialGradient id="g-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#3B1A12" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#3B1A12" stop-opacity="0"/>
    </radialGradient>

    <filter id="f-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="f-tiny" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5"/></filter>
    <filter id="f-softer" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>

    <clipPath id="clip-eye-left"><ellipse cx="242" cy="322" rx="63" ry="64"/></clipPath>
    <clipPath id="clip-eye-right"><ellipse cx="${mx(242)}" cy="322" rx="63" ry="64"/></clipPath>
    <clipPath id="clip-mouth"><path d="${MOUTH}"/></clipPath>
    ${clips}
  </defs>`
}
