'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Store,
  BarChart3,
  Shield,
  Users,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SidebarItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface SidebarGroup {
  label: string
  items: SidebarItem[]
}

// Primary nav grouped into Overview + Operations. Settings lives in the footer.
const navGroups: SidebarGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboard },
      { label: 'Analytics', href: '/superadmin/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Restaurants', href: '/superadmin/tenants', icon: Store },
      { label: 'Leads', href: '/superadmin/leads', icon: Users },
      { label: 'Checkout Leads', href: '/superadmin/checkout-leads', icon: ShoppingCart },
    ],
  },
]

const settingsItem: SidebarItem = {
  label: 'Settings',
  href: '/superadmin/settings',
  icon: Settings,
}

export function SuperAdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // The login screen lives under this layout — render it full-bleed (no chrome).
  if (pathname === '/superadmin/login') return null

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/superadmin/login')
  }

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const Icon = item.icon
    const isActive =
      item.href === '/superadmin'
        ? pathname === '/superadmin'
        : pathname === item.href || pathname.startsWith(item.href + '/')

    const button = (
      <Link
        key={item.href}
        href={item.href}
        prefetch={true}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex items-center rounded-xl px-3 py-2.5 text-sm transition-colors',
          collapsed ? 'justify-center' : 'gap-3',
          isActive
            ? 'bg-white/10 font-medium text-white'
            : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
        )}
      >
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-white" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    )

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      )
    }

    return button
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'relative z-20 flex h-screen shrink-0 flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl transition-all duration-200',
          collapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center px-4">
          <Link
            href="/superadmin"
            className={cn('flex items-center gap-3', collapsed && 'mx-auto')}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
              <Shield className="h-5 w-5 text-black" />
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold tracking-tight text-white">
                  WebNegosyo
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
                  Superadmin
                </span>
              </div>
            )}
          </Link>
        </div>

        <div className="mx-3 h-px bg-white/10" />

        {/* Navigation — grouped */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group, idx) => (
            <div key={group.label} className={cn(idx > 0 && 'mt-5')}>
              {collapsed ? (
                <div className="mx-2 mb-1.5 h-px bg-white/[0.06]" aria-hidden />
              ) : (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavItem key={item.href} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mx-3 h-px bg-white/10" />

        {/* Footer */}
        <div className="space-y-1 p-3">
          <NavItem item={settingsItem} />

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCollapsed(false)}
                  aria-label="Expand sidebar"
                  className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setCollapsed(true)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              Collapse
            </button>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  aria-label="Logout"
                  className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {isLoggingOut ? 'Signing out…' : 'Logout'}
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
