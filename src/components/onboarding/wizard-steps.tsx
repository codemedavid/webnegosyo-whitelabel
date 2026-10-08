'use client'

import { useState } from 'react'
import { Check, ChevronDown, Coffee, CupSoda, Croissant, ShieldCheck, Store, UtensilsCrossed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'
import { MAX_MENU_PHOTOS } from '@/lib/onboarding/answers'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import { ACCENT, Field, FOCUS_RING, GroupLabel, INPUT_CLASS, OB, OptionTile, PhotoSlot, StepHeading } from './onboarding-ui'
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

const STORE_TYPE_ICONS: Record<StoreType, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  milk_tea: CupSoda,
  bakery: Croissant,
  other: Store,
}

const STORE_TYPE_HINTS: Record<StoreType, string> = {
  restaurant: 'Rice meals, ulam, grill',
  cafe: 'Coffee, pastries, brunch',
  milk_tea: 'Milk tea, shakes, snacks',
  bakery: 'Breads, cakes, kakanin',
  other: 'Anything else you sell',
}

const WELCOME_STEPS = [
  { title: 'Tell us about your store', body: 'Its name, what you sell, your logo and color.' },
  { title: 'Snap your menu', body: 'One photo is enough. We type every dish and price.' },
  { title: 'Open for orders', body: 'Your store goes live with combos, upsells and a stamp card already on.' },
] as const

export function WelcomeStep({ firstName, businessName, isPaid }: { firstName: string; businessName: string; isPaid: boolean }) {
  const greeting = firstName ? `Mabuhay, ${firstName}.` : 'Mabuhay.'
  return (
    <div>
      {isPaid && (
        <p className="mb-6 inline-flex items-center gap-2 text-sm font-medium" style={{ color: OB.muted }}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600" aria-hidden>
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
          Payment received. Salamat!
        </p>
      )}
      <h1 tabIndex={-1} className="text-balance text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[3.5rem]" style={{ color: OB.ink }}>
        {greeting}
        <br />
        Let&apos;s open {businessName || 'your store'}.
      </h1>
      <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed" style={{ color: OB.muted }}>
        Answer a few questions and we build the rest. About five minutes.
      </p>

      <ol className="mt-10 border-t" style={{ borderColor: OB.line }}>
        {WELCOME_STEPS.map(({ title, body }, index) => (
          <li key={title} className="flex gap-5 border-b py-5" style={{ borderColor: OB.line }}>
            <span className="w-6 shrink-0 text-[22px] font-bold leading-7 tabular-nums" style={{ color: OB.ink }}>{index + 1}</span>
            <span>
              <span className="block text-[17px] font-semibold leading-7" style={{ color: OB.ink }}>{title}</span>
              <span className="mt-0.5 block text-[15px] leading-relaxed" style={{ color: OB.muted }}>{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm" style={{ color: OB.muted }}>
        Have ready: a photo of your menu and your GCash or Maya number.
      </p>
    </div>
  )
}

export function StoreStep({ draft, update }: StepProps) {
  return (
    <div className="space-y-9">
      <StepHeading title="What's your store called?" lede="Exactly the name your customers know you by." />
      <input
        className={`${INPUT_CLASS} !py-4 text-lg font-semibold`}
        value={draft.storeName}
        maxLength={60}
        autoComplete="organization"
        aria-label="Store name"
        placeholder="e.g. Kusina ni Aling Nena"
        onChange={(event) => update({ storeName: event.target.value })}
      />
      <div className="space-y-3">
        <GroupLabel hint="It sets your starting design. You can change everything later.">What do you sell?</GroupLabel>
        <div role="radiogroup" aria-label="What do you sell?" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(STORE_TYPES) as StoreType[]).map((type) => {
            const Icon = STORE_TYPE_ICONS[type]
            return (
              <OptionTile
                key={type}
                icon={<Icon className="h-7 w-7" strokeWidth={1.5} />}
                title={STORE_TYPES[type].label}
                description={STORE_TYPE_HINTS[type]}
                isSelected={draft.storeType === type}
                onClick={() => update({ storeType: type })}
              />
            )
          })}
        </div>
      </div>
      <Field label="Tagline" hint="Optional. One line under your name, like “Home-style Kapampangan cooking”.">
        <input className={INPUT_CLASS} value={draft.tagline} maxLength={120} onChange={(event) => update({ tagline: event.target.value })} />
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
    <div className="space-y-9">
      <StepHeading title="Make it look like you" lede="Your logo and color go on every page of your store. Watch the phone change." />
      <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <PhotoSlot
          label="Add logo"
          hint="PNG or JPG"
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
        <div className="space-y-1.5">
          <p className="text-[15px] font-semibold" style={{ color: OB.ink }}>
            {assets.logoUrl ? 'We read your color from it' : 'Your logo'}
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: OB.muted }}>
            {assets.logoUrl
              ? 'Pick a different one below if it is not quite right.'
              : 'A logo on a plain background works best. No logo yet? Skip it. We use your initials.'}
          </p>
        </div>
      </div>
      <div className="space-y-4">
        <GroupLabel hint="Buttons, prices and headers use it.">Brand color</GroupLabel>
        <ColorPicker value={brand} logoColor={assets.logoColor} typeColor={typeColor} onChange={(color) => update({ brandColor: color })} />
      </div>
    </div>
  )
}

