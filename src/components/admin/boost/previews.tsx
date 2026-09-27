'use client'

import type { ReactNode } from 'react'
import type { BoostItem } from '@/lib/boost/workspace'
import { describeSavings } from '@/lib/boost/pricing'
import { ItemOfferChoice } from '@/components/customer/offers/item-offer-choice'
import { AddedSheetContent } from '@/components/customer/offers/added-sheet-content'
import { CartOfferRow } from '@/components/customer/offers/cart-offer-row'
import type { OfferTheme } from '@/components/customer/offers/offer-theme'
import { peso } from './boost-model'

const NO_ADDS: ReadonlySet<string> = new Set()
const noop = () => {}

interface PhoneFrameProps {
  caption: string
  background: string
  children: ReactNode
}

/**
 * A phone-sized stage for the REAL diner components — the previews render the
 * same `ItemOfferChoice` / `AddedSheetContent` / `CartOfferRow` the storefront
 * does, so what the merchant approves is what the diner gets.
 */
export function PhoneFrame({ caption, background, children }: PhoneFrameProps) {
  return (
    <figure className="mx-auto w-full max-w-[320px]">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-foreground/90 shadow-xl shadow-black/10">
        <div className="min-h-[420px]" style={{ backgroundColor: background }}>
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

function Ghost({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-black/[0.06] ${className}`} />
}

interface ComboPreviewProps {
  name: string
  items: readonly BoostItem[]
  imageUrl: string
  price: number | null
  regularPrice: number
  theme: OfferTheme
}

export function ComboPreview({ name, items, imageUrl, price, regularPrice, theme }: ComboPreviewProps) {
  const savings = price !== null ? describeSavings(regularPrice, price) : null
  const fallbackPhoto = items.find((item) => item.imageUrl)?.imageUrl ?? ''
  const photo = imageUrl || fallbackPhoto
  return (
    <PhoneFrame caption="Its card at the top of your menu. Your card style applies." background={theme.surface}>
      <div className="space-y-3 p-4">
        <Ghost className="h-5 w-24" />
        <p className="pt-1 text-sm font-semibold" style={{ color: theme.text }}>Combos</p>
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: theme.border, backgroundColor: theme.card }}>
          <div className="relative aspect-[4/3] w-full" style={{ backgroundColor: theme.border }}>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-full w-full object-cover" />
            )}
            {savings && (
              <span
                className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ backgroundColor: theme.accent, color: theme.accentText }}
              >
                Save {peso(savings.amount)}
              </span>
            )}
          </div>
          <div className="p-3">
            <p className="font-semibold" style={{ color: theme.text }}>{name || 'Your combo'}</p>
            <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: theme.muted }}>
              {items.length > 0 ? items.map((item) => item.name).join(' + ') : 'Add items to see them here'}
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="font-bold" style={{ color: theme.text }}>{price !== null ? peso(price) : '₱—'}</span>
              {savings && (
                <span className="text-xs line-through" style={{ color: theme.muted }}>{peso(regularPrice)}</span>
              )}
            </p>
          </div>
        </div>
        <Ghost className="h-16 w-full" />
      </div>
    </PhoneFrame>
  )
}

interface UpgradePreviewProps {
  source: BoostItem | undefined
  target: BoostItem | undefined
  header: string
  sourceLabel: string
  targetLabel: string
  theme: OfferTheme
}

export function UpgradePreview({ source, target, header, sourceLabel, targetLabel, theme }: UpgradePreviewProps) {
  return (
    <PhoneFrame caption="On the item page, above the Add to cart button." background={theme.surface}>
      <div className="aspect-[4/3] w-full" style={{ backgroundColor: theme.border }}>
        {source?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={source.imageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="space-y-3 p-4">
        <p className="text-lg font-bold" style={{ color: theme.text }}>{source?.name ?? 'Choose an item'}</p>
        <Ghost className="h-3 w-4/5" />
        {source && target ? (
          <ItemOfferChoice
            header={header}
            current={{ id: source.id, label: sourceLabel || source.name, priceLabel: peso(source.price), imageUrl: source.imageUrl }}
            options={[{
              id: target.id,
              label: targetLabel || target.name,
              priceLabel: `+${peso(Math.max(0, target.price - source.price))}`,
              imageUrl: target.imageUrl,
            }]}
            theme={theme}
            onChoose={noop}
          />
        ) : (
          <Ghost className="h-36 w-full" />
        )}
      </div>
    </PhoneFrame>
  )
}

interface PairingPreviewProps {
  added: BoostItem | undefined
  suggestions: readonly BoostItem[]
  theme: OfferTheme
}

export function PairingPreview({ added, suggestions, theme }: PairingPreviewProps) {
  return (
    <PhoneFrame caption="Slides up right after they tap Add to cart." background="#00000055">
      <div className="flex min-h-[420px] flex-col justify-end">
        <div className="rounded-t-3xl" style={{ backgroundColor: theme.surface }}>
          <AddedSheetContent
            addedName={added?.name ?? 'The item they added'}
            suggestions={suggestions.map((item) => ({
              id: item.id,
              name: item.name,
              priceLabel: `+${peso(item.price)}`,
              imageUrl: item.imageUrl,
            }))}
            addedIds={NO_ADDS}
            theme={theme}
            primaryLabel="View cart"
            secondaryLabel="Keep browsing"
            onAdd={noop}
            onPrimary={noop}
            onSecondary={noop}
          />
        </div>
      </div>
    </PhoneFrame>
  )
}

interface LastCallPreviewProps {
  title: string
  subtitle: string
  items: readonly BoostItem[]
  theme: OfferTheme
  isAutomatic: boolean
}

export function LastCallPreview({ title, subtitle, items, theme, isAutomatic }: LastCallPreviewProps) {
  return (
    <PhoneFrame
      caption={isAutomatic ? 'In the cart. Picks change with what is in each cart.' : 'In the cart, between the items and the total.'}
      background={theme.surface}
    >
      <div className="space-y-3 p-4">
        <p className="text-lg font-bold" style={{ color: theme.text }}>Your cart</p>
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Ghost className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Ghost className="h-3 w-3/5" />
              <Ghost className="h-3 w-1/4" />
            </div>
          </div>
        ))}
        <CartOfferRow
          title={title || 'Add to your order'}
          subtitle={subtitle || undefined}
          items={items.map((item) => ({ id: item.id, name: item.name, priceLabel: peso(item.price), imageUrl: item.imageUrl }))}
          addedIds={NO_ADDS}
          theme={theme}
          onAdd={noop}
        />
        <Ghost className="h-11 w-full rounded-full" />
      </div>
    </PhoneFrame>
  )
}
