import Image from 'next/image'
import { HERO } from './funnel-copy'
import { CtaLink, Kicker, Marker } from './funnel-ui'

type TitlePart = (typeof HERO.title)[number]

function TitleWord({ part }: { part: TitlePart }) {
  switch (part.tone) {
    case 'highlight':
      return <Marker>{part.text}</Marker>
    case 'red':
      return <span className="fn-accent">{part.text}</span>
    case 'amber':
      return <span className="fn-accent-warm">{part.text}</span>
    default:
      return <>{part.text}</>
  }
}

/** Real app screens; the marketing headline baked into each image's top is cropped away. */
const HERO_SCREENS = [
  { src: '/download/screens/04-bill-split.webp', alt: 'SmartMenu POS splitting a table bill' },
  { src: '/download/screens/01-hero.webp', alt: "SmartMenu merchant app: today's sales and live orders" },
  { src: '/download/screens/06-reports.webp', alt: 'SmartMenu sales and customer reports' },
] as const

function HeroScreens() {
  return (
    <a href="#demo" aria-label={HERO.demoLabel} className="mx-auto mt-14 grid max-w-[640px] grid-cols-3 items-end gap-3 sm:gap-5">
      {HERO_SCREENS.map((screen, index) => (
        <span
          key={screen.src}
          className={`fn-shot relative block aspect-[645/860] ${index === 1 ? 'z-10 -mb-4 scale-[1.08]' : 'opacity-80'}`}
        >
          <Image
            src={screen.src}
            alt={screen.alt}
            fill
            priority={index === 1}
            sizes="(min-width: 640px) 220px, 31vw"
            className="object-cover object-[50%_85%]"
          />
        </span>
      ))}
    </a>
  )
}

/**
 * Above the fold, after the reference: glowing kicker, a medium-weight
 * headline with highlighter and accent words, the lead and two figures, the
 * glass CTA with the red proof tag hanging off it, then real app screens.
 */
export function FunnelHero() {
  return (
    <section id="top" className="relative scroll-mt-20 px-5 pb-20 pt-12 sm:pt-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,166,35,0.10),transparent_70%)]" />
      <div className="relative mx-auto max-w-[1040px]">
        <Kicker>{HERO.eyebrow}</Kicker>
        <h1 className="fn-h1 mt-6">
          {HERO.title.map((part, index) => (
            <span key={part.text}>
              <TitleWord part={part} />
              {index < HERO.title.length - 1 && ' '}
            </span>
          ))}
        </h1>

        <p className="fn-lead mx-auto mt-6 max-w-[600px] text-center !text-[#D9CFC2]">{HERO.lead}</p>
        <ul className="mt-6 flex justify-center gap-8 text-center">
          {HERO.stats.map((stat) => (
            <li key={stat.label}>
              <span className="block text-[20px] font-semibold tracking-[-0.02em] text-white">{stat.value}</span>
              <span className="block text-[12.5px] text-[#A99C8D]">{stat.label}</span>
            </li>
          ))}
        </ul>

        <div id="hero-cta" className="mx-auto mt-9 max-w-[560px]">
          <CtaLink size="large" isPulsing>{HERO.cta}</CtaLink>
        </div>
        <div className="fn-proof-tag mt-5">
          <p className="text-[13px] font-light leading-snug text-white/95">{HERO.badgeLead}</p>
          <p className="fn-serif mt-1 text-[clamp(22px,3.8vw,30px)] font-medium leading-none tracking-[-0.02em] text-white">
            {HERO.badgeValue}
          </p>
        </div>

        <HeroScreens />
      </div>
    </section>
  )
}
