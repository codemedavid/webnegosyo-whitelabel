'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  hiddenAdminSidebarPaths,
  isHiddenAdminHref,
  type AdminSidebarFlags,
} from '@/lib/admin-sidebar-visibility'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Sidebar links use Next's default ("auto") prefetch, never `prefetch={true}`.
 *
 * Every admin route is force-dynamic. A full prefetch of a dynamic route is a
 * complete server render — middleware, layout, and the page's own data reads —
 * so `prefetch={true}` on 6–14 visible links fired that many background page
 * renders on EVERY admin page load (the dashboard's history read among them),
 * and pinned their data in the router cache for 5 minutes, stale. Auto prefetch
 * fetches only the shell down to the route's `loading.tsx`, so a click still
 * shows the skeleton instantly and the page streams in fresh.
 */
const NAV_PREFETCH = null

export interface SidebarItem {
  label: string
  href: string
  /** Shown on top-level entries; a group's children are text-only. */
  icon?: React.ComponentType<{ className?: string }>
  /** Heading of the nav section this entry opens or continues. */
  section?: string
}

export interface SidebarGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: SidebarItem[]
  section?: string
}

export type SidebarEntry = SidebarItem | SidebarGroup

export function isGroup(entry: SidebarEntry): entry is SidebarGroup {
  return 'children' in entry
}

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Drops the entries a tenant's feature flags switch off; empty groups go too. */
export function useFilteredItems(items: SidebarEntry[], flags: AdminSidebarFlags): SidebarEntry[] {
  const {
    enableOrderManagement,
    menuEngineeringEnabled,
    bundlesEnabled,
    convexConfigured,
    inventoryEnabled,
    multiBranchEnabled,
    isBranchScopedAccount,
    hasStartHere,
  } = flags

  const hiddenPaths = useMemo(
    () =>
      hiddenAdminSidebarPaths({
        enableOrderManagement,
        menuEngineeringEnabled,
        bundlesEnabled,
        convexConfigured,
        inventoryEnabled,
        multiBranchEnabled,
        isBranchScopedAccount,
        hasStartHere,
      }),
    [
      enableOrderManagement,
      menuEngineeringEnabled,
      bundlesEnabled,
      convexConfigured,
      inventoryEnabled,
      multiBranchEnabled,
      isBranchScopedAccount,
      hasStartHere,
    ],
  )

  return useMemo(
    () =>
      items.flatMap<SidebarEntry>((entry) => {
        if (isGroup(entry)) {
          const children = entry.children.filter((child) => !isHiddenAdminHref(child.href, hiddenPaths))
          return children.length === 0 ? [] : [{ ...entry, children }]
        }
        return isHiddenAdminHref(entry.href, hiddenPaths) ? [] : [entry]
      }),
    [items, hiddenPaths],
  )
}

/**
 * The most specific entry matching the URL wins, so `/admin/inventory/log`
 * lights "Stock Log" and not "Inventory" as well.
 */
function useActiveHref(entries: SidebarEntry[]): string | null {
  const pathname = usePathname() ?? ''
  return useMemo(() => {
    const hrefs = entries.flatMap((entry) => (isGroup(entry) ? entry.children.map((c) => c.href) : [entry.href]))
    return hrefs
      .filter((href) => matchesPath(pathname, href))
      .reduce<string | null>((best, href) => (best === null || href.length > best.length ? href : best), null)
  }, [entries, pathname])
}

export interface SidebarNavState {
  activeHref: string | null
  expandedGroups: ReadonlySet<string>
  toggleGroup: (label: string) => void
  openGroup: (label: string) => void
}

/** Active route + which groups are open; the group holding the active route opens itself. */
export function useSidebarNavState(entries: SidebarEntry[]): SidebarNavState {
  const activeHref = useActiveHref(entries)
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set())

  const openGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => (prev.has(label) ? prev : new Set(prev).add(label)))
  }, [])

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  useEffect(() => {
    const activeGroup = entries.find(
      (entry) => isGroup(entry) && entry.children.some((child) => child.href === activeHref),
    )
    if (activeGroup) openGroup(activeGroup.label)
  }, [activeHref, entries, openGroup])

  return { activeHref, expandedGroups, toggleGroup, openGroup }
}

/** Label of the entry the visitor is on, for the mobile top bar. */
export function activeEntryLabel(entries: SidebarEntry[], activeHref: string | null): string {
  for (const entry of entries) {
    if (isGroup(entry)) {
      const child = entry.children.find((c) => c.href === activeHref)
      if (child) return child.label
    } else if (entry.href === activeHref) {
      return entry.label
    }
  }
  return 'Dashboard'
}

// ─── Rendering ────────────────────────────────────────────────────────────────

interface SidebarNavProps {
  entries: SidebarEntry[]
  state: SidebarNavState
  /** Icon-only rail: labels move into tooltips, groups expand the rail. */
  isCollapsed?: boolean
  /** Taller rows for the touch drawer. */
  isTouch?: boolean
  onExpandRail?: () => void
  /** A link was followed — the mobile drawer closes on it (even when the URL stays the same). */
  onNavigate?: () => void
}

