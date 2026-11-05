import { FN } from './funnel-ui'

/**
 * Every /funnel style, scoped to .funnel-world so none of it reaches the
 * storefronts. Values follow the reference page's own rules (sizes, tracking,
 * glows, the CTA's layered shadows) as captured with REA; colours are FN (SmartMenu).
 */
export const FUNNEL_STYLES = `
.funnel-world {
  font-family: var(--fn-sans), -apple-system, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
  background-color: ${FN.bg};
  color: ${FN.text2};
  color-scheme: dark;
}
.funnel-world .fn-serif { font-family: var(--fn-serif), Georgia, serif; font-style: italic; }
.funnel-world .fn-tabular { font-variant-numeric: tabular-nums; }

/* Type */
.funnel-world .fn-h1 {
  font-size: clamp(34px, 6vw, 60px); font-weight: 500; line-height: 1.08;
  letter-spacing: -0.024em; color: ${FN.text}; text-align: center; text-wrap: balance;
}
.funnel-world .fn-h2 {
  margin-top: 14px; font-size: clamp(28px, 4.5vw, 44px); font-weight: 500; line-height: 1.1;
  letter-spacing: -0.022em; color: ${FN.text}; text-wrap: balance;
}
.funnel-world .fn-h3 {
  font-size: clamp(23px, 3.4vw, 30px); font-weight: 500; line-height: 1.15;
  letter-spacing: -0.02em; color: ${FN.text}; text-wrap: balance;
}
.funnel-world .fn-lead { font-size: clamp(16px, 2vw, 18px); line-height: 1.55; color: ${FN.text2}; text-wrap: pretty; }
.funnel-world .fn-body { font-size: 15px; font-weight: 300; line-height: 1.55; color: rgba(239,230,216,0.72); }
.funnel-world .fn-accent { color: ${FN.redBright}; text-shadow: 0 0 24px rgba(255,94,74,0.3); }
.funnel-world .fn-accent-warm {
  font-family: var(--fn-serif), Georgia, serif; font-style: italic; font-weight: 500;
  color: ${FN.amber}; letter-spacing: -0.01em; text-shadow: 0 0 28px rgba(245,166,35,0.35);
}

/* Kicker */
.funnel-world .fn-kicker {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
  width: fit-content; margin: 0 auto; font-size: 11px; font-weight: 400; letter-spacing: 0.09em;
  text-transform: uppercase; text-align: center;
}
.funnel-world .fn-kicker--red { color: ${FN.redBright}; text-shadow: 0 0 16px rgba(255,94,74,0.4); }
.funnel-world .fn-kicker--amber { color: ${FN.amber}; text-shadow: 0 0 14px rgba(245,166,35,0.45); font-weight: 700; letter-spacing: 0.27em; }
.funnel-world .fn-dot {
  width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: currentColor;
  box-shadow: 0 0 10px currentColor;
}

/* Highlighter */
.funnel-world .fn-marker {
  padding: 0 3px; border-radius: 3px; color: ${FN.markerInk}; white-space: nowrap;
  background: linear-gradient(transparent 14%, ${FN.marker} 0, ${FN.marker} 92%, transparent 0);
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
}

/* CTA */
.funnel-world .fn-cta {
  position: relative; isolation: isolate; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; color: #fff;
  font-weight: 700; letter-spacing: 0.02em; text-align: center; text-decoration: none;
  background: linear-gradient(135deg, #F0533A 0%, ${FN.red} 50%, ${FN.redDeep} 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.38), inset 0 -1px 0 rgba(0,0,0,0.22),
    0 1px 2px rgba(0,0,0,0.25), 0 4px 32px rgba(215,38,29,0.4);
  transition: transform .25s ease, box-shadow .25s ease, filter .25s ease;
  outline-color: ${FN.marker};
}
.funnel-world .fn-cta > * { position: relative; z-index: 3; }
.funnel-world .fn-cta::before {
  content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; border-radius: inherit; padding: 1px;
  background: linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.15) 35%, rgba(0,0,0,0.15));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
}
.funnel-world .fn-cta::after {
  content: ''; position: absolute; z-index: 2; pointer-events: none; top: -40%; left: -20%; width: 22%; height: 180%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.18) 60%, transparent);
  filter: blur(8px); transform: rotate(18deg) translateX(-180%); opacity: 0;
}
.funnel-world .fn-cta:hover {
  transform: translateY(-2px); filter: brightness(1.06);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.22),
    0 1px 2px rgba(0,0,0,0.25), 0 6px 40px rgba(215,38,29,0.55);
}
.funnel-world .fn-cta:active { transform: translateY(0); filter: brightness(0.98); }
.funnel-world .fn-cta:disabled { cursor: progress; opacity: 0.7; transform: none; }
.funnel-world .fn-cta--large { width: 100%; min-height: 64px; padding: 20px 28px; font-size: clamp(17px, 2.4vw, 21px); }
.funnel-world .fn-cta--small { min-height: 40px; padding: 9px 18px; font-size: 12.5px; letter-spacing: 0.04em; }

/* Red proof tag under the hero button */
.funnel-world .fn-proof-tag {
  position: relative; width: fit-content; max-width: min(360px, 90%); margin: 6px auto 0; padding: 12px 22px 14px;
  text-align: center; border-radius: 18px; background: linear-gradient(180deg, #E8402F, #C4211A);
  box-shadow: 0 14px 34px rgba(215,38,29,0.4), inset 0 1px 0 rgba(255,255,255,0.25);
}
.funnel-world .fn-proof-tag::before {
  content: ''; position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
  border-left: 13px solid transparent; border-right: 13px solid transparent; border-bottom: 12px solid #E8402F;
}

/* Surfaces */
.funnel-world .fn-card { background: ${FN.panel}; border: 1px solid ${FN.line}; border-radius: 20px; }
.funnel-world .fn-card--amber {
  border-color: rgba(245,166,35,0.45);
  background: linear-gradient(180deg, rgba(245,166,35,0.09), rgba(245,166,35,0.02)), ${FN.panel};
  box-shadow: 0 0 34px rgba(245,166,35,0.16);
}
.funnel-world .fn-rule { border-color: ${FN.line}; }
.funnel-world .fn-num {
  font-size: 64px; line-height: 52px; font-weight: 500; letter-spacing: -2px; color: transparent;
  -webkit-text-stroke: 1.5px rgba(245,166,35,0.6); user-select: none;
}
@media (min-width: 768px) { .funnel-world .fn-num { font-size: 96px; line-height: 76px; letter-spacing: -4px; } }
.funnel-world .fn-shot {
  border-radius: 16px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 24px 80px rgba(0,0,0,0.45);
}

/* Bonus */
.funnel-world .fn-tile {
  display: flex; align-items: center; justify-content: center; width: 60px; height: 60px; flex-shrink: 0; border-radius: 16px;
  background: radial-gradient(120% 120% at 20% 0, rgba(245,166,35,0.12), transparent 55%), rgba(14,11,9,0.9);
  border: 1px solid rgba(245,166,35,0.22); box-shadow: 0 0 24px rgba(245,166,35,0.12), inset 0 1px 0 rgba(255,255,255,0.08);
  color: ${FN.amber};
}
@media (min-width: 640px) { .funnel-world .fn-tile { width: 72px; height: 72px; border-radius: 20px; } }
.funnel-world .fn-eyebrow-serif {
  font-family: var(--fn-serif), Georgia, serif; font-style: italic; font-size: 15px; color: ${FN.amber};
  text-shadow: 0 0 12px rgba(245,166,35,0.35);
}
.funnel-world .fn-worth { font-size: 11px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: rgba(239,230,216,0.5); white-space: nowrap; }
.funnel-world .fn-worth-old { font-size: 15px; font-weight: 400; letter-spacing: 0; color: #BFB2A2; text-decoration: line-through; text-decoration-color: rgba(255,94,74,0.75); }
.funnel-world .fn-free { font-size: 15px; letter-spacing: 0.03em; color: ${FN.amber}; text-shadow: 0 0 12px rgba(245,166,35,0.35); }
.funnel-world .fn-tag {
  display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; line-height: 1.4;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${FN.amber}; border: 1px solid rgba(245,166,35,0.3); background: rgba(245,166,35,0.07);
}
.funnel-world .fn-tag--red { color: #FF6A55; border-color: rgba(255,94,74,0.38); background: rgba(255,94,74,0.07); }
.funnel-world .fn-tag .fn-dot { width: 5px; height: 5px; box-shadow: 0 0 8px currentColor; }

/* Big figure */
.funnel-world .fn-stat-value {
  font-family: var(--fn-serif), Georgia, serif; font-style: italic; font-weight: 400;
  font-size: clamp(44px, 6.4vw, 64px); line-height: 1; letter-spacing: -0.01em;
  color: ${FN.amber}; text-shadow: 0 0 28px rgba(245,166,35,0.3);
}

/* Countdown */
.funnel-world .fn-cd-num {
  font-family: var(--fn-serif), Georgia, serif; font-style: italic; font-weight: 500; line-height: 1;
  font-size: clamp(18px, 3.2vw, 26px); letter-spacing: -0.01em; color: ${FN.redBright};
  text-shadow: 0 0 14px rgba(255,94,74,0.45); font-variant-numeric: tabular-nums;
}
.funnel-world .fn-cd-num--secs { color: #FF8A73; }
.funnel-world .fn-cd-unit { margin-top: 4px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(255,140,120,0.7); }
@media (max-width: 380px) {
  .funnel-world .fn-cd-unit { font-size: 7.5px; }
}

/* Header */
.funnel-world .fn-nav {
  background: rgba(20,16,13,0.65); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

/* Form */
.funnel-world .fn-input {
  display: block; width: 100%; min-height: 48px; padding: 0 14px; border-radius: 10px; font-size: 16px; color: #fff;
  background: rgba(10,8,6,0.7); border: 1px solid rgba(255,255,255,0.1); outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.funnel-world .fn-input::placeholder { color: #7A6E62; }
.funnel-world .fn-input:focus { border-color: rgba(245,166,35,0.55); box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
.funnel-world .fn-input[aria-invalid='true'] { border-color: rgba(255,94,74,0.7); }
.funnel-world .fn-input:-webkit-autofill { -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0F0C0A inset; }
.funnel-world .fn-choice {
  display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 12px 14px; border-radius: 12px; cursor: pointer;
  background: rgba(10,8,6,0.7); border: 1px solid rgba(255,255,255,0.1); transition: border-color .15s ease, background .15s ease;
}
.funnel-world .fn-choice:has(input:checked) { border-color: rgba(245,166,35,0.55); background: rgba(245,166,35,0.06); }
.funnel-world .fn-choice:has(input:focus-visible) { box-shadow: 0 0 0 3px rgba(245,166,35,0.2); }
.funnel-world .fn-choice input { accent-color: ${FN.amber}; width: 16px; height: 16px; }
.funnel-world .fn-details > summary::-webkit-details-marker { display: none; }

/* Payment step */
.funnel-world .fn-copy {
  display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: 999px;
  font-size: 12.5px; font-weight: 600; color: ${FN.amber}; border: 1px solid rgba(245,166,35,0.35); background: rgba(245,166,35,0.08);
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.funnel-world .fn-copy:hover { background: rgba(245,166,35,0.15); }
.funnel-world .fn-copy[data-copied] { color: ${FN.green}; border-color: rgba(60,196,124,0.45); background: rgba(60,196,124,0.1); }
.funnel-world .fn-copy:focus-visible, .funnel-world .fn-ghost-btn:focus-visible { outline: 2px solid ${FN.amber}; outline-offset: 2px; }
.funnel-world .fn-ghost-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 999px;
  font-size: 14px; font-weight: 600; color: #fff; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.04);
  transition: background .15s ease, border-color .15s ease;
}
.funnel-world .fn-ghost-btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.26); }
.funnel-world .fn-ghost-btn:disabled { cursor: progress; opacity: 0.7; }
.funnel-world .fn-qr-plate {
  padding: 14px; border-radius: 22px; background: #fff;
  box-shadow: 0 0 0 1px rgba(245,166,35,0.35), 0 0 0 7px rgba(245,166,35,0.07), 0 24px 60px rgba(0,0,0,0.45);
}
.funnel-world .fn-step-num {
  display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 999px;
  font-size: 12px; font-weight: 700; color: ${FN.amber}; border: 1px solid rgba(245,166,35,0.4); background: rgba(245,166,35,0.08);
}
.funnel-world .fn-progress {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; color: ${FN.muted};
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03);
}
.funnel-world .fn-progress--done { color: ${FN.green}; border-color: rgba(60,196,124,0.4); background: rgba(60,196,124,0.08); }
.funnel-world .fn-progress--current { color: ${FN.markerInk}; border-color: ${FN.amber}; background: ${FN.amber}; box-shadow: 0 0 18px rgba(245,166,35,0.35); }
.funnel-world .fn-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 190px; padding: 28px 20px;
  border-radius: 18px; cursor: pointer; text-align: center; border: 1.5px dashed rgba(245,166,35,0.4); background: rgba(10,8,6,0.55);
  transition: border-color .15s ease, background .15s ease;
}
.funnel-world .fn-drop:hover { border-color: rgba(245,166,35,0.7); background: rgba(245,166,35,0.05); }
.funnel-world .fn-drop:has(input:focus-visible) { box-shadow: 0 0 0 3px rgba(245,166,35,0.25); }
.funnel-world .fn-drop[data-busy] { cursor: progress; }
.funnel-world .fn-choice-logo { display: flex; min-width: 0; flex: 1; align-items: center; justify-content: space-between; gap: 10px; }

/* Motion */
@keyframes fn-pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.85); } }
@keyframes fn-shimmer { 0% { transform: rotate(18deg) translateX(-180%); opacity: 0; } 8% { opacity: 1; } 30%, 100% { transform: rotate(18deg) translateX(620%); opacity: 0; } }
@keyframes fn-cta-glow {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.22), 0 14px 32px rgba(215,38,29,0.42), 0 0 22px rgba(245,166,35,0.3); }
  50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.22), 0 18px 44px rgba(215,38,29,0.6), 0 0 36px rgba(245,166,35,0.45); }
}
@keyframes fn-marker-in { from { background-size: 0% 100%; } to { background-size: 100% 100%; } }
@media (prefers-reduced-motion: no-preference) {
  html:has(.funnel-world) { scroll-behavior: smooth; }
  .funnel-world .fn-dot { animation: fn-pulse-dot 1.8s ease-in-out infinite; }
  .funnel-world .fn-cta::after { animation: fn-shimmer 5.5s cubic-bezier(.4,0,.2,1) 1.2s infinite; }
  .funnel-world .fn-cta--pulse { animation: fn-cta-glow 2.2s ease-in-out infinite; }
  .funnel-world .fn-cta--pulse:hover { animation: none; }
  .funnel-world .fn-h1 .fn-marker {
    background-repeat: no-repeat; background-size: 100% 100%;
    animation: fn-marker-in .85s cubic-bezier(.22,.68,.25,1) .35s both;
  }
}
`
