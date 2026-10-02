'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  hasPlatformPermission,
  type PlatformPermission,
} from '@/lib/platform-staff/permissions'

/**
 * The signed-in console account's grants, for hiding what it cannot do.
 *
 * Presentation only: every action re-checks on the server and the database
 * enforces the store verbs. A missing provider reads as "no access" so a page
 * rendered outside the console shell never shows controls by accident.
 */

export interface PlatformAccess {
  role: string | null
  isSuperadmin: boolean
  can: (permission: PlatformPermission) => boolean
}

const NO_ACCESS: PlatformAccess = { role: null, isSuperadmin: false, can: () => false }

const PlatformAccessContext = createContext<PlatformAccess>(NO_ACCESS)

interface PlatformAccessProviderProps {
  role: string | null
  permissions: string[] | null
  children: ReactNode
}

export function PlatformAccessProvider({ role, permissions, children }: PlatformAccessProviderProps) {
  const value = useMemo<PlatformAccess>(() => {
    if (!role) return NO_ACCESS
    const holder = { role, platform_permissions: permissions }
    return {
      role,
      isSuperadmin: role === 'superadmin',
      can: (permission) => hasPlatformPermission(holder, permission),
    }
  }, [role, permissions])

  return <PlatformAccessContext.Provider value={value}>{children}</PlatformAccessContext.Provider>
}

export function usePlatformAccess(): PlatformAccess {
  return useContext(PlatformAccessContext)
}
