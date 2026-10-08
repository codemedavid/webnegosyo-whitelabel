'use client'

import { BookOpen, CheckCircle2, Clock, Gift, ImageIcon, Palette, ShieldCheck } from 'lucide-react'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'
import { MAX_MENU_PHOTOS } from '@/lib/onboarding/answers'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import { ACCENT, ACCENT_SOFT, ChoiceTile, DISPLAY_FONT, Field, INPUT_CLASS, ONBOARDING_COLORS, PhotoSlot, SectionLabel } from './onboarding-ui'
import { ColorPicker } from './color-picker'
import type { WizardDraft } from './wizard-draft'

export interface StepProps {
  draft: WizardDraft
  update: (patch: Partial<WizardDraft>) => void
}

export interface PhotoProps {
  assets: Required<OnboardingAssets>
  uploadPhoto: (kind: 'logo' | 'menu', file: File) => Promise<string | null>
  removePhoto: (kind: 'logo' | 'menu', index?: number) => Promise<string | null>
}

const STORE_TYPE_HINTS: Record<StoreType, string> = {
  restaurant: 'Rice meals, ulam, grill',
  cafe: 'Coffee, pastries, brunch',
  milk_tea: 'Milk tea, shakes, snacks',
  bakery: 'Breads, cakes, kakanin',
  other: 'Anything else you sell',
}

const BUILD_PROMISES = [
  { icon: Palette, title: 'Your design', body: 'Colors from your logo, applied to every page.' },
  { icon: BookOpen, title: 'Your menu, typed for you', body: 'Snap your menu — we turn it into an online menu.' },
  { icon: Gift, title: 'Your growth kit', body: 'Combos, upsells and a loyalty stamp card, ready on day one.' },
] as const

const BRING_LIST = ['Your logo (optional)', 'A clear photo of your menu', 'Your GCash or Maya number']

export function WelcomeStep({ firstName, businessName, isPaid }: { firstName: string; businessName: string; isPaid: boolean }) {
  return (
    <div className="space-y-7">
      {isPaid && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Payment confirmed — salamat!
        </p>
      )}
      <div>
        <h1 className="text-[2.1rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl" style={{ color: ONBOARDING_COLORS.ink, fontFamily: DISPLAY_FONT }}>
          {firstName ? `Mabuhay, ${firstName}!` : 'Mabuhay!'}<br />
          <span style={{ color: ACCENT }}>Let&apos;s build {businessName || 'your store'}.</span>
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: ONBOARDING_COLORS.cocoa }}>
          Answer a few questions and we do the rest. Your store will be ready to go live in minutes.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {BUILD_PROMISES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: ACCENT_SOFT }}>
              <Icon className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
            </span>
            <p className="mt-3 text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}>{title}</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: ONBOARDING_COLORS.cocoa }}>{body}</p>
          </li>
        ))}
      </ul>

      <div className="rounded-3xl border border-dashed border-black/15 p-4">
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}>
          <Clock className="h-4 w-4" aria-hidden /> About 5 minutes. Have these ready:
        </p>
        <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-3" style={{ color: ONBOARDING_COLORS.cocoa }}>
          {BRING_LIST.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      </div>
    </div>
  )
}

export function StoreStep({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <Field label="Store name" hint="Exactly how customers know you.">
        <input className={INPUT_CLASS} value={draft.storeName} maxLength={60} autoComplete="organization" onChange={(e) => update({ storeName: e.target.value })} />
      </Field>
      <div>
        <SectionLabel>What do you sell?</SectionLabel>
        <p className="mt-0.5 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>We pick a design that suits it — you can change everything later.</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {(Object.keys(STORE_TYPES) as StoreType[]).map((type) => (
            <ChoiceTile
              key={type}
              icon={STORE_TYPES[type].emoji}
              title={STORE_TYPES[type].label}
              description={STORE_TYPE_HINTS[type]}
              isSelected={draft.storeType === type}
              onClick={() => update({ storeType: type })}
            />
          ))}
        </div>
      </div>
      <Field label="Tagline (optional)" hint="One line under your name, e.g. “Home-style Kapampangan cooking”.">
        <input className={INPUT_CLASS} value={draft.tagline} maxLength={120} onChange={(e) => update({ tagline: e.target.value })} />
      </Field>
    </div>
  )
}

