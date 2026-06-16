'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  CornerDownLeft,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

interface CommandDestination {
  id: string
  label: string
  hint: string
  href: string
  icon: LucideIcon
  group: 'Overview' | 'Operations' | 'Actions'
  keywords?: string[]
}

const DESTINATIONS: CommandDestination[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    hint: 'Platform overview',
    href: '/superadmin',
    icon: LayoutDashboard,
    group: 'Overview',
    keywords: ['home', 'overview', 'kpi'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    hint: 'GMV, orders & trends',
    href: '/superadmin/analytics',
    icon: BarChart3,
    group: 'Overview',
    keywords: ['gmv', 'revenue', 'charts', 'metrics'],
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    hint: 'All tenants',
    href: '/superadmin/tenants',
    icon: Store,
    group: 'Operations',
    keywords: ['tenants', 'merchants', 'stores'],
  },
  {
    id: 'leads',
    label: 'Leads',
    hint: 'Sign-up leads',
    href: '/superadmin/leads',
    icon: Users,
    group: 'Operations',
    keywords: ['signups', 'prospects'],
  },
  {
    id: 'checkout-leads',
    label: 'Checkout Leads',
    hint: 'Abandoned checkouts',
    href: '/superadmin/checkout-leads',
    icon: ShoppingCart,
    group: 'Operations',
    keywords: ['carts', 'abandoned', 'payment'],
  },
  {
    id: 'add-restaurant',
    label: 'Add Restaurant',
    hint: 'Onboard a new tenant',
    href: '/superadmin/tenants/new',
    icon: Plus,
    group: 'Actions',
    keywords: ['new', 'create', 'onboard', 'tenant'],
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Platform configuration',
    href: '/superadmin/settings',
    icon: Settings,
    group: 'Actions',
    keywords: ['config', 'preferences'],
  },
]

const GROUP_ORDER: CommandDestination['group'][] = ['Overview', 'Operations', 'Actions']

interface CommandItem {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  group: string
  onSelect: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const go = useCallback(
    (href: string) => {
      onOpenChange(false)
      router.push(href)
    },
    [onOpenChange, router],
  )

  // Build the flat, filtered item list (search action injected first when query present).
  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase()
    const result: CommandItem[] = []

    if (q.length > 0) {
      result.push({
        id: 'search-restaurants',
        label: `Search restaurants for “${query.trim()}”`,
        hint: 'Open Restaurants filtered by this query',
        icon: Search,
        group: 'Search',
        onSelect: () => go(`/superadmin/tenants?search=${encodeURIComponent(query.trim())}`),
      })
    }

    const matched = DESTINATIONS.filter((d) => {
      if (q.length === 0) return true
      const haystack = [d.label, d.hint, ...(d.keywords ?? [])].join(' ').toLowerCase()
      return haystack.includes(q)
    })

    for (const d of matched) {
      result.push({
        id: d.id,
        label: d.label,
        hint: d.hint,
        icon: d.icon,
        group: d.group,
        onSelect: () => go(d.href),
      })
    }

    return result
  }, [query, go])

  // Group the flat items for rendering while keeping a stable flat index for keyboard nav.
  const groups = useMemo(() => {
    const order = ['Search', ...GROUP_ORDER]
    const map = new Map<string, { item: CommandItem; index: number }[]>()
    items.forEach((item, index) => {
      const bucket = map.get(item.group) ?? []
      bucket.push({ item, index })
      map.set(item.group, bucket)
    })
    return order
      .filter((g) => map.has(g))
      .map((g) => ({ group: g, entries: map.get(g)! }))
  }, [items])

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  // Clamp the active index if the filtered list shrinks.
  useEffect(() => {
    setActiveIndex((prev) => {
      if (items.length === 0) return 0
      return Math.min(prev, items.length - 1)
    })
  }, [items.length])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      items[activeIndex]?.onSelect()
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(items.length - 1)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="superadmin-shell fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          aria-label="Command palette"
          className="superadmin-shell fixed left-1/2 top-[12vh] z-[101] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2"
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search for pages or jump to a destination.
          </DialogPrimitive.Description>

          {/* Search field */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4">
            <Search className="h-4.5 w-4.5 shrink-0 text-white/40" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or jump to…"
              aria-label="Search or jump to a destination"
              autoComplete="off"
              spellCheck={false}
              className="h-14 w-full bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded-md border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/45 sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <Search className="mb-3 h-8 w-8 text-white/15" aria-hidden />
                <p className="text-sm font-medium text-white/60">No results</p>
                <p className="mt-1 text-xs text-white/40">
                  Nothing matches “{query.trim()}”.
                </p>
              </div>
            ) : (
              groups.map(({ group, entries }) => (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                    {group}
                  </p>
                  <div className="space-y-0.5" role="listbox" aria-label={group}>
                    {entries.map(({ item, index }) => {
                      const Icon = item.icon
                      const isActive = index === activeIndex
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-index={index}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => item.onSelect()}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                            isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                              isActive
                                ? 'border-white/20 bg-white/10 text-white'
                                : 'border-white/10 bg-white/[0.03] text-white/55',
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-white">
                              {item.label}
                            </span>
                            <span className="block truncate text-xs text-white/45">
                              {item.hint}
                            </span>
                          </span>
                          {isActive ? (
                            <CornerDownLeft
                              className="h-3.5 w-3.5 shrink-0 text-white/40"
                              aria-hidden
                            />
                          ) : (
                            <ArrowRight
                              className="h-3.5 w-3.5 shrink-0 text-white/15"
                              aria-hidden
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer hint bar */}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5">
              <KbdHint>↑</KbdHint>
              <KbdHint>↓</KbdHint>
              <span className="ml-0.5">Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <KbdHint>↵</KbdHint>
              <span className="ml-0.5">Open</span>
            </span>
            <span className="flex items-center gap-1.5">
              <KbdHint>esc</KbdHint>
              <span className="ml-0.5">Close</span>
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function KbdHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-white/15 bg-white/[0.04] px-1 py-0.5 text-[10px] font-medium text-white/55">
      {children}
    </kbd>
  )
}
