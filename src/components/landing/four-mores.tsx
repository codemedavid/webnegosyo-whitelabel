import { FOUR_MORES, SMARTMENU } from './landing-theme'

/**
 * The promise band: the three leaks get answered by four "More"s before the
 * feature wall itemizes the tools. Bold brand-red surface, serif "More" —
 * the page's loudest typographic moment.
 */
export function FourMoresSection() {
  return (
    <section
      id="mores"
      className="noise relative overflow-hidden px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.red }}
    >
      <div className="rise relative mx-auto max-w-6xl">
        <p className="mb-4 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
          <span aria-hidden className="h-px w-8" style={{ backgroundColor: SMARTMENU.amber }} />
          Ang sagot ng SmartMenu
        </p>
        <h2 className="font-display t-display max-w-[22ch] leading-tight text-white">
          Apat na{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.amber }}>
            More
          </span>{' '}
          para sa negosyo mo.
        </h2>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FOUR_MORES.map((more) => (
            <article
              key={more.n}
              className="flex flex-col rounded-2xl p-6"
              style={{
                backgroundColor: 'rgba(255, 247, 238, 0.08)',
                border: '1px solid rgba(255, 247, 238, 0.22)',
              }}
            >
              <span className="font-serif text-4xl font-semibold" style={{ color: SMARTMENU.amber }}>
                {more.n}
              </span>
              <h3 className="font-display mt-4 text-lg font-bold leading-snug text-white">
                <span className="font-serif italic" style={{ color: SMARTMENU.amber }}>
                  More
                </span>{' '}
                {more.title.replace(/^More /, '')}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/85">{more.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
