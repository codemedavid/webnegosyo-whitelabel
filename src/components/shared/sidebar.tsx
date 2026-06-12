'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderTree,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Store,
  ShoppingBag,
  CreditCard,
  TrendingUp,
  Paintbrush,
  BarChart3,
  Cog,
  Box,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useState, useEffect, useCallback, useMemo } from 'react'

interface SidebarItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface SidebarGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: SidebarItem[]
}

type SidebarEntry = SidebarItem | SidebarGroup

function isGroup(entry: SidebarEntry): entry is SidebarGroup {
  return 'children' in entry
}

// ─── Shared filtering logic ───────────────────────────────────────────────────

function useFilteredItems(
  items: SidebarEntry[],
  enableOrderManagement?: boolean,
  menuEngineeringEnabled?: boolean,
  bundlesEnabled?: boolean,
  convexConfigured?: boolean,
) {
  const hiddenPaths = useMemo(() => {
    const paths = new Set<string>()
    if (enableOrderManagement === false) paths.add('/orders')
    if (!menuEngineeringEnabled) {
      paths.add('/boost-sales')
      // Product Analytics shows basic per-product sales whenever Convex is
      // configured (advanced BCG/cost features are gated inside the page), so
      // only hide it when there is no Convex backend at all.
      if (!convexConfigured) paths.add('/product-analytics')
    }
    if (!bundlesEnabled) paths.add('/bundles')
    return paths
  }, [enableOrderManagement, menuEngineeringEnabled, bundlesEnabled, convexConfigured])

  const shouldHide = useCallback(
    (href: string) => Array.from(hiddenPaths).some((p) => href.includes(p)),
    [hiddenPaths]
  )

  return useMemo(
    () =>
      items
        .map((entry) => {
          if (isGroup(entry)) {
            const children = entry.children.filter((child) => !shouldHide(child.href))
            if (children.length === 0) return null
            return { ...entry, children }
          }
          return shouldHide(entry.href) ? null : entry
        })
        .filter(Boolean) as SidebarEntry[],
    [items, shouldHide]
  )
}

// ─── Section builder ──────────────────────────────────────────────────────────

function buildSections(filteredItems: SidebarEntry[]) {
  const sections: { type: 'item' | 'group'; entries: SidebarEntry[] }[] = []
  let currentBatch: SidebarEntry[] = []
  let currentType: 'item' | 'group' | null = null

  for (const entry of filteredItems) {
    const type = isGroup(entry) ? 'group' : 'item'
    if (currentType !== null && currentType !== type) {
      sections.push({ type: currentType, entries: currentBatch })
      currentBatch = []
    }
    currentType = type
    currentBatch.push(entry)
  }
  if (currentBatch.length > 0 && currentType !== null) {
    sections.push({ type: currentType, entries: currentBatch })
  }
  return sections
}

// ─── Active page title ────────────────────────────────────────────────────────