const RANK_PLACEHOLDERS = ['e.g. Chicken Inasal', 'e.g. Sisig', 'e.g. Halo-halo'] as const

export function MenuStep({ draft, update, assets, uploadPhoto, removePhoto }: StepProps & PhotoProps) {
  const [isTyping, setIsTyping] = useState(draft.menuText.trim().length > 0)
  const slots = Array.from({ length: MAX_MENU_PHOTOS }, (_, index) => assets.menuImageUrls[index] ?? null)
  const firstEmpty = slots.findIndex((url) => url === null)

  return (
    <div className="space-y-9">
      <StepHeading title="Show us your menu" lede="Snap your menu board or a printed menu. We type every dish and price for you." />

      <div className="grid grid-cols-3 gap-3">
        {slots.map((url, index) =>
          url || index === firstEmpty ? (
            <PhotoSlot
              key={url ?? `empty-${index}`}
              label={index === 0 ? 'Add photo' : 'Add page'}
              imageUrl={url}
              onUpload={(file) => uploadPhoto('menu', file)}
              onRemove={() => removePhoto('menu', index)}
            />
          ) : (
            <div key={`placeholder-${index}`} className="aspect-square rounded-xl border border-dashed" style={{ borderColor: OB.line }} aria-hidden />
          ),
        )}
      </div>

      <div className="rounded-xl border" style={{ borderColor: OB.line }}>
        <button
          type="button"
          onClick={() => setIsTyping(!isTyping)}
          aria-expanded={isTyping}
          className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-[15px] font-semibold ${FOCUS_RING}`}
          style={{ color: OB.ink }}
        >
          No photo? Type your menu instead
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isTyping ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {isTyping && (
          <div className="px-4 pb-4">
            <textarea
              className={`${INPUT_CLASS} min-h-36 leading-relaxed`}
              value={draft.menuText}
              aria-label="Your menu, one dish per line"
              placeholder={'Chicken Adobo – 150\nPork Sinigang – 180'}
              onChange={(event) => update({ menuText: event.target.value })}
            />
            <p className="mt-2 text-[13px]" style={{ color: OB.muted }}>One dish per line with its price. It appears in the preview as you type.</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <GroupLabel hint="We feature them, build combos around them, and make one your loyalty reward.">Your three best sellers</GroupLabel>
        {draft.bestSellers.map((name, index) => (
          <div key={index} className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold tabular-nums" style={{ color: ACCENT }} aria-hidden>
              {index + 1}
            </span>
            <input
              className={`${INPUT_CLASS} pl-10`}
              value={name}
              maxLength={80}
              aria-label={`Best seller ${index + 1}`}
              placeholder={RANK_PLACEHOLDERS[index]}
              onChange={(event) => {
                const next = [...draft.bestSellers] as WizardDraft['bestSellers']
                next[index] = event.target.value
                update({ bestSellers: next })
              }}
            />
          </div>
        ))}
      </div>

      <p className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: OB.muted }}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        You can fix any name or price from your dashboard afterwards.
      </p>
    </div>
  )
}
