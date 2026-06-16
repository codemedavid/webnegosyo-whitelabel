'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, LogOut, Search, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CommandPalette } from '@/components/superadmin/command-palette'

export function SuperAdminTopbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // ⌘K / Ctrl+K toggles the command palette platform-wide.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // The login screen renders chrome-free — mirror the sidebar's self-gating.
  if (pathname === '/superadmin/login') return null

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/superadmin/login')
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          {/* Command-palette trigger styled as a search field */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette to search or jump to a page"
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              'group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 text-left transition-colors',
              'hover:border-white/20 hover:bg-white/[0.04] focus:outline-none focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20',
              'sm:max-w-md',
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-white/40 group-hover:text-white/60" aria-hidden />
            <span className="flex-1 truncate text-sm text-white/40 group-hover:text-white/60">
              Search or jump to…
            </span>
            <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/45 sm:inline-flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          <div className="flex-1" />

          {/* Account cluster */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className={cn(
                  'flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] pl-2 pr-2.5 transition-colors',
                  'hover:border-white/20 hover:bg-white/[0.04] focus:outline-none focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20',
                  'data-[state=open]:border-white/20 data-[state=open]:bg-white/[0.04]',
                )}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
                  <Shield className="h-4 w-4 text-black" aria-hidden />
                </span>
                <span className="hidden flex-col items-start leading-tight sm:flex">
                  <span className="text-xs font-semibold text-white">Superadmin</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
                    Platform
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-white/40" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="superadmin-shell w-56 rounded-xl border-white/10 bg-[#0a0a0a] p-1.5 text-white shadow-2xl shadow-black/60"
            >
              <DropdownMenuLabel className="px-2 py-2">
                <span className="block text-sm font-semibold text-white">Superadmin</span>
                <span className="block text-xs font-normal text-white/45">
                  Platform administrator
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                disabled={isLoggingOut}
                onSelect={(e) => {
                  e.preventDefault()
                  handleLogout()
                }}
                className="gap-2 rounded-lg px-2 py-2 text-red-400 focus:bg-red-500/10 focus:text-red-400 data-[disabled]:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                {isLoggingOut ? 'Signing out…' : 'Log out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
