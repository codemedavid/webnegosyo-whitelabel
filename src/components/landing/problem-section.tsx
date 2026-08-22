import { Eyebrow, Photo } from './landing-ui'
import { LANDING_PHOTOS, PROBLEMS, SMARTMENU } from './landing-theme'

/**
 * The reader recognises themselves before being sold to. Same formula as the
 * hero: photograph as the background, stronger noise, midsize text.
 */
export function ProblemSection() {
  return (
    <section
      id="problem"
      className="noise relative overflow-hidden px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.ink }}
    >
      <div className="absolute inset-0">
        <Photo photo={LANDING_PHOTOS.interior} decorative sizes="100vw" className="opacity-25" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${SMARTMENU.ink}F2, ${SMARTMENU.ink}CC)` }}
        />
      </div>

      <div className="rise relative mx-auto max-w-6xl">
        <Eyebrow onDark>Ang totoo sa operasyon mo</Eyebrow>
        <h2 className="font-display t-display max-w-[22ch] leading-tight text-white">
          Tatlong butas na{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.amber }}>
            tinatagasan
          </span>{' '}
          ng kita mo.
        </h2>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PROBLEMS.map((problem, i) => (
            <article
              key={problem.label}
              className="rounded-2xl p-6"
              style={{
                backgroundColor: 'rgba(255, 247, 238, 0.05)',
                border: '1px solid rgba(255, 247, 238, 0.12)',
              }}
            >
              <p
                className="font-display text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: SMARTMENU.amber }}
              >
                Butas {i + 1} — {problem.label}
              </p>
              <h3 className="font-display mt-3 text-lg font-bold leading-snug text-white">
                {problem.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: SMARTMENU.parchment }}>
                {problem.body}
              </p>
            </article>
          ))}
        </div>

        <p className="font-serif mt-10 max-w-[46ch] text-xl italic leading-relaxed text-white md:text-2xl">
          Ang Smart Menu ang sumasagot sa tatlo — isang link na ikaw ang may-ari, na kusang
          nag-aalok, at walang kumukuha ng komisyon.
        </p>
      </div>
    </section>
  )
}
