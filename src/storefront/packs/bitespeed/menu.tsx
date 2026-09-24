'use client'

import { Search, SearchX, ShoppingBag } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { AddButton, CardTitleButton, Price, SoldOutVeil, selectOnCardClick } from '@/components/customer/card-templates/flex/card-kit'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import type { MenuItem } from '@/types/database'
import { StorefrontBottomInset, useStorefrontRuntime } from '../../runtime/storefront-runtime'
import { BiteSpeedHeader } from './chrome'
import { BITESPEED_CARD_SHADOW, BiteSpeedRoot, itemPricing, useHideCurrencySymbol, useOrderAction } from './parts'

/** Height reserved on phones for the "View order" bar while it shows. */
const ORDER_BAR_PX = 96
const DISPLAY = { fontFamily: 'var(--bs-font-display)' } as const

function SearchField() {
  const { searchQuery, setSearchQuery } = useStorefrontRuntime().menu
  return (
    <label className="relative block">
      <span className="sr-only">Search menu items</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--bs-text-muted)]" aria-hidden />
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="What are you craving?"
        className="h-12 w-full rounded-full border border-transparent bg-[var(--bs-surface-low)] pl-12 pr-4 text-base outline-none transition-colors placeholder:text-[var(--bs-text-muted)] focus:border-[var(--bs-accent)]"
      />
    </label>
  )
}

function CategoryChips() {
  const { categoriesWithBundles, activeCategory, setActiveCategory } = useStorefrontRuntime().menu
  const chips = [{ id: null, name: 'All Menu' }, ...categoriesWithBundles.map(({ id, name }) => ({ id, name }))]
  return (
    <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
      {chips.map((chip) => {
        const isActive = activeCategory === chip.id
        return (
          <button
            key={chip.id ?? 'all'}
            type="button"
            aria-pressed={isActive}
            onClick={() => setActiveCategory(chip.id)}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors ${
              isActive ? 'bg-[var(--bs-accent)] text-[var(--bs-on-accent)]' : 'bg-[var(--bs-surface-high)] text-[var(--bs-text)] hover:bg-[var(--bs-accent-soft)]'
            }`}
          >
            {chip.name}
          </button>
        )
      })}
    </nav>
  )
}

function MenuRow({ item }: { item: MenuItem }) {
  const { selectItem } = useStorefrontRuntime().menu
  const hideCurrencySymbol = useHideCurrencySymbol()
  const isOrderable = isMenuItemOrderable(item)
  const { price, compareAt, hasOptions } = itemPricing(item)
  return (
    <li
      onClick={selectOnCardClick(item, selectItem)}
      className={`relative flex cursor-pointer gap-4 rounded-[var(--bs-radius)] bg-[var(--bs-surface)] p-4 ${isOrderable ? '' : 'opacity-70'}`}
      style={{ boxShadow: BITESPEED_CARD_SHADOW }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <CardTitleButton item={item} onSelect={selectItem} as="h3" className="text-lg font-semibold leading-6" style={DISPLAY} />
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-[var(--bs-text-muted)]">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <Price price={price} compareAt={compareAt} hasOptions={hasOptions} hideCurrencySymbol={hideCurrencySymbol}
            color="var(--bs-accent-ink)" mutedColor="var(--bs-text-muted)" className="text-lg font-bold" />
          {!item.image_url && (
            <AddButton item={item} variant="icon" isOrderable={isOrderable} onSelect={selectItem}
              background="var(--bs-accent)" color="var(--bs-on-accent)" className="h-11 w-11" />
          )}
        </div>
      </div>
      {item.image_url && (
        <div className="relative h-28 w-28 shrink-0 md:h-32 md:w-32">
          <div className="relative h-full w-full overflow-hidden rounded-[var(--bs-radius)] bg-[var(--bs-surface-high)]">
            <OptimizedImage src={item.image_url} alt={item.name} fill sizes="128px" className="object-cover" />
            {!isOrderable && <SoldOutVeil />}
          </div>
          <AddButton item={item} variant="icon" isOrderable={isOrderable} onSelect={selectItem}
            background="var(--bs-accent)" color="var(--bs-on-accent)" className="absolute bottom-2 right-2 h-11 w-11 shadow-md" />
        </div>
      )}
    </li>
  )
}

function EmptyMenu() {
  const { setSearchQuery, setActiveCategory } = useStorefrontRuntime().menu
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <SearchX className="mb-4 h-12 w-12 text-[var(--bs-text-muted)]" aria-hidden />
      <h2 className="text-xl font-semibold" style={DISPLAY}>No menu items found</h2>
      <p className="mt-1 text-[var(--bs-text-muted)]">Try another search or category.</p>
      <button
        type="button"
        onClick={() => { setSearchQuery(''); setActiveCategory(null) }}
        className="mt-6 h-11 rounded-full bg-[var(--bs-surface-high)] px-6 text-sm font-bold"
      >
        Show the whole menu
      </button>
    </div>
  )
}

function ViewOrderBar() {
  const { itemCount } = useStorefrontRuntime().menu
  const { isCheckoutPending } = useStorefrontRuntime()
  const { total } = useCart()
  const onOrder = useOrderAction()
  if (itemCount === 0) return null
  return (
    <>
      <StorefrontBottomInset mobilePx={ORDER_BAR_PX} />
      <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[var(--bs-bg)] via-[var(--bs-bg)]/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <button
          type="button"
          onClick={onOrder}
          disabled={isCheckoutPending}
          className="mx-auto flex h-14 w-full max-w-md items-center justify-between rounded-full bg-[var(--bs-accent)] px-6 font-bold text-[var(--bs-on-accent)] shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" aria-hidden />
            View Order (<span className="tabular-nums">{itemCount}</span>)
          </span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </button>
      </div>
    </>
  )
}

/** BiteSpeed menu: search, category chips and one quick list of dishes. */
export function BiteSpeedMenu() {
  const { tenant, filteredItems } = useStorefrontRuntime().menu
  return (
    <BiteSpeedRoot>
      <BiteSpeedHeader active="menu" />
      <div className="sticky top-16 z-30 border-b border-[var(--bs-outline)]/40 bg-[var(--bs-bg)]/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
          <SearchField />
          <CategoryChips />
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <h1 className="sr-only">{tenant?.name} menu</h1>
        {filteredItems.length === 0 ? (
          <EmptyMenu />
        ) : (
          <ul className="flex flex-col gap-4">
            {filteredItems.map((item) => <MenuRow key={item.id} item={item} />)}
          </ul>
        )}
      </main>
      <ViewOrderBar />
    </BiteSpeedRoot>
  )
}
