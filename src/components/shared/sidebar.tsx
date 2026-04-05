'use client'
// sidebar navigation with collapsible groups
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

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

interface SidebarProps {
  items: SidebarEntry[]
  basePath: string
  onLogout?: () => void
  tenantName?: string
  enableOrderManagement?: boolean
  menuEngineeringEnabled?: boolean
  bundlesEnabled?: boolean
}

export function Sidebar({ items, onLogout, tenantName, enableOrderManagement, menuEngineeringEnabled, bundlesEnabled }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Filter entries based on feature flags
  const hiddenPaths = new Set<string>()
  if (enableOrderManagement === false) hiddenPaths.add('/orders')
  if (!menuEngineeringEnabled) {
    hiddenPaths.add('/boost-sales')
    hiddenPaths.add('/product-analytics')
  }
  if (!bundlesEnabled) hiddenPaths.add('/bundles')

  const shouldHide = (href: string) =>
    Array.from(hiddenPaths).some((p) => href.includes(p))

  const filteredItems = items
    .map((entry) => {
      if (isGroup(entry)) {
        const children = entry.children.filter((child) => !shouldHide(child.href))
        if (children.length === 0) return null
        return { ...entry, children }
      }
      return shouldHide(entry.href) ? null : entry
    })
    .filter(Boolean) as SidebarEntry[]

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

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const renderItem = (item: SidebarItem, indented = false) => {
    const Icon = item.icon
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    return (
      <Link key={item.href} href={item.href}>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            collapsed && 'justify-center px-2',
            indented && !collapsed && 'pl-9'
          )}
          size={indented ? 'sm' : 'default'}
        >
          <Icon className={cn('h-5 w-5 shrink-0', !collapsed && 'mr-3', indented && 'h-4 w-4')} />
          {!collapsed && <span>{item.label}</span>}
        </Button>
      </Link>
    )
  }

  const renderGroup = (group: SidebarGroup) => {
    const Icon = group.icon
    const isExpanded = expandedGroups.has(group.label)
    const hasActive = group.children.some(
      (child) => pathname === child.href || pathname.startsWith(child.href + '/')
    )

    return (
      <div key={group.label}>
        <Button
          variant={hasActive && !isExpanded ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            collapsed && 'justify-center px-2'
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
          <Icon className={cn('h-5 w-5 shrink-0', !collapsed && 'mr-3')} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
              />
            </>
          )}
        </Button>
        {!collapsed && isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {group.children.map((child) => renderItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col border-r bg-muted/40 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-semibold">Dashboard</span>
            {tenantName && <span className="text-xs text-muted-foreground truncate">{tenantName}</span>}
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {filteredItems.map((entry) =>
          isGroup(entry) ? renderGroup(entry) : renderItem(entry)
        )}
      </nav>

      {onLogout && (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-destructive hover:text-destructive',
              collapsed && 'justify-center px-2'
            )}
            onClick={onLogout}
          >
            <LogOut className={cn('h-5 w-5', !collapsed && 'mr-3')} />
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      )}
    </aside>
  )
}

// Predefined sidebar configurations
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
