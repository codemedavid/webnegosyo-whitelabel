import Image from 'next/image'
import { FEATURES } from './funnel-copy'
import { FEATURE_GROUPS, type FeatureGroup } from './funnel-offer'
import { CtaLink, Kicker, Marker } from './funnel-ui'

/**
 * One phase, after the reference's "ph3" blocks: an outlined number, a
 * medium-weight title, then a real app screen beside a hairline list of the
 * tools (no icon tiles, no card per tool).
 */
function Phase({ group, isFlipped }: { group: FeatureGroup; isFlipped: boolean }) {
  return (
    <li className="border-t pt-12 fn-rule first:border-t-0 first:pt-0">
      <p aria-hidden className="fn-num">{group.number}</p>
      <h3 className="fn-h3 mt-5 max-w-[760px]">{group.title}</h3>
      <div
        className={`mt-8 grid items-center gap-8 md:gap-12 ${
          isFlipped ? 'md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : 'md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'
        }`}
      >
        <div className={`fn-shot relative mx-auto aspect-[645/860] w-full max-w-[300px] ${isFlipped ? 'md:order-2' : ''}`}>
          <Image src={group.screen.src} alt={group.screen.alt} fill sizes="(min-width: 768px) 300px, 80vw" className="object-cover object-[50%_85%]" />
        </div>
        <ul className="divide-y divide-white/[0.08]">
          {group.features.map((feature) => {
            const Icon = feature.icon
            return (
              <li key={feature.name} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#F5A623]" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold tracking-[-0.01em] text-white">{feature.name}</p>
                  <p className="fn-body mt-1">{feature.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </li>
  )
}

export function FunnelFeatures() {
  return (
    <section id="features" className="scroll-mt-20 px-5 pt-8 pb-20">
      <div className="mx-auto max-w-[1000px]">
        <div className="text-center">
          <Kicker>{FEATURES.eyebrow}</Kicker>
          <h2 className="fn-h2">
            <Marker>{FEATURES.titleMarker}</Marker> {FEATURES.titleRest}
          </h2>
          <p className="fn-lead mx-auto mt-4 max-w-[620px]">{FEATURES.subtitle}</p>
        </div>
        <ol className="mt-16 space-y-16">
          {FEATURE_GROUPS.map((group, index) => (
            <Phase key={group.number} group={group} isFlipped={index % 2 === 1} />
          ))}
        </ol>
        <div className="mx-auto mt-16 max-w-[560px]">
          <CtaLink size="large">{FEATURES.cta}</CtaLink>
        </div>
      </div>
    </section>
  )
}