const ROW =
  'group/nav relative flex w-full items-center gap-3 rounded-lg px-3 text-left font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-wn-amber/70'
const ROW_IDLE = 'text-white/60 hover:bg-white/[0.06] hover:text-white'
const ROW_ACTIVE = 'bg-white/[0.09] text-white'

function RailTooltip({ label, isEnabled, children }: { label: string; isEnabled: boolean; children: React.ReactElement }) {
  if (!isEnabled) return children
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={14}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function ActiveBar() {
  return <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-wn-amber" />
}

export function SidebarNav({ entries, state, isCollapsed = false, isTouch = false, onExpandRail, onNavigate }: SidebarNavProps) {
  const rowHeight = isTouch ? 'h-11 text-[14.5px]' : 'h-9 text-[13.5px]'

  return (
    <ul className="space-y-0.5">
      {entries.map((entry, index) => {
        const opensSection =
          index > 0 && entry.section !== undefined && entry.section !== entries[index - 1].section

        return (
          <li key={entry.label}>
            {opensSection &&
              (isCollapsed ? (
                <div aria-hidden className="mx-3 my-3 h-px bg-white/10" />
              ) : (
                <p className="px-3 pb-1.5 pt-5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
                  {entry.section}
                </p>
              ))}
            {isGroup(entry) ? (
              <NavGroup
                group={entry}
                state={state}
                isCollapsed={isCollapsed}
                isTouch={isTouch}
                rowHeight={rowHeight}
                onExpandRail={onExpandRail}
                onNavigate={onNavigate}
              />
            ) : (
              <NavLink
                item={entry}
                isActive={entry.href === state.activeHref}
                isCollapsed={isCollapsed}
                rowHeight={rowHeight}
                onNavigate={onNavigate}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function NavLink({
  item,
  isActive,
  isCollapsed,
  rowHeight,
  onNavigate,
}: {
  item: SidebarItem
  isActive: boolean
  isCollapsed: boolean
  rowHeight: string
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <RailTooltip label={item.label} isEnabled={isCollapsed}>
      <Link
        href={item.href}
        prefetch={NAV_PREFETCH}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        aria-label={isCollapsed ? item.label : undefined}
        className={cn(ROW, rowHeight, isActive ? ROW_ACTIVE : ROW_IDLE, isCollapsed && 'justify-center px-0')}
      >
        {isActive && <ActiveBar />}
        {Icon && (
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-wn-amber' : 'text-white/45 group-hover/nav:text-white/85',
            )}
          />
        )}
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </RailTooltip>
  )
}

function NavGroup({
  group,
  state,
  isCollapsed,
  isTouch,
  rowHeight,
  onExpandRail,
  onNavigate,
}: {
  group: SidebarGroup
  state: SidebarNavState
  isCollapsed: boolean
  isTouch: boolean
  rowHeight: string
  onExpandRail?: () => void
  onNavigate?: () => void
}) {
  const Icon = group.icon
  const isOpen = state.expandedGroups.has(group.label)
  const holdsActive = group.children.some((child) => child.href === state.activeHref)
  // Unique per render site: the desktop rail and the mobile drawer can both be mounted.
  const panelId = useId()

  const handleClick = () => {
    if (isCollapsed) {
      onExpandRail?.()
      state.openGroup(group.label)
      return
    }
    state.toggleGroup(group.label)
  }

  return (
    <>
      <RailTooltip label={group.label} isEnabled={isCollapsed}>
        <button
          type="button"
          onClick={handleClick}
          aria-expanded={isCollapsed ? undefined : isOpen}
          aria-controls={isCollapsed ? undefined : panelId}
          aria-label={isCollapsed ? group.label : undefined}
          className={cn(
            ROW,
            rowHeight,
            holdsActive && (isCollapsed || !isOpen) ? ROW_ACTIVE : ROW_IDLE,
            isCollapsed && 'justify-center px-0',
          )}
        >
          {holdsActive && (isCollapsed || !isOpen) && <ActiveBar />}
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              holdsActive ? 'text-wn-amber' : 'text-white/45 group-hover/nav:text-white/85',
            )}
          />
          {!isCollapsed && (
            <>
              <span className="flex-1 truncate">{group.label}</span>
              <ChevronDown
                aria-hidden
                className={cn('h-4 w-4 shrink-0 text-white/35 transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </>
          )}
        </button>
      </RailTooltip>

      {!isCollapsed && isOpen && (
        <ul id={panelId} className="relative mb-1 ml-[21px] mt-0.5 space-y-0.5 border-l border-white/10 pl-2.5">
          {group.children.map((child) => {
            const isActive = child.href === state.activeHref
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  prefetch={NAV_PREFETCH}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    ROW,
                    isTouch ? 'h-10 text-[14px]' : 'h-8 text-[13px]',
                    'font-medium',
                    isActive ? 'bg-white/[0.07] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white',
                  )}
                >
                  {isActive && (
                    <span aria-hidden className="absolute -left-[11px] inset-y-1.5 w-[2px] rounded-full bg-wn-amber" />
                  )}
                  <span className="truncate">{child.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
