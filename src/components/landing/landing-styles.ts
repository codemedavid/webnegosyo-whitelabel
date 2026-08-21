/**
 * The landing surface's own stylesheet: brand voices, photographic textures
 * and the two motion motifs. Scoped under .landing-world so none of it leaks
 * into tenant storefronts.
 */
export const LANDING_STYLES = `
.landing-world {
  font-family: var(--font-landing-text), 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.landing-world .font-display {
  font-family: var(--font-landing-display), 'Segoe UI', system-ui, sans-serif;
}
.landing-world .font-serif {
  font-family: var(--font-landing-serif), Georgia, serif;
}

/* Type scale */
.landing-world .t-hero { font-size: clamp(2.5rem, 6.4vw, 4.6rem); }
.landing-world .t-display { font-size: clamp(1.9rem, 4vw, 3rem); }
.landing-world .t-lead { font-size: clamp(1.02rem, 1.6vw, 1.2rem); }

/* Film grain over darkened photography — texture and text contrast in one. */
.landing-world .noise::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
}

/* Darkened edges pull the eye to the center of a photo section. */
.landing-world .vignette::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 90% 72% at 50% 42%, transparent 52%, rgba(10, 7, 5, 0.72) 100%);
}

/* Graph-paper texture for the clean cream software sections. */
.landing-world .graph-paper {
  background-image:
    linear-gradient(rgba(28, 22, 19, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28, 22, 19, 0.045) 1px, transparent 1px);
  background-size: 28px 28px;
}

/* Capability ribbon */
@keyframes landing-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.landing-world .marquee-track {
  animation: landing-marquee 36s linear infinite;
  will-change: transform;
}

/* Motif B: photographs breathe on hover. */
.landing-world .photo-zoom img {
  transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
}
.landing-world .photo-zoom:hover img { transform: scale(1.05); }

/* Motif A: sections slide over the hero; the hero recedes like a set piece,
   and content rises as it enters. Progressive enhancement only. */
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    @keyframes landing-recede {
      to { transform: scale(0.94) translateY(-4%); filter: blur(6px); opacity: 0.35; }
    }
    .landing-world .hero-recede {
      animation: landing-recede linear both;
      animation-timeline: view();
      animation-range: exit 0% exit 90%;
    }
    @keyframes landing-rise {
      from { transform: translateY(46px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .landing-world .rise {
      animation: landing-rise 1ms linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 42%;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .landing-world .marquee-track { animation: none; }
  .landing-world .photo-zoom img { transition: none; }
}
`
