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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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

const sidebarItems: SidebarItem[] = [
  {
    label: 'Dashboard',
    href: '/superadmin',
    icon: LayoutDashboard,
  },
  {
    label: 'Restaurants',
    href: '/superadmin/tenants',
    icon: Store,
  },
  {
    label: 'Analytics',
    href: '/superadmin/analytics',
    icon: BarChart3,
  },
  {
    label: 'Leads',
    href: '/superadmin/leads',
    icon: Users,
  },
  {
    label: 'Settings',
    href: '/superadmin/settings',
    icon: Settings,
  },
]

export function SuperAdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/superadmin/login')
  }

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const Icon = item.icon
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    const button = (
      <Link key={item.href} href={item.href} prefetch={true}>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start transition-colors',
            collapsed && 'justify-center px-2',
            isActive &&
              'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary font-medium'
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', !collapsed && 'mr-3')} />
          {!collapsed && <span>{item.label}</span>}
        </Button>
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
          'flex h-screen flex-col border-r bg-card transition-all duration-200',
          collapsed ? 'w-[60px]' : 'w-60'
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <Shield className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold tracking-tight">WebNegosyo</span>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 p-2">
          {sidebarItems.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
        </nav>

        <Separator />

        {/* Footer */}
        <div className="space-y-1 p-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed(false)}
                  className="w-full"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(true)}
              className="w-full justify-start text-xs text-muted-foreground"
            >
              <ChevronLeft className="mr-2 h-3 w-3" />
              Collapse
            </Button>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full text-destructive hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-destructive hover:text-destructive"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="mr-2 h-3 w-3" />
              {isLoggingOut ? 'Signing out...' : 'Logout'}
            </Button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
