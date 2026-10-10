'use client'

import { useState } from 'react'
import { ChevronDown, Coffee, CupSoda, Croissant, ShieldCheck, Store, UtensilsCrossed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'
import { MAX_MENU_PHOTOS } from '@/lib/onboarding/answers'
import type { PublicOnboardingAssets } from '@/lib/onboarding/repository'
import { FOCUS_RING, GroupLabel, INPUT_CLASS, OB, OptionTile, PhotoSlot, QuestionHeading, handleRadioGroupKeyDown } from './onboarding-ui'
import { ColorPicker } from './color-picker'
import { MenuPhotoGrid } from './menu-photo-grid'
import type { WizardDraft } from './wizard-draft'

export interface StepProps {
  draft: WizardDraft
  update: (patch: Partial<WizardDraft>) => void
}

export interface PhotoProps {
  assets: PublicOnboardingAssets
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

export function StoreStep({ draft, update, eyebrow }: StepProps & { eyebrow: string }) {
  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="What's your store called?" lede="Exactly the name your customers know you by." />
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
        <GroupLabel hint="It sets your starting colors and design.">What do you sell?</GroupLabel>
        <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="What do you sell?" className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
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
    </div>
  )
}

interface BrandStepProps extends StepProps, PhotoProps {
  brand: string
  eyebrow: string
}

export function BrandStep({ draft, update, assets, uploadPhoto, removePhoto, brand, eyebrow }: BrandStepProps) {
  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="Make it look like you" lede="Your logo and color go on every page. Our AI picks a layout that fits your menu." />
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
              : 'A logo on a plain background works best. No logo yet? Skip this. We make one from your store name.'}
          </p>
        </div>
      </div>
      <div className="space-y-4">
        <GroupLabel hint="Buttons, prices and headers use it.">Brand color</GroupLabel>
        <ColorPicker value={brand} logoColor={assets.logoColor} storeType={draft.storeType} onChange={(color) => update({ brandColor: color })} />
      </div>
    </div>
  )
}

const MIN_MENU_ROWS = 5
const MAX_MENU_ROWS = 16

export function MenuStep({ draft, update, assets, uploadPhoto, removePhoto, eyebrow, onUploadingChange }: StepProps & PhotoProps & { eyebrow: string; onUploadingChange?: (isUploading: boolean) => void }) {
  const [isTyping, setIsTyping] = useState(draft.menuText.trim().length > 0)

  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="Show us your menu" lede="Snap your menu board or a printed menu — pick every page at once. We type every dish and price for you, starting now." />

      <MenuPhotoGrid
        urls={assets.menuImageUrls}
        max={MAX_MENU_PHOTOS}
        onUpload={(file) => uploadPhoto('menu', file)}
        onRemove={(index) => removePhoto('menu', index)}
        onUploadingChange={onUploadingChange}
      />

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

      <p className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: OB.muted }}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        You can fix any name or price from your dashboard afterwards.
      </p>
    </div>
  )
}
