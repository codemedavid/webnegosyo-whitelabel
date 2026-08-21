import { Eyebrow, Photo } from './landing-ui'
import { SMARTMENU, STEPS } from './landing-theme'

/**
 * Three steps to live, told with photographs that dominate the row — the
 * setup is done for the owner, so the images show the world, not the admin.
 */
export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.creamDeep }}
    >
      <div className="rise mx-auto max-w-6xl">
        <Eyebrow>Paano ito gumagana</Eyebrow>
        <h2 className="font-display t-display max-w-[24ch] leading-tight" style={{ color: SMARTMENU.ink }}>
          Menu mo lang ang kailangan.{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.red }}>
            Kami na ang iba.
          </span>
        </h2>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="group">
              <div className="photo-zoom relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md">
                <Photo photo={step.photo} sizes="(min-width: 768px) 30vw, 100vw" />
                <span
                  className="font-serif absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold text-white shadow-lg"
                  style={{ backgroundColor: SMARTMENU.red }}
                >
                  {step.n}
                </span>
              </div>
              <h3 className="font-display mt-5 text-xl font-bold leading-snug" style={{ color: SMARTMENU.ink }}>
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
