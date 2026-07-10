'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { FlashScreenBranding } from '@/lib/flash-loader'

interface FlashScreenLoaderProps {
  branding: FlashScreenBranding
}

/**
 * Full-screen branded loading splash. Purely presentational — it takes fully
 * resolved branding (see `resolveFlashScreenBranding`) and renders the tenant's
 * logo/initial, title, subtitle and a spinner over their chosen colors.
 */
export function FlashScreenLoader({ branding }: FlashScreenLoaderProps) {
  return (
    <div
      data-branding-scope="flash/settings"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[120] flex items-center justify-center px-6"
      style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {branding.imageUrl ? (
          <div className="mb-6 h-24 w-24 overflow-hidden rounded-full border border-white/20 bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.imageUrl}
              alt={branding.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-bold">
            {branding.initial}
          </div>
        )}

        <h2 className="text-2xl font-semibold">{branding.title}</h2>

        {branding.subtitle && (
          <p className="mt-2 text-sm opacity-90">{branding.subtitle}</p>
        )}

        <div
          className="mt-8 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  )
}

/**
 * The tenant layout resolves flash branding once (it has the tenant + params)
 * and provides it here. Route-level `loading.tsx` files render inside this
 * provider, so they can pick up the branding without access to route params.
 * `null` means the flash screen is disabled for this tenant.
 */
const TenantFlashContext = createContext<FlashScreenBranding | null>(null)

export function TenantFlashProvider({
  branding,
  children,
}: {
  branding: FlashScreenBranding | null
  children: ReactNode
}) {
  return <TenantFlashContext.Provider value={branding}>{children}</TenantFlashContext.Provider>
}

export function useTenantFlash(): FlashScreenBranding | null {
  return useContext(TenantFlashContext)
}

/**
 * Route loading component: shows the branded flash while a tenant page is
 * loading, or the page's own skeleton when the flash screen is disabled (or the
 * provider is absent). This keeps every existing skeleton as the safe fallback,
 * so tenants without the flash feature see exactly what they see today.
 */
export function TenantFlashLoading({ fallback }: { fallback: ReactNode }) {
  const branding = useTenantFlash()
  if (!branding) return <>{fallback}</>
  return <FlashScreenLoader branding={branding} />
}
