'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { settingsSectionForPath, type SettingsGroup } from '@/lib/settings/settings-catalog'
import { SettingsIcon } from './settings-icon'

interface SettingsShellProps {
  overviewHref: string
  /** Groups holding only the sections this viewer may open (tools are overview-only). */
  railGroups: SettingsGroup[]
  children: React.ReactNode
}

/**
 * The frame around every settings page. The overview IS the navigation, so it
 * renders alone; a section page gets a sticky rail on wide screens for moving
 * between topics without going back. Phones use the breadcrumb instead.
 */
export function SettingsShell({ overviewHref, railGroups, children }: SettingsShellProps) {
  const pathname = usePathname() ?? ''
  const activeSection = settingsSectionForPath(pathname)

  if (activeSection === null) {
    return <>{children}</>
  }

  return (
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      <aside className="hidden lg:block">
        <nav aria-label="Settings" className="sticky top-6 space-y-5 pb-6">
          <RailLink href={overviewHref} isActive={false}>
            <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
            All settings
          </RailLink>
          {railGroups.map((group) => (
            <div key={group.key}>
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.title}</p>
              <ul className="space-y-0.5">
                {group.entries.map((entry) => (
                  <li key={entry.key}>
                    <RailLink href={entry.href} isActive={entry.section === activeSection}>
                      <SettingsIcon name={entry.icon} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{entry.title}</span>
                    </RailLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 max-w-4xl">{children}</div>
    </div>
  )
}

interface RailLinkProps {
  href: string
  isActive: boolean
  children: React.ReactNode
}

function RailLink({ href, isActive, children }: RailLinkProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {children}
    </Link>
  )
}
