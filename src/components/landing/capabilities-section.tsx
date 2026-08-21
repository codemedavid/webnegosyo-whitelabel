import { Eyebrow } from './landing-ui'
import { CAPABILITIES, SMARTMENU, type CapabilityIcon } from './landing-theme'

/** The brand icon set — two-tone strokes in the logo's red and amber. */
function BrandIcon({ icon }: { icon: CapabilityIcon }) {
  const paths: Record<CapabilityIcon, React.ReactNode> = {
    store: (
      <>
        <path d="M4 10v9h16v-9" />
        <path d="M3 6l1.5-3h15L21 6c0 1.7-1.3 3-3 3s-2.6-1.3-3-2c-.4.7-1.3 2-3 2s-2.6-1.3-3-2c-.4.7-1.3 2-3 2S3 7.7 3 6Z" stroke={SMARTMENU.amber} />
        <path d="M10 19v-5h4v5" />
      </>
    ),
    sparkles: (
      <>
        <path d="M12 4l1.8 4.6L18 10l-4.2 1.4L12 16l-1.8-4.6L6 10l4.2-1.4L12 4Z" />
        <path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" stroke={SMARTMENU.amber} />
      </>
    ),
    layers: (
      <>
        <path d="M12 3 3 8l9 5 9-5-9-5Z" />
        <path d="M3 12l9 5 9-5" stroke={SMARTMENU.amber} />
        <path d="M3 16l9 5 9-5" />
      </>
    ),
    truck: (
      <>
        <path d="M2 7h11v10H2z" />
        <path d="M13 11h5l3 3v3h-8" stroke={SMARTMENU.amber} />
        <circle cx="7" cy="17" r="1.8" />
        <circle cx="17" cy="17" r="1.8" />
      </>
    ),
    gauge: (
      <>
        <path d="M4 14a8 8 0 1 1 16 0" />
        <path d="M12 14l4-4" stroke={SMARTMENU.amber} />
        <path d="M2 18h20" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18c1.6 0 2-1 1.4-2-.8-1.4.2-3 1.6-3H17a4 4 0 0 0 4-4c0-5-4-9-9-9Z" />
        <circle cx="8" cy="10" r="1" stroke={SMARTMENU.amber} />
        <circle cx="12" cy="7.5" r="1" stroke={SMARTMENU.amber} />
        <circle cx="16" cy="10" r="1" stroke={SMARTMENU.amber} />
      </>
    ),
    wallet: (
      <>
        <path d="M3 7a2 2 0 0 1 2-2h13v3" />
        <rect x="3" y="8" width="18" height="11" rx="2" />
        <circle cx="16.5" cy="13.5" r="1.2" stroke={SMARTMENU.amber} />
      </>
    ),
    phone: (
      <>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" stroke={SMARTMENU.amber} />
        <path d="M10 7c1.5 1.2 2.5 1.2 4 0" stroke={SMARTMENU.amber} />
      </>
    ),
    pos: (
      <>
        <rect x="4" y="10" width="16" height="9" rx="1.5" />
        <path d="M7 10V5h10v5" />
        <path d="M9 7.5h6" stroke={SMARTMENU.amber} />
        <path d="M8 14h3" stroke={SMARTMENU.amber} />
      </>
    ),
    boxes: (
      <>
        <path d="M4 13h7v7H4zM13 13h7v7h-7z" />
        <path d="M8.5 4h7v7h-7z" stroke={SMARTMENU.amber} />
      </>
    ),
    message: (
      <>
        <path d="M4 5h16v11H9l-5 4V5Z" />
        <path d="M8 9h8M8 12h5" stroke={SMARTMENU.amber} />
      </>
    ),
    chart: (
      <>
        <path d="M4 4v16h16" />
        <path d="M8 15v-4M12 15V8M16 15v-7" stroke={SMARTMENU.amber} />
        <circle cx="19" cy="5.5" r="1.5" stroke={SMARTMENU.amber} />
      </>
    ),
  }

  return (
    <svg
      aria-hidden
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke={SMARTMENU.red}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[icon]}
    </svg>
  )
}

/** The "here is literally what you get" wall on clean cream and graph paper. */
export function CapabilitiesSection() {
  return (
    <section
      id="what-you-get"
      className="graph-paper scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.cream }}
    >
      <div className="rise mx-auto max-w-6xl">
        <Eyebrow>Ano ang kasama</Eyebrow>
        <h2 className="font-display t-display max-w-[24ch] leading-tight" style={{ color: SMARTMENU.ink }}>
          Isang bayad,{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.red }}>
            buong sistema
          </span>{' '}
          ng pagbebenta.
        </h2>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <article
              key={capability.title}
              className="rounded-2xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              style={{ border: `1px solid ${SMARTMENU.ink}12` }}
            >
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${SMARTMENU.red}0F` }}
              >
                <BrandIcon icon={capability.icon} />
              </span>
              <h3 className="font-display mt-4 text-base font-bold leading-snug" style={{ color: SMARTMENU.ink }}>
                {capability.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
                {capability.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
