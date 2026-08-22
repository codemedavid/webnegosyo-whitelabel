'use client'

import { CheckIcon, Photo } from './landing-ui'
import { FeatureMock } from './feature-mockups'
import { useAutoRotate } from './use-auto-rotate'
import { JOURNEY_FEATURES, SMARTMENU } from './landing-theme'

const ROTATE_MS = 7000

/**
 * The full-bleed feature tabs: one colored surface per upsell play, a
 * photograph that dominates it, and 10% of the text a spec sheet would have.
 * The tabs rotate on a timer so every play gets seen; a click takes over.
 */
export function FeatureJourney() {
  const { index, select } = useAutoRotate(JOURNEY_FEATURES.length, ROTATE_MS)
  const active = JOURNEY_FEATURES[index]

  return (
    <section
      id="upsells"
      className="scroll-mt-24 overflow-hidden py-20 transition-colors duration-700 md:py-28"
      style={{ backgroundColor: active.surface }}
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div role="tablist" aria-label="Mga upsell play" className="flex flex-wrap gap-2.5">
          {JOURNEY_FEATURES.map((feature, i) => {
            const isActive = i === index
            return (
              <button
                key={feature.mock}
                role="tab"
                id={`upsell-tab-${feature.mock}`}
                aria-selected={isActive}
                aria-controls={`upsell-panel-${feature.mock}`}
                onClick={() => select(i)}
                className="font-display rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300"
                style={
                  isActive
                    ? { backgroundColor: '#FFFFFF', color: SMARTMENU.ink }
                    : {
                        backgroundColor: 'rgba(255,255,255,0.16)',
                        color: '#FFFFFF',
                        border: '1px solid rgba(255,255,255,0.35)',
                      }
                }
              >
                {feature.when}
              </button>
            )
          })}
        </div>

        {JOURNEY_FEATURES.map((feature, i) => (
          <div
            key={feature.mock}
            role="tabpanel"
            id={`upsell-panel-${feature.mock}`}
            aria-labelledby={`upsell-tab-${feature.mock}`}
            hidden={i !== index}
            className="mt-10 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14"
          >
            <div>
              <h3 className="font-display t-display leading-tight text-white" style={{ textWrap: 'balance' }}>
                {feature.title}
              </h3>
              <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-white/85">{feature.body}</p>
              <ul className="mt-6 space-y-3">
                {feature.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm font-medium text-white">
                    <span className="mt-0.5">
                      <CheckIcon color="#FFFFFF" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <p className="font-serif mt-7 text-lg italic text-white">
                +₱{feature.adds} sa isang order — automatic.
              </p>
            </div>

            <div className="photo-zoom relative aspect-[4/3] overflow-hidden rounded-3xl shadow-2xl">
              <Photo photo={feature.photo} sizes="(min-width: 1024px) 55vw, 100vw" />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(200deg, transparent 40%, rgba(10,7,5,0.5))' }}
              />
              <div className="absolute bottom-5 left-5 right-5 flex justify-start sm:right-auto">
                <FeatureMock variant={feature.mock} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
