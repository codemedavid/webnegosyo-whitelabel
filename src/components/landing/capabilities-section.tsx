import { CourtButton, SectionTitle, StencilMark, TarpPanel } from './court'
import { CAPABILITIES, PRICE_LABEL, TARP } from './landing-theme'

/**
 * The sponsor wall. Eight printed tarpaulins hung on the court fence at the
 * sizes a real wall has — never eight identical cards. This is the page's
 * bright register, and it is where the offer is spelled out in full.
 */
export function CapabilitiesSection() {
  return (
    <section
      id="what-you-get"
      className="relative z-10 scroll-mt-16 px-5 py-24 md:px-8 md:py-32"
      style={{ backgroundColor: TARP.vinyl }}
    >
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          tone="vinyl"
          body="Hindi lang ito website builder. Ito ang buong sistema ng pag-order ng food business mo — mula sa unang tingin ng customer hanggang sa order na dumating sa kusina mo."
        >
          Lahat ng ito, isang bayad lang.
        </SectionTitle>

        <ul className="landing-tarp-wall mt-14 grid gap-3.5 sm:grid-cols-2 md:mt-16 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <li key={capability.title} data-span={capability.span}>
              <TarpPanel ink={capability.ink} className="flex h-full flex-col">
                <StencilMark icon={capability.icon} size={30} className="opacity-90" />
                <h3
                  className="mt-5 font-display t-tarp uppercase leading-[1.05] tracking-[-0.015em]"
                  style={{
                    textShadow:
                      capability.ink === 'vinyl' || capability.ink === 'yellow'
                        ? '2px 2px 0 rgba(0,0,0,0.14)'
                        : '2px 2px 0 rgba(0,0,0,0.28)',
                  }}
                >
                  {capability.title}
                </h3>
                <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed">
                  {capability.body}
                </p>
              </TarpPanel>
            </li>
          ))}
        </ul>

        <div className="mt-14 text-center">
          <CourtButton size="large">Kunin lahat — {PRICE_LABEL}</CourtButton>
          <p className="mt-4 text-[13px]" style={{ color: '#5A5A50' }}>
            Walang add-on, walang tier. Buo agad ang system pagka-live mo.
          </p>
        </div>
      </div>
    </section>
  )
}
