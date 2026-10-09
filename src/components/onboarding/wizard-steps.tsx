'use client'

import { useState } from 'react'
import { ChevronDown, Coffee, CupSoda, Croissant, ShieldCheck, Sparkles, Store, UtensilsCrossed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { STORE_LOOKS, STORE_LOOK_IDS, STORE_TYPES, type StoreLook, type StoreType } from '@/lib/onboarding/store-type'
import { MAX_MENU_PHOTOS } from '@/lib/onboarding/answers'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import { ACCENT, ACCENT_SOFT, Field, FOCUS_RING, GroupLabel, INPUT_CLASS, OB, OptionTile, PhotoSlot, StepHeading } from './onboarding-ui'
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

/** Each step's small picture: what the owner will hand over or get back. */
function WelcomeVisual({ index, initials }: { index: number; initials: string }) {
  if (index === 0) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-xl text-[15px] font-extrabold text-white" style={{ backgroundColor: ACCENT }} aria-hidden>
        {initials}
      </span>
    )
  }
  if (index === 1) {
    return (
      <span className="flex h-12 w-10 -rotate-6 flex-col gap-1 rounded-md border bg-white p-1.5 shadow-[0_4px_10px_-4px_rgba(0,0,0,0.25)]" style={{ borderColor: OB.line }} aria-hidden>
        {[70, 50, 80, 60].map((width) => <span key={width} className="h-[3px] rounded-full bg-[#D3CCC4]" style={{ width: `${width}%` }} />)}
      </span>
    )
  }
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200" aria-hidden>
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Open
    </span>
  )
}

const WELCOME_STEPS = [
  { title: 'Tell us about your store', body: 'Its name, what you sell, your logo and color.' },
  { title: 'Snap your menu', body: 'One photo is enough. We type every dish and price.' },
  { title: 'Open for orders', body: 'Your store goes live with combos, upsells and a stamp card already on.' },
] as const

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || 'S'
}

