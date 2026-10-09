'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { CustomWelcomePage } from '@/components/customer/custom-welcome-page'
import { useCart } from '@/hooks/useCart'
import { getEnabledOrderTypesByTenantClient } from '@/lib/order-types-client'
import { resolveOrderTypeIdForMode } from '@/lib/outlets/mode-order-type'
import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'
import { modesFromOrderTypes } from '@/lib/welcome-builder/modes'
import { resolveCustomWelcomeDesign } from '@/lib/welcome-builder/welcome-mode'
import type { OrderType, Tenant } from '@/types/database'

const SEEN_EVENT = 'wn-welcome-seen'
const seenKey = (tenantSlug: string) => `wn-welcome-seen:${tenantSlug}`

function hasSeen(tenantSlug: string): boolean {
  try {
    return window.sessionStorage.getItem(seenKey(tenantSlug)) === '1'
  } catch {
    // Storage blocked (private mode): showing it again is the safe default.
    return false
  }
}

function markSeen(tenantSlug: string): void {
  try {
    window.sessionStorage.setItem(seenKey(tenantSlug), '1')
  } catch {
    // Without storage the page shows once per page load instead — still usable.
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/** A table QR scan is already "at the table" — never greet it with a front door. */
function isTableLink(): boolean {
  return new URLSearchParams(window.location.search).has('table')
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SEEN_EVENT, onChange)
  return () => window.removeEventListener(SEEN_EVENT, onChange)
}

const noopSubscribe = () => () => {}

/**
 * Runs as the server HTML is parsed, before first paint: a visitor who already
 * passed the front door this session (or arrived from a table QR) must not see
 * it flash while the page hydrates. Mirrors `hasSeen` / `isTableLink`. The
 * landing is not parsed yet when this runs, so it adds a style rule scoped to
 * this store's landing; hydration then removes the landing itself.
 */
function hideIfSeenScript(tenantSlug: string): string {
  const hideRule = `[data-welcome-slug=${JSON.stringify(tenantSlug)}]{display:none!important}`
  const json = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c')
  return (
    `try{if(sessionStorage.getItem(${json(seenKey(tenantSlug))})==='1'||new URLSearchParams(location.search).has('table')){` +
    `var s=document.createElement('style');s.textContent=${json(hideRule)};document.head.appendChild(s)}}catch(_){}`
  )
}

interface WelcomeLandingProps {
  tenant: Tenant
  tenantSlug: string
}

/**
 * The Welcome Builder page for a store WITHOUT the branch chooser (one
 * location, or branches picked at checkout): a front door shown once per
 * visit, over the menu. Choosing an order type carries it to checkout; the
 * start button just opens the menu.
 *
 * Rendered open on the server so a first visit never flashes the menu first;
 * a returning visitor (same browser session) closes it on hydration.
 */
export function WelcomeLanding({ tenant, tenantSlug }: WelcomeLandingProps) {
  const design = useMemo(() => resolveCustomWelcomeDesign(tenant), [tenant])
  const isOpen = useSyncExternalStore(
    subscribe,
    () => !hasSeen(tenantSlug) && !isTableLink(),
    () => true,
  )
  // True on the server and while hydrating; the pre-paint script is only
  // useful in server HTML (a client-rendered <script> never runs).
  const isServerMarkup = useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  )
  const { setOrderType } = useCart()
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [hasLoadedModes, setHasLoadedModes] = useState(false)

  useEffect(() => {
    if (!isOpen || !design) return
    let isCurrent = true
    getEnabledOrderTypesByTenantClient(tenant.id)
      .then((rows) => {
        if (isCurrent) setOrderTypes(rows)
      })
      .catch(() => {
        // The tiles fall back to the start button; checkout still asks.
      })
      .finally(() => {
        if (isCurrent) setHasLoadedModes(true)
      })
    return () => {
      isCurrent = false
    }
  }, [isOpen, design, tenant.id])

  // The menu is mounted underneath; keep it from scrolling behind the page.
  useEffect(() => {
    if (!isOpen || !design) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen, design])

  const modes = useMemo(() => modesFromOrderTypes(orderTypes), [orderTypes])
  const close = useCallback(() => markSeen(tenantSlug), [tenantSlug])
  const chooseMode = useCallback(
    (mode: OutletOrderMode) => {
      const orderTypeId = resolveOrderTypeIdForMode(orderTypes, mode)
      if (orderTypeId) setOrderType(orderTypeId)
      close()
    },
    [orderTypes, setOrderType, close],
  )

  if (!design || !isOpen) return null

  return (
    <>
      {isServerMarkup && <script dangerouslySetInnerHTML={{ __html: hideIfSeenScript(tenantSlug) }} />}
      <div
        data-testid="welcome-landing"
        data-welcome-slug={tenantSlug}
        className="fixed inset-0 z-[110] flex flex-col overflow-y-auto bg-background"
      >
        <CustomWelcomePage
          design={design}
          storeName={tenant.name}
          logoUrl={tenant.logo_url || null}
          modes={modes}
          isLoadingModes={!hasLoadedModes}
          onChooseMode={chooseMode}
          onStart={close}
        />
      </div>
    </>
  )
}
