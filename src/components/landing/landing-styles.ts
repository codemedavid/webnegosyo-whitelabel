import { COURT } from './landing-theme'

/**
 * The court's stylesheet. It lives with the surface rather than in globals.css
 * so a marketing-only world never ships inside every tenant storefront's CSS,
 * and every rule is namespaced under `.landing-world`.
 *
 * The type scale is here rather than in Tailwind arbitrary values because
 * Tailwind v4 cannot type-infer `text-[clamp(...)]` and silently emits nothing
 * for it — a class it drops is a heading that renders at 16px.
 */
export const LANDING_STYLES = `
.landing-world {
  font-family: var(--font-landing-text), ui-sans-serif, system-ui, sans-serif;
  color-scheme: dark;
  background-color: ${COURT.ground};
}

.landing-world .font-display {
  font-family: var(--font-landing-display), ui-sans-serif, system-ui, sans-serif;
  font-weight: 400;
}

/* Display scale. Every step is a clamp so the page never needs a breakpoint
   just to keep a headline off four lines. */
.landing-world .t-hero      { font-size: clamp(2.7rem, 8.4vw, 4.6rem); }
.landing-world .t-close     { font-size: clamp(2.2rem, 7vw, 4rem); }
.landing-world .t-section   { font-size: clamp(2rem, 5.4vw, 3.4rem); }
.landing-world .t-leak      { font-size: clamp(1.55rem, 4.2vw, 2.4rem); }
.landing-world .t-play      { font-size: clamp(1.55rem, 3.6vw, 2.2rem); }
.landing-world .t-verdict   { font-size: clamp(1.2rem, 2.8vw, 1.75rem); }
.landing-world .t-step      { font-size: clamp(1.2rem, 2.5vw, 1.55rem); }
.landing-world .t-leaktitle { font-size: clamp(1.1rem, 2.3vw, 1.5rem); }
.landing-world .t-tarp      { font-size: clamp(1.02rem, 1.9vw, 1.3rem); }
.landing-world .t-lead      { font-size: clamp(1rem, 1.9vw, 1.15rem); }

/* The nav is fixed, so the hero owns its own clearance rather than trusting a
   utility to survive a scan. */
.landing-world .landing-hero-section {
  padding-top: 5.5rem;
  padding-bottom: 3.5rem;
}

@media (min-width: 768px) {
  .landing-world .landing-hero-section {
    padding-top: 9.5rem;
    padding-bottom: 6rem;
  }
}

/* Grid templates Tailwind cannot express as arbitrary values (commas). */
@media (min-width: 1024px) {
  .landing-world .landing-hero-grid {
    grid-template-columns: 1fr minmax(0, 520px);
  }
  .landing-world .landing-hero-copy  { grid-column: 1; grid-row: 1; }
  .landing-world .landing-hero-board { grid-column: 2; grid-row: 1; }
}

@media (min-width: 768px) {
  .landing-world .landing-leak-row {
    grid-template-columns: minmax(0, 14rem) 1fr;
  }
}

/* The chalk plate: a clipped outline layer with the court showing through an
   inset fill, because a clip-path cuts a real border into open corners. */
.landing-world .landing-chalk-fill {
  position: absolute;
  inset: 2px;
  transition: background-color 150ms ease-out;
}

.landing-world .landing-chalk:hover .landing-chalk-fill,
.landing-world .landing-chalk:focus-visible .landing-chalk-fill {
  background-color: ${COURT.groundLit};
}

/* On vinyl the plate brightens toward the print, not toward the court. */
.landing-world .landing-tarpghost:hover .landing-chalk-fill,
.landing-world .landing-tarpghost:focus-visible .landing-chalk-fill {
  background-color: rgba(255, 255, 255, 0.16);
}

.landing-world .landing-grommet {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 30%, #F2F2EE, #7C7C74 55%, #35352F 100%);
  box-shadow: inset 0 0 0 2.5px rgba(0, 0, 0, 0.5);
}

.landing-world .landing-grommet.g-panel { --g: 10px; }
.landing-world .landing-grommet.g-wide  { --g: 16px; }
.landing-world .landing-grommet.g-tl { top: var(--g); left: var(--g); }
.landing-world .landing-grommet.g-tr { top: var(--g); right: var(--g); }
.landing-world .landing-grommet.g-bl { bottom: var(--g); left: var(--g); }
.landing-world .landing-grommet.g-br { bottom: var(--g); right: var(--g); }

/* A real tarp wall is not eight identical banners. */
@media (min-width: 640px) {
  .landing-world .landing-tarp-wall > li[data-span='wide'] { grid-column: span 2; }
  .landing-world .landing-tarp-wall > li[data-span='tall'] { grid-row: span 2; }
}

/* The plate depresses onto its own shadow rather than lifting. */
.landing-world .landing-plate:active {
  box-shadow: 0 2px 0 0 ${COURT.plateRedDeep};
}

.landing-world .landing-navlink {
  color: ${COURT.laneDim};
  transition: color 150ms ease-out;
}

.landing-world .landing-navlink:hover,
.landing-world .landing-navlink:focus-visible {
  color: ${COURT.lane};
}

.landing-world :focus-visible {
  outline: 2px solid ${COURT.ledAmber};
  outline-offset: 3px;
}

@keyframes landing-strip {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.landing-world .landing-strip {
  animation: landing-strip 34s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .landing-world .landing-strip { animation: none; }
  .landing-world * { transition-duration: 1ms !important; }
}
`