interface BrandStepProps extends StepProps, PhotoProps {
  brand: string
  typeColor: string | null
}

export function BrandStep({ update, assets, uploadPhoto, removePhoto, brand, typeColor }: BrandStepProps) {
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-[8.5rem_1fr] items-start gap-4 sm:grid-cols-[11rem_1fr]">
        <PhotoSlot
          label="Upload your logo"
          imageUrl={assets.logoUrl}
          isContain
          onUpload={async (file) => {
            const error = await uploadPhoto('logo', file)
            // A new logo brings its own color: let it take over from an earlier pick.
            if (!error) update({ brandColor: '' })
            return error
          }}
          onRemove={() => removePhoto('logo')}
        />
        <div className="space-y-2 pt-1 text-sm leading-relaxed" style={{ color: ONBOARDING_COLORS.cocoa }}>
          <p className="flex items-center gap-2 font-bold" style={{ color: ONBOARDING_COLORS.ink }}>
            <ImageIcon className="h-4 w-4 shrink-0" aria-hidden /> A PNG with a clear background works best
          </p>
          <p className="text-xs sm:text-sm">We read your brand color straight from it and paint your whole store with it — watch the preview.</p>
          <p className="text-xs">No logo yet? Skip it. We use your initials and you can add one anytime.</p>
        </div>
      </div>

      <div>
        <SectionLabel>Your brand color</SectionLabel>
        <p className="mb-3 mt-0.5 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Buttons, prices and headers use it. Tap to try one on.</p>
        <ColorPicker value={brand} logoColor={assets.logoColor} typeColor={typeColor} onChange={(color) => update({ brandColor: color })} />
      </div>
    </div>
  )
}

export function MenuStep({ draft, update, assets, uploadPhoto, removePhoto }: StepProps & PhotoProps) {
  const slots = Array.from({ length: MAX_MENU_PHOTOS }, (_, index) => assets.menuImageUrls[index] ?? null)
  const firstEmpty = slots.findIndex((url) => url === null)
  return (
    <div className="space-y-7">
      <div>
        <SectionLabel>Photos of your menu</SectionLabel>
        <p className="mt-0.5 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>
          Up to {MAX_MENU_PHOTOS}. Flat, bright, every price readable — our AI types every dish and price for you.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {slots.map((url, index) =>
            url || index === firstEmpty ? (
              <PhotoSlot
                key={url ?? `empty-${index}`}
                label={index === 0 ? 'Add menu photo' : 'Add another'}
                imageUrl={url}
                onUpload={(file) => uploadPhoto('menu', file)}
                onRemove={() => removePhoto('menu', index)}
              />
            ) : (
              <div key={`placeholder-${index}`} className="aspect-square rounded-3xl" style={{ backgroundColor: ONBOARDING_COLORS.creamDeep, opacity: 0.5 }} />
            ),
          )}
        </div>
      </div>
      <Field label="…or type it (optional)" hint="One dish per line with its price, e.g. “Chicken Adobo – 150”. It shows up in the preview as you type.">
        <textarea className={`${INPUT_CLASS} min-h-32 leading-relaxed`} value={draft.menuText} onChange={(e) => update({ menuText: e.target.value })} />
      </Field>
      <Field label="Your 3 best sellers" hint="We feature them, build combos around them, and make one your loyalty reward.">
        <div className="space-y-2">
          {draft.bestSellers.map((name, index) => (
            <div key={index} className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base" aria-hidden>{['🥇', '🥈', '🥉'][index]}</span>
              <input
                className={`${INPUT_CLASS} pl-11`}
                value={name}
                maxLength={80}
                aria-label={`Best seller ${index + 1}`}
                placeholder={['e.g. Chicken Inasal', 'e.g. Sisig', 'e.g. Halo-halo'][index]}
                onChange={(e) => {
                  const next = [...draft.bestSellers] as WizardDraft['bestSellers']
                  next[index] = e.target.value
                  update({ bestSellers: next })
                }}
              />
            </div>
          ))}
        </div>
      </Field>
      <p className="flex items-start gap-2 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        You review every name and price before your store goes live.
      </p>
    </div>
  )
}