function useActivePageTitle(filteredItems: SidebarEntry[]) {
  const pathname = usePathname()
  for (const entry of filteredItems) {
    if (isGroup(entry)) {
      for (const child of entry.children) {
        if (pathname === child.href || pathname.startsWith(child.href + '/')) {
          return child.label
        }
      }
    } else if (pathname === entry.href || pathname.startsWith(entry.href + '/')) {
      return entry.label
    }
  }
  return 'Dashboard'
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  items: SidebarEntry[]
  basePath: string
  onLogout?: () => void
  tenantName?: string
  enableOrderManagement?: boolean
  menuEngineeringEnabled?: boolean
  bundlesEnabled?: boolean
  convexConfigured?: boolean
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

export function Sidebar({ items, onLogout, tenantName, enableOrderManagement, menuEngineeringEnabled, bundlesEnabled, convexConfigured }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const filteredItems = useFilteredItems(items, enableOrderManagement, menuEngineeringEnabled, bundlesEnabled, convexConfigured)

  // Auto-expand group containing active route
  useEffect(() => {
    for (const entry of filteredItems) {
      if (isGroup(entry)) {
        const hasActive = entry.children.some(
          (child) => pathname === child.href || pathname.startsWith(child.href + '/')
        )
        if (hasActive) {
          setExpandedGroups((prev) => {
            if (prev.has(entry.label)) return prev
            return new Set(prev).add(entry.label)
          })
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(href + '/'),
    [pathname]
  )

  const renderItem = (item: SidebarItem, indented = false) => {
    const Icon = item.icon
    const active = isActive(item.href)

    const button = (
      <Link key={item.href} href={item.href} prefetch={true}>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3 font-medium transition-colors',
            collapsed && 'justify-center gap-0 px-2',
            indented && !collapsed && 'pl-10 gap-2.5',
            active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
            !active && 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
          size={indented ? 'sm' : 'default'}
        >
          <Icon
            className={cn(
              'shrink-0 transition-colors',
              indented ? 'h-4 w-4' : 'h-[18px] w-[18px]',
              active && 'text-primary',
            )}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {active && !collapsed && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          )}
        </Button>
      </Link>
    )

    if (collapsed) {
      return (
        <Tooltip key={item.href} delayDuration={0}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      )
    }

    return button
  }

  const renderGroup = (group: SidebarGroup) => {
    const Icon = group.icon
    const isExpanded = expandedGroups.has(group.label)
    const hasActive = group.children.some((child) => isActive(child.href))

    const groupButton = (
      <Button
        variant="ghost"
        className={cn(
          'w-full justify-start gap-3 font-medium transition-colors',
          collapsed && 'justify-center gap-0 px-2',
          hasActive && !isExpanded && 'text-primary',
          !hasActive && 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => {
          if (collapsed) {
            setCollapsed(false)
            setExpandedGroups((prev) => new Set(prev).add(group.label))
          } else {
            toggleGroup(group.label)
          }
        }}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-colors',
            hasActive && 'text-primary',
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </>
        )}
      </Button>
    )

    return (
      <div key={group.label}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{groupButton}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {group.label}
            </TooltipContent>
          </Tooltip>
        ) : (
          groupButton
        )}
        {!collapsed && isExpanded && (
          <div className="mt-0.5 ml-[13px] border-l border-border/60 space-y-0.5 py-0.5">
            {group.children.map((child) => renderItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  const sections = buildSections(filteredItems)

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'hidden md:flex sticky top-0 h-screen flex-col border-r bg-muted/30 transition-all duration-300',
          collapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center border-b px-3">
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold truncate">Dashboard</span>
              {tenantName && (
                <span className="text-[11px] text-muted-foreground truncate leading-tight">
                  {tenantName}
                </span>
              )}
            </div>
          )}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(!collapsed)}
                className={cn(
                  'h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground',
                  collapsed && 'mx-auto'
                )}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-1">
            {sections.map((section, sIdx) => (
              <div key={sIdx}>
                {sIdx > 0 && (
                  <div className="my-2 mx-2">
                    <div className="h-px bg-border/60" />
                  </div>
                )}
                {section.type === 'group' && !collapsed && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Manage
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.entries.map((entry) =>
                    isGroup(entry) ? renderGroup(entry) : renderItem(entry)
                  )}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Logout */}
        {onLogout && (
          <div className="border-t p-2">
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-center px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onLogout}
                  >
                    <LogOut className="h-[18px] w-[18px]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  Logout
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onLogout}
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span>Logout</span>
              </Button>
            )}
          </div>
        )}
      </aside>
    </TooltipProvider>
  )
}

// ─── Mobile Header + Sheet ────────────────────────────────────────────────────

export function MobileSidebar({ items, onLogout, tenantName, enableOrderManagement, menuEngineeringEnabled, bundlesEnabled, convexConfigured }: SidebarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const filteredItems = useFilteredItems(items, enableOrderManagement, menuEngineeringEnabled, bundlesEnabled, convexConfigured)
  const pageTitle = useActivePageTitle(filteredItems)

  // Auto-expand active group on open
  useEffect(() => {
    if (!open) return
    for (const entry of filteredItems) {
      if (isGroup(entry)) {
        const hasActive = entry.children.some(
          (child) => pathname === child.href || pathname.startsWith(child.href + '/')
        )
        if (hasActive) {
          setExpandedGroups((prev) => {
            if (prev.has(entry.label)) return prev
            return new Set(prev).add(entry.label)
          })
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathname])

  // Close sheet on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(href + '/'),
    [pathname]
  )

  const renderMobileItem = (item: SidebarItem, indented = false) => {
    const Icon = item.icon
    const active = isActive(item.href)

    return (
      <Link key={item.href} href={item.href} prefetch={true}>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3 font-medium transition-colors h-11',
            indented && 'pl-10 gap-2.5',
            active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
            !active && 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
          size={indented ? 'sm' : 'default'}
        >
          <Icon
            className={cn(
              'shrink-0',
              indented ? 'h-4 w-4' : 'h-[18px] w-[18px]',
              active && 'text-primary',
            )}
          />
          <span className="truncate">{item.label}</span>
          {active && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          )}
        </Button>
      </Link>
    )
  }

  const renderMobileGroup = (group: SidebarGroup) => {
    const Icon = group.icon
    const isExpanded = expandedGroups.has(group.label)
    const hasActive = group.children.some((child) => isActive(child.href))

    return (
      <div key={group.label}>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3 font-medium transition-colors h-11',
            hasActive && !isExpanded && 'text-primary',
            !hasActive && 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => toggleGroup(group.label)}
        >
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              hasActive && 'text-primary',
            )}
          />
          <span className="flex-1 text-left truncate">{group.label}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </Button>
        {isExpanded && (
          <div className="mt-0.5 ml-[13px] border-l border-border/60 space-y-0.5 py-0.5">
            {group.children.map((child) => renderMobileItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  const sections = buildSections(filteredItems)

  return (
    <>
      {/* Fixed mobile top bar */}
      <header className="sticky top-0 z-40 flex md:hidden h-14 items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-semibold truncate">{pageTitle}</span>
          {tenantName && (
            <span className="text-[11px] text-muted-foreground truncate leading-tight">
              {tenantName}
            </span>
          )}
        </div>
      </header>

      {/* Sheet drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">
              <span className="block">Dashboard</span>
              {tenantName && (
                <span className="block text-[11px] font-normal text-muted-foreground truncate leading-tight mt-0.5">
                  {tenantName}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 h-[calc(100vh-8rem)]">
            <nav className="p-2 space-y-1">
              {sections.map((section, sIdx) => (
                <div key={sIdx}>
                  {sIdx > 0 && (
                    <div className="my-2 mx-2">
                      <div className="h-px bg-border/60" />
                    </div>
                  )}
                  {section.type === 'group' && (
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Manage
                      </span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {section.entries.map((entry) =>
                      isGroup(entry) ? renderMobileGroup(entry) : renderMobileItem(entry)
                    )}
                  </div>
                </div>
              ))}
            </nav>
          </ScrollArea>

          {onLogout && (
            <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-2">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 h-11"
                onClick={() => {
                  setOpen(false)
                  onLogout()
                }}
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span>Logout</span>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Predefined sidebar configurations ────────────────────────────────────────

export const adminSidebarItems: SidebarEntry[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    label: 'Menu',
    icon: UtensilsCrossed,
    children: [
      { label: 'Menu Management', href: '/admin/menu', icon: UtensilsCrossed },
      { label: 'Categories', href: '/admin/categories', icon: FolderTree },
      { label: 'Bundles', href: '/admin/bundles', icon: Box },
    ],
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    children: [
      { label: 'Boost Sales', href: '/admin/boost-sales', icon: TrendingUp },
      { label: 'Product Analytics', href: '/admin/product-analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Store Setup',
    icon: Cog,
    children: [
      { label: 'Order Types', href: '/admin/order-types', icon: Store },
      { label: 'Payment Methods', href: '/admin/payment-methods', icon: CreditCard },
      { label: 'Hero Designer', href: '/admin/hero-designer', icon: Paintbrush },
    ],
  },
  {
    label: 'Orders',
    href: '/admin/orders',
    icon: ShoppingBag,
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
]

export const superAdminSidebarItems: SidebarEntry[] = [
  {
    label: 'Dashboard',
    href: '/superadmin',
    icon: LayoutDashboard,
  },
  {
    label: 'Tenants',
    href: '/superadmin/tenants',
    icon: Store,
  },
  {
    label: 'Settings',
    href: '/superadmin/settings',
    icon: Settings,
  },
]

// Re-export types for consumers
export type { SidebarItem, SidebarGroup, SidebarEntry }
