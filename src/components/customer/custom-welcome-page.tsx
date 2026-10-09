'use client'

import { useCallback, useMemo } from 'react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { HeroLinkProvider, type HeroLinkHandler } from '@/components/hero-builder/renderer/link-context'
import { WelcomeRuntimeProvider, type WelcomeRuntime } from '@/components/hero-builder/renderer/welcome-runtime'
import type { EntryMode, HeroDesignV5 } from '@/lib/hero-builder/types'

interface CustomWelcomePageProps {
  design: HeroDesignV5
  storeName: string
  logoUrl: string | null
  /** Order types the customer can actually take, in display order. */
  modes: readonly EntryMode[]
  /** Why we are asking again (a closed branch, a dead link) — never hidden. */
  message?: string | null
  /** Order types still loading: the choices hold their place. */
  isLoadingModes?: boolean
  onChooseMode: (mode: EntryMode) => void
  onStart: () => void
}

/**
 * The merchant's Welcome Builder page, live. Every in-store link starts an
 * order: before a branch is chosen there is no menu to jump into, so menu,
 * category and product links do what "Start ordering" does. Section links
 * still scroll within the page (the handler declines them).
 */
export function CustomWelcomePage({ design, storeName, logoUrl, modes, message, isLoadingModes, onChooseMode, onStart }: CustomWelcomePageProps) {
  const runtime = useMemo<WelcomeRuntime>(
    () => ({ storeName, logoUrl, modes, isLoadingModes, onChooseMode, onStart }),
    [storeName, logoUrl, modes, isLoadingModes, onChooseMode, onStart],
  )

  const handleLink = useCallback<HeroLinkHandler>(
    (target) => {
      if (target.type === 'anchor') return false
      if (target.type === 'welcome-mode' && modes.includes(target.mode)) onChooseMode(target.mode)
      else onStart()
      return true
    },
    [modes, onChooseMode, onStart],
  )

  return (
    <div data-testid="custom-welcome-page" className="flex min-h-full w-full flex-1 flex-col bg-[var(--brand-background,#fff)]">
      {message && (
        <p role="status" className="bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800">
          {message}
        </p>
      )}
      <WelcomeRuntimeProvider value={runtime}>
        <HeroLinkProvider value={handleLink}>
          <HeroBuilderRenderer design={design} />
        </HeroLinkProvider>
      </WelcomeRuntimeProvider>
    </div>
  )
}
