'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCart } from '@/hooks/useCart'
import { looksLikeMessengerLinkToken, MESSENGER_LINK_QUERY_PARAM } from '@/lib/messenger/link-token-shape'

/** Set on the chat's Checkout button (`checkoutUrl` in src/lib/messenger/replies.ts). */
export const MESSENGER_CART_PARAM = 'mc'

/** A dish as the cart takes it. */
type MenuItem = Parameters<ReturnType<typeof useCart>['addItem']>[0]

interface ImportedLine {
  menuItem: MenuItem
  quantity: number
}

/**
 * Loads what the customer added in Messenger into the web cart, when they
 * arrive from the chat's Checkout button. An empty web cart is filled; one
 * that already holds dishes asks first. Rendered on the cart page.
 */
export function MessengerCartImport({ tenantId }: { tenantId: string }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { messengerPsid, isHydrated, items, bundleItems, addItem, clearCart, orderType, setOrderType } = useCart()
  const [pending, setPending] = useState<ImportedLine[] | null>(null)
  const hasStarted = useRef(false)
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  /** Add each dish; returns how many went in (a presell date clash refuses one). */
  const addLines = (lines: readonly ImportedLine[]): number =>
    lines.reduce((added, line) => added + (addItem(line.menuItem, undefined, [], line.quantity).ok ? 1 : 0), 0)

  const wantsImport = searchParams.get(MESSENGER_CART_PARAM) === '1'
  // The link's own token first: the root-level capture stores it a moment later.
  const fromUrl = searchParams.get(MESSENGER_LINK_QUERY_PARAM)
  const token = looksLikeMessengerLinkToken(fromUrl) ? fromUrl : messengerPsid

  useEffect(() => {
    if (!wantsImport || !isHydrated || hasStarted.current) return
    hasStarted.current = true

    const params = new URLSearchParams(searchParams.toString())
    params.delete(MESSENGER_CART_PARAM)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })

    if (!looksLikeMessengerLinkToken(token)) {
      toast.error('This Messenger link has expired. Tap “View cart” in the chat again.')
      return
    }

    const load = (lines: ImportedLine[]) => {
      const added = addLines(lines)
      if (added > 0) toast.success(`Added ${added} dish${added === 1 ? '' : 'es'} from Messenger`)
      if (added < lines.length) toast.error("Some dishes from Messenger couldn't be added. Please add them from the menu.")
    }

    fetch('/api/messenger/chat-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, token }),
    })
      .then(async (response) => {
        if (response.status === 403) throw new Error('expired')
        if (!response.ok) throw new Error('unavailable')
        return (await response.json()) as { items?: ImportedLine[] }
      })
      .then(({ items: lines = [] }) => {
        if (!isMounted.current) return
        if (lines.length === 0) {
          toast.info('Your Messenger cart is empty.')
          return
        }
        if (items.length === 0 && bundleItems.length === 0) { load(lines); return }
        // Tapped Checkout again after loading: every chat dish is already here, plain, in at least that quantity.
        const isAlreadyHere = lines.every((line) => items.some((item) =>
          item.menu_item.id === line.menuItem.id && item.selected_addons.length === 0 && !item.selected_variation && !item.selected_variations && item.quantity >= line.quantity))
        if (isAlreadyHere) return
        setPending(lines)
      })
      .catch((error: unknown) => {
        if (!isMounted.current) return
        toast.error(error instanceof Error && error.message === 'expired'
          ? 'This Messenger link has expired. Tap “View cart” in the chat again.'
          : "Couldn't load your Messenger cart. Please try again.")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per arrival (hasStarted); the cart read is the one at arrival
  }, [wantsImport, isHydrated, token, tenantId, searchParams, pathname, router])

  const replace = () => {
    if (!pending) return
    const lines = pending
    const chosenOrderType = orderType
    setPending(null)
    clearCart()
    // clearCart also forgets the order type; the customer already chose it.
    if (chosenOrderType) setOrderType(chosenOrderType)
    const added = addLines(lines)
    if (added === lines.length) toast.success('Your cart now has your Messenger order')
    else toast.error("Some dishes from Messenger couldn't be added. Please add them from the menu.")
  }

  const keepBoth = () => {
    if (!pending) return
    const lines = pending
    setPending(null)
    const added = addLines(lines)
    if (added === lines.length) toast.success('Added your Messenger dishes to your cart')
    else toast.error("Some dishes from Messenger couldn't be added. Please add them from the menu.")
  }

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Use your Messenger cart?</AlertDialogTitle>
          <AlertDialogDescription>
            Your cart here already has dishes. You added {pending?.length ?? 0} dish{pending?.length === 1 ? '' : 'es'} in Messenger.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={keepBoth}>Add to my cart</AlertDialogCancel>
          <AlertDialogAction onClick={replace}>Replace my cart</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
