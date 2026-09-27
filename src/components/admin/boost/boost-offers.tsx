'use client'

import type { ReactNode } from 'react'
import { ArrowRight, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { BundleWithSlots } from '@/lib/bundles-service'
import type { PairingGroup } from '@/lib/boost/pairing-groups'
import type { BoostLastCall, BoostPerformance, BoostUpgrade } from '@/lib/boost/workspace'
import { comboDraftFromBundle, comboDraftPrice, comboDraftRegularPrice } from '@/lib/boost/combo-draft'
import { describeSavings } from '@/lib/boost/pricing'
import { DishPhoto, DishStack } from './dish'
import { BOOST_MOMENTS, listNames, peso, type BoostMoment, type ItemLookup, type MomentMeta } from './boost-model'

export interface OfferSectionsProps {
  combos: readonly BundleWithSlots[]
  upgrades: readonly BoostUpgrade[]
  pairings: readonly PairingGroup[]
  lastCall: BoostLastCall
  itemsById: ItemLookup
  performance: BoostPerformance | null
  /** Optimistic live state by offer key while a toggle is in flight. */
  liveOverrides: Readonly<Record<string, boolean>>
  onToggle: (key: string, isLive: boolean) => void
  onEditCombo: (id: string) => void
  onEditUpgrade: (id: string) => void
  onEditPairing: (key: string) => void
  onEditLastCall: () => void
  onCreate: (moment: BoostMoment) => void
}

export const offerKey = {
  combo: (id: string) => `combo:${id}`,
  upgrade: (id: string) => `upgrade:${id}`,
  pairing: (key: string) => `pairing:${key}`,
  lastCall: 'last_call',
}

/** Offers grouped by where the diner meets them, in journey order. */
export function OfferSections(props: OfferSectionsProps) {
  const { combos, upgrades, pairings, lastCall, itemsById, performance, liveOverrides, onToggle } = props
  const live = (key: string, stored: boolean) => liveOverrides[key] ?? stored

  const content: Record<BoostMoment, ReactNode[]> = {
    menu: combos.map((combo) => {
      const key = offerKey.combo(combo.id)
      const draft = comboDraftFromBundle(combo, [...itemsById.values()])
      const regular = comboDraftRegularPrice(draft, itemsById)
      const price = comboDraftPrice(draft, itemsById)
      const savings = price !== null ? describeSavings(regular, price) : null
      const orders = performance?.comboOrders[combo.id] ?? 0
      const heroItems = draft.picks.map((pick) => itemsById.get(pick.itemIds[0]))
      const parts = draft.picks.map((pick) =>
        pick.itemIds.length > 1 ? `choice of ${pick.label.toLowerCase()}` : itemsById.get(pick.itemIds[0])?.name ?? pick.label
      )
      return (
        <OfferRow
          key={key}
          media={combo.image_url ? <ComboPhoto url={combo.image_url} /> : <DishStack items={heroItems} size="md" />}
          title={combo.name}
          detail={parts.join(' + ')}
          meta={[
            price !== null ? peso(price) : null,
            savings ? `saves ${peso(savings.amount)}` : null,
            !combo.show_on_menu ? 'item pages only' : null,
          ]}
          stat={performance && live(key, combo.is_active)
            ? orders > 0
              ? { text: `In ${orders} order${orders === 1 ? '' : 's'} in the last ${performance.days} days`, isGood: true }
              : { text: `Not ordered in the last ${performance.days} days`, isGood: false }
            : undefined}
          isLive={live(key, combo.is_active)}
          onToggle={(value) => onToggle(key, value)}
          onOpen={() => props.onEditCombo(combo.id)}
        />
      )
    }),
    item: upgrades.map((upgrade) => {
      const key = offerKey.upgrade(upgrade.id)
      const source = itemsById.get(upgrade.sourceId)
      const target = itemsById.get(upgrade.targetId)
      const difference = source && target ? target.price - source.price : null
      return (
        <OfferRow
          key={key}
          media={
            <span className="flex items-center gap-1">
              <DishPhoto item={source} size="sm" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <DishPhoto item={target} size="sm" />
            </span>
          }
          title={`${source?.name ?? 'Removed item'} → ${target?.name ?? 'Removed item'}`}
          detail={`“${upgrade.header || 'Make it a meal?'}”`}
          meta={[difference !== null && difference > 0 ? `+${peso(difference)} per upgrade` : null]}
          isLive={live(key, upgrade.isActive)}
          onToggle={(value) => onToggle(key, value)}
          onOpen={() => props.onEditUpgrade(upgrade.id)}
        />
      )
    }),
    added: pairings.map((group) => {
      const key = offerKey.pairing(group.key)
      return (
        <OfferRow
          key={key}
          media={<DishStack items={group.targetIds.map((id) => itemsById.get(id))} size="md" />}
          title={`After ${listNames(group.sourceIds, itemsById, 2)}`}
          detail={`Suggest ${listNames(group.targetIds, itemsById)}`}
          meta={[`${group.sourceIds.length} item${group.sourceIds.length === 1 ? '' : 's'}`]}
          isLive={live(key, group.isActive)}
          onToggle={(value) => onToggle(key, value)}
          onOpen={() => props.onEditPairing(group.key)}
        />
      )
    }),
    cart: lastCall.enabled || lastCall.pickedItemIds.length > 0
      ? [
          <OfferRow
            key={offerKey.lastCall}
            media={<DishStack items={lastCall.pickedItemIds.map((id) => itemsById.get(id))} size="md" />}
            title={`“${lastCall.title}”`}
            detail={lastCall.pickedItemIds.length === 0
              ? 'Automatic — picked for each cart'
              : `Your picks: ${listNames(lastCall.pickedItemIds, itemsById)}`}
            meta={[`up to ${lastCall.maxItems} shown`]}
            isLive={live(offerKey.lastCall, lastCall.enabled)}
            onToggle={(value) => onToggle(offerKey.lastCall, value)}
            onOpen={props.onEditLastCall}
          />,
        ]
      : [],
  }

  return (
    <div className="space-y-10">
      {BOOST_MOMENTS.map((moment) => (
        <MomentSection
          key={moment.id}
          moment={moment}
          rows={content[moment.id]}
          onCreate={() => (moment.id === 'cart' ? props.onEditLastCall() : props.onCreate(moment.id))}
        />
      ))}
    </div>
  )
}

const EMPTY_COPY: Record<BoostMoment, string> = {
  menu: 'No combos yet. A combo is the simplest way to lift every order — one price, no thinking.',
  item: 'No upgrades yet. Offer the meal or bigger version right where customers choose.',
  added: 'No pairings yet. This is the moment customers say yes most easily.',
  cart: 'Off. Turn it on to show a few quick add-ons in the cart.',
}

function MomentSection({ moment, rows, onCreate }: { moment: MomentMeta; rows: ReactNode[]; onCreate: () => void }) {
  const Icon = moment.icon
  return (
    <section id={`boost-${moment.id}`} aria-labelledby={`boost-${moment.id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`boost-${moment.id}-title`} className="text-base font-semibold leading-tight">
              {moment.offer}
              <span className="font-normal text-muted-foreground"> · {moment.place}</span>
            </h2>
            <p className="truncate text-xs text-muted-foreground">{moment.blurb}</p>
          </div>
        </div>
        {rows.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onCreate} className="shrink-0">
            {moment.id === 'cart' ? 'Edit' : <><Plus className="mr-1 h-4 w-4" />Add</>}
          </Button>
        )}
      </div>
      {rows.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{rows}</ul>
      ) : (
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center gap-4 rounded-2xl border border-dashed px-5 py-5 text-left transition-colors hover:border-foreground/40"
        >
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{EMPTY_COPY[moment.id]}</p>
          <span className="shrink-0 text-sm font-medium">{moment.addLabel}</span>
        </button>
      )}
    </section>
  )
}

function ComboPhoto({ url }: { url: string }) {
  return (
    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
    </span>
  )
}

interface OfferRowProps {
  media: ReactNode
  title: string
  detail: string
  meta: (string | null | undefined)[]
  stat?: { text: string; isGood: boolean }
  isLive: boolean
  onToggle: (isLive: boolean) => void
  onOpen: () => void
}

function OfferRow({ media, title, detail, meta, stat, isLive, onToggle, onOpen }: OfferRowProps) {
  const metaText = meta.filter(Boolean).join(' · ')
  return (
    <li className={cn('flex items-center gap-3 px-3 py-3 transition-opacity sm:px-4', !isLive && 'opacity-60')}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {media}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
          {(metaText || stat) && (
            <span className="mt-0.5 block truncate text-xs">
              {metaText && <span className="text-foreground/80">{metaText}</span>}
              {metaText && stat && <span className="text-muted-foreground"> · </span>}
              {stat && (
                <span className={stat.isGood ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                  {stat.text}
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
      </button>
      <Switch checked={isLive} onCheckedChange={onToggle} aria-label={`${title} is ${isLive ? 'live' : 'paused'}`} />
    </li>
  )
}
