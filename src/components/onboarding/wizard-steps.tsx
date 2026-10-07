'use client'

import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'
import { MAX_MENU_PHOTOS, type OnboardingOrderType } from '@/lib/onboarding/answers'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
import { ChoiceChip, Field, INPUT_CLASS, ONBOARDING_COLORS, PhotoSlot } from './onboarding-ui'
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

const ORDER_TYPE_LABELS: Record<OnboardingOrderType, string> = {
  pickup: '🛍️ Pickup',
  delivery: '🛵 Delivery',
  dine_in: '🍽️ Dine-in',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function StoreStep({ draft, update, assets, uploadPhoto, removePhoto }: StepProps & PhotoProps) {
  return (
    <div className="space-y-5">
      <Field label="Store name">
        <input className={INPUT_CLASS} value={draft.storeName} maxLength={60} onChange={(e) => update({ storeName: e.target.value })} />
      </Field>
      <div>
        <p className="text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>What do you sell?</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(STORE_TYPES) as StoreType[]).map((type) => (
            <ChoiceChip key={type} isSelected={draft.storeType === type} onClick={() => update({ storeType: type })}>
              <span aria-hidden>{STORE_TYPES[type].emoji}</span> {STORE_TYPES[type].label}
            </ChoiceChip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[7rem_1fr] items-start gap-4">
        <PhotoSlot
          label="Add logo"
          imageUrl={assets.logoUrl}
          isContain
          onUpload={(file) => uploadPhoto('logo', file)}
          onRemove={() => removePhoto('logo')}
        />
        <p className="pt-2 text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>
          Your store colors are picked from your logo. No logo yet? Skip it — you can add one later.
        </p>
      </div>
      <Field label="Short tagline (optional)" hint="Shown under your store name, e.g. “Home-style Kapampangan cooking”">
        <input className={INPUT_CLASS} value={draft.tagline} maxLength={120} onChange={(e) => update({ tagline: e.target.value })} />
      </Field>
    </div>
  )
}

export function MenuStep({ draft, update, assets, uploadPhoto, removePhoto }: StepProps & PhotoProps) {
  const slots = Array.from({ length: MAX_MENU_PHOTOS }, (_, index) => assets.menuImageUrls[index] ?? null)
  const firstEmpty = slots.findIndex((url) => url === null)
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>Photos of your menu</p>
        <p className="text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>
          Up to {MAX_MENU_PHOTOS}. Flat, bright, every price readable — we turn them into your online menu.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {slots.map((url, index) =>
            url || index === firstEmpty ? (
              <PhotoSlot
                key={url ?? `empty-${index}`}
                label="Add photo"
                imageUrl={url}
                onUpload={(file) => uploadPhoto('menu', file)}
                onRemove={() => removePhoto('menu', index)}
              />
            ) : (
              <div key={`placeholder-${index}`} className="aspect-square rounded-2xl" style={{ backgroundColor: ONBOARDING_COLORS.cream }} />
            ),
          )}
        </div>
      </div>
      <Field label="…or type your menu (optional)" hint="One item per line with its price, e.g. “Chicken Adobo – 150”">
        <textarea className={`${INPUT_CLASS} min-h-28`} value={draft.menuText} onChange={(e) => update({ menuText: e.target.value })} />
      </Field>
      <Field label="Your 3 best sellers" hint="We feature them, build combos around them, and make one your loyalty reward.">
        <div className="space-y-2">
          {draft.bestSellers.map((name, index) => (
            <input
              key={index}
              className={INPUT_CLASS}
              value={name}
              maxLength={80}
              placeholder={`Best seller #${index + 1}`}
              onChange={(e) => {
                const next = [...draft.bestSellers] as WizardDraft['bestSellers']
                next[index] = e.target.value
                update({ bestSellers: next })
              }}
            />
          ))}
        </div>
      </Field>
    </div>
  )
}

function WalletFields({ name, number, accountName, onChange }: {
  name: string
  number: string
  accountName: string
  onChange: (patch: { number?: string; accountName?: string }) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input className={INPUT_CLASS} inputMode="tel" placeholder={`${name} number (optional)`} value={number} onChange={(e) => onChange({ number: e.target.value })} />
      <input className={INPUT_CLASS} placeholder={`${name} account name`} value={accountName} onChange={(e) => onChange({ accountName: e.target.value })} />
    </div>
  )
}

export function OrderingStep({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>How do customers get their order?</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(ORDER_TYPE_LABELS) as OnboardingOrderType[]).map((type) => (
            <ChoiceChip key={type} isSelected={draft.orderTypes.includes(type)} onClick={() => update({ orderTypes: toggle(draft.orderTypes, type) })}>
              {ORDER_TYPE_LABELS[type]}
            </ChoiceChip>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>How do they pay?</p>
        <WalletFields name="GCash" number={draft.gcashNumber} accountName={draft.gcashName}
          onChange={(p) => update({ ...(p.number !== undefined && { gcashNumber: p.number }), ...(p.accountName !== undefined && { gcashName: p.accountName }) })} />
        <WalletFields name="Maya" number={draft.mayaNumber} accountName={draft.mayaName}
          onChange={(p) => update({ ...(p.number !== undefined && { mayaNumber: p.number }), ...(p.accountName !== undefined && { mayaName: p.accountName }) })} />
        <ChoiceChip isSelected={draft.acceptsCash} onClick={() => update({ acceptsCash: !draft.acceptsCash })}>
          💵 Cash on pickup / delivery
        </ChoiceChip>
      </div>
    </div>
  )
}

export function HoursStep({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens">
          <input type="time" className={INPUT_CLASS} value={draft.open} onChange={(e) => update({ open: e.target.value })} />
        </Field>
        <Field label="Closes">
          <input type="time" className={INPUT_CLASS} value={draft.close} onChange={(e) => update({ close: e.target.value })} />
        </Field>
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>Closed on</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAY_LABELS.map((label, day) => (
            <ChoiceChip key={label} isSelected={draft.closedDays.includes(day)} onClick={() => update({ closedDays: toggle(draft.closedDays, day) })}>
              {label}
            </ChoiceChip>
          ))}
        </div>
      </div>
      <ChoiceChip isSelected={draft.stopOrdersWhenClosed} onClick={() => update({ stopOrdersWhenClosed: !draft.stopOrdersWhenClosed })}>
        ⏸️ Pause online orders while we&apos;re closed
      </ChoiceChip>
    </div>
  )
}
