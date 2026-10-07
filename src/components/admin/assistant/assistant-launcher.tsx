'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { cn } from '@/lib/utils'

// The chat (and the AI SDK client) loads only when the owner first opens it.
const AssistantPanel = dynamic(() => import('./assistant-panel').then((module) => module.AssistantPanel), {
  ssr: false,
})

interface AssistantLauncherProps {
  tenantId: string
  adminBasePath: string
}

/** The floating owl. Stays mounted after the first open so a closed chat keeps its thread. */
export function AssistantLauncher({ tenantId, adminBasePath }: AssistantLauncherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  const open = () => {
    setHasOpened(true)
    setIsOpen(true)
  }

  return (
    <>
      {hasOpened ? (
        <AssistantPanel tenantId={tenantId} adminBasePath={adminBasePath} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      ) : null}
      <button
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        aria-label={isOpen ? 'Close Owl assistant' : 'Ask Owl, your store assistant'}
        aria-expanded={isOpen}
        className={cn(
          'fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full shadow-lg ring-2 ring-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 md:bottom-6 md:right-6 md:h-16 md:w-16',
          isOpen && 'hidden md:block',
        )}
      >
        <Image src="/assistant/owl-192.webp" alt="" width={64} height={64} priority={false} className="h-full w-full rounded-full" />
      </button>
    </>
  )
}
