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
  Store,
  ShoppingBag,
  CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface SidebarItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface SidebarProps {
  items: SidebarItem[]
  basePath: string
  onLogout?: () => void
  tenantName?: string
  enableOrderManagement?: boolean
}

export function Sidebar({ items, onLogout, tenantName, enableOrderManagement }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Filter out orders item if order management is disabled
  const filteredItems = enableOrderManagement === false 
    ? items.filter(item => !item.href.includes('/orders'))
    : items

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-muted/40 transition-all duration-300',
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

      <nav className="flex-1 space-y-1 p-2">
        {filteredItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  collapsed && 'justify-center px-2'
                )}
              >
                <Icon className={cn('h-5 w-5', !collapsed && 'mr-3')} />
                {!collapsed && <span>{item.label}</span>}
              </Button>
            </Link>
          )
        })}
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
export const adminSidebarItems: SidebarItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    label: 'Menu Management',
    href: '/admin/menu',
    icon: UtensilsCrossed,
  },
  {
    label: 'Categories',
    href: '/admin/categories',
    icon: FolderTree,
  },
  {
    label: 'Order Types',
    href: '/admin/order-types',
    icon: Store,
  },
  {
    label: 'Payment Methods',
    href: '/admin/payment-methods',
    icon: CreditCard,
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

export const superAdminSidebarItems: SidebarItem[] = [
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