export function WelcomeStep({ firstName, businessName, isPaid }: { firstName: string; businessName: string; isPaid: boolean }) {
  const greeting = firstName ? `Mabuhay, ${firstName}!` : 'Mabuhay!'
  const lede = `${isPaid ? 'Payment received. Salamat! ' : ''}Answer a few questions and we build the rest. About five minutes.`
  return (
    <div>
      <h1 tabIndex={-1} className="text-balance text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[3.5rem]" style={{ color: OB.ink }}>
        {greeting} Let&apos;s open {businessName || 'your store'}.
      </h1>
      <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed" style={{ color: OB.muted }}>{lede}</p>

      <ol className="mt-10 border-t" style={{ borderColor: OB.line }}>
        {WELCOME_STEPS.map(({ title, body }, index) => (
          <li key={title} className="flex items-center gap-5 border-b py-5" style={{ borderColor: OB.line }}>
            <span className="w-5 shrink-0 self-start text-[20px] font-bold leading-7 tabular-nums" style={{ color: OB.ink }}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold leading-7" style={{ color: OB.ink }}>{title}</span>
              <span className="mt-0.5 block text-[15px] leading-relaxed" style={{ color: OB.muted }}>{body}</span>
            </span>
            <span className="flex w-14 shrink-0 justify-end"><WelcomeVisual index={index} initials={initialsOf(businessName)} /></span>
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
        <div role="radiogroup" aria-label="What do you sell?" className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
          {(Object.keys(STORE_TYPES) as StoreType[]).map((type) => {
            const Icon = STORE_TYPE_ICONS[type]
            return (
              <OptionTile
                key={type}
                icon={<Icon className="h-7 w-7" strokeWidth={1.75} />}
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
}

/** A tiny drawing of each look, in the owner's color. */
function LookSketch({ look }: { look: StoreLook }) {
  const bar = (width: string) => <span className="h-1 rounded-full bg-[#D3CCC4]" style={{ width }} />
  const card = (key: number, isCentered = false) => (
    <span key={key} className={`flex flex-col justify-end gap-1 rounded border border-[#D3CCC4] p-1 ${isCentered ? 'items-center' : ''}`}>
      {bar('80%')}<span className="h-1 w-3 rounded-full" style={{ backgroundColor: ACCENT }} />
    </span>
  )
  const tiles = (
    <span className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((key) => <span key={key} className="h-4 rounded" style={{ backgroundColor: ACCENT, opacity: 1 - key * 0.2 }} />)}</span>
  )
  if (look === 'sidebar') {
    return (
      <span className="flex h-full gap-1.5">
        <span className="flex w-3 flex-col gap-1">{[0, 1, 2].map((key) => <span key={key} className="h-2 rounded-sm" style={{ backgroundColor: key === 0 ? ACCENT : '#E9E4DE' }} />)}</span>
        <span className="grid flex-1 grid-cols-2 gap-1">{[0, 1].map((key) => card(key))}</span>
      </span>
    )
  }
  if (look === 'kiosk' || look === 'sticker') {
    return (
      <span className="flex h-full flex-col gap-1.5">
        {tiles}
        <span className="grid flex-1 grid-cols-2 gap-1">
          {[0, 1].map((key) => look === 'kiosk'
            ? <span key={key} className="rounded bg-[#2A2622]" />
            : <span key={key} className="relative rounded border border-[#D3CCC4]"><span className="absolute -bottom-0.5 left-1 h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} /></span>)}
        </span>
      </span>
    )
  }
  if (look === 'cafe') {
    return (
      <span className="flex h-full flex-col justify-center gap-1.5">
        {[0, 1].map((key) => <span key={key} className="flex gap-1">{[0, 1, 2].map((cell) => <span key={cell} className="h-4 w-1/3 shrink-0 rounded-t-full border border-[#D3CCC4]" />)}</span>)}
      </span>
    )
  }
  if (look === 'bistro') {
    return (
      <span className="flex h-full flex-col justify-center gap-1.5">
        {[0, 1].map((key) => (
          <span key={key} className="flex items-center gap-1 rounded border border-[#D3CCC4] px-1 py-1">
            {bar('45%')}<span className="flex-1" /><span className="h-1 w-3 rounded-full" style={{ backgroundColor: ACCENT }} />
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className="flex h-full flex-col gap-1.5">
      <span className="flex gap-1">{[0, 1, 2].map((key) => <span key={key} className="h-1.5 w-5 rounded-full" style={{ backgroundColor: key === 0 ? ACCENT : '#E9E4DE' }} />)}</span>
      <span className="grid flex-1 grid-cols-2 gap-1">{[0, 1].map((key) => card(key))}</span>
    </span>
  )
}

const AI_LOOK_LABEL = 'Let us design it'
const AI_LOOK_DESCRIPTION = 'Our AI reads your menu and picks the layout that fits it best.'

interface LookOptionProps {
  isSelected: boolean
  label: string
  description: string
  sketch: React.ReactNode
  badge?: string
  onSelect: () => void
  className?: string
}

function LookOption({ isSelected, label, description, sketch, badge, onSelect, className = '' }: LookOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={`flex flex-col gap-3 rounded-xl border p-3 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#17130F] ${FOCUS_RING} ${className}`}
      style={{ borderColor: isSelected ? ACCENT : OB.lineStrong, boxShadow: isSelected ? `0 0 0 1px ${ACCENT}` : 'none', backgroundColor: isSelected ? ACCENT_SOFT : OB.canvas }}
    >
      {sketch}
      <span>
        <span className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: OB.ink }}>
          {label}
          {badge && <span className="text-[12px] font-medium" style={{ color: OB.muted }}>{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: OB.muted }}>{description}</span>
      </span>
    </button>
  )
}

/** '' = the AI picks once it has read the menu; a look = the owner's own pick, which the build keeps. */
function LookPicker({ value, onChange }: { value: StoreLook | ''; onChange: (look: StoreLook | '') => void }) {
  return (
    <div role="radiogroup" aria-label="Menu layout" className="grid grid-cols-2 gap-3">
      <LookOption
        className="col-span-2 sm:flex-row sm:items-center"
        isSelected={value === ''}
        label={AI_LOOK_LABEL}
        description={AI_LOOK_DESCRIPTION}
        badge="Recommended"
        onSelect={() => onChange('')}
        sketch={(
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: ACCENT }} aria-hidden>
            <Sparkles className="h-5 w-5" />
          </span>
        )}
      />
      {STORE_LOOK_IDS.map((look) => (
        <LookOption
          key={look}
          isSelected={value === look}
          label={STORE_LOOKS[look].label}
          description={STORE_LOOKS[look].description}
          onSelect={() => onChange(look)}
          sketch={<span className="block h-14 rounded-lg bg-white p-2 ring-1 ring-black/[0.04]" aria-hidden><LookSketch look={look} /></span>}
        />
      ))}
    </div>
  )
}

export function BrandStep({ draft, update, assets, uploadPhoto, removePhoto, brand }: BrandStepProps) {
  return (
    <div className="space-y-9">
      <StepHeading title="Make it look like you" lede="Your logo, color and menu layout go on every page of your store." />
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
        <ColorPicker value={brand} logoColor={assets.logoColor} storeType={draft.storeType} onChange={(color) => update({ brandColor: color })} />
      </div>
      <div className="space-y-4">
        <GroupLabel hint="How your menu is laid out. You can switch anytime in Branding.">Menu layout</GroupLabel>
        <LookPicker value={draft.look} onChange={(look) => update({ look })} />
      </div>
    </div>
  )
}

const MIN_MENU_ROWS = 5
const MAX_MENU_ROWS = 16
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
          ) : null,
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setIsTyping(!isTyping)}
          aria-expanded={isTyping}
          className={`-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-[15px] font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`}
          style={{ color: OB.ink }}
        >
          No photo? Type your menu instead
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isTyping ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {isTyping && (
          <div className="mt-3">
            <textarea
              className={`${INPUT_CLASS} leading-relaxed`}
              rows={Math.min(Math.max(draft.menuText.split('\n').length + 1, MIN_MENU_ROWS), MAX_MENU_ROWS)}
              value={draft.menuText}
              aria-label="Your menu, one dish per line"
              placeholder={'Chicken Adobo – 150\nPork Sinigang – 180'}
              onChange={(event) => update({ menuText: event.target.value })}
            />
            <p className="mt-2 text-[13px]" style={{ color: OB.muted }}>One dish per line with its price. It shows in the preview as you type.</p>
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
