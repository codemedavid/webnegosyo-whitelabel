'use client'

import type { ComponentType } from 'react'
import dynamic from 'next/dynamic'
import type { StorefrontPackId } from '@/lib/storefront-packs'
import { LegacyMenuStorefront } from './legacy/menu-storefront'

/**
 * The pages a storefront pack draws. Each renders inside StorefrontRuntime and
 * reads the menu controller and branding from `useStorefrontRuntime()`.
 */
export interface StorefrontPackPages {
  menu: ComponentType
  /** The tenant home page. A pack without one shows its menu at `/`. */
  home?: ComponentType
}

// Typed against the pack id union: a pack registered in
// src/lib/storefront-packs.ts without pages here is a compile error.
// Legacy is imported statically — it is what nearly every tenant renders.
// New packs should load with next/dynamic so legacy tenants never download them.
const BiteSpeedHome = dynamic(() => import('./bitespeed/home').then((m) => ({ default: m.BiteSpeedHome })))
const BiteSpeedMenu = dynamic(() => import('./bitespeed/menu').then((m) => ({ default: m.BiteSpeedMenu })))

export const STOREFRONT_PACK_PAGES = {
  legacy: { menu: LegacyMenuStorefront },
  bitespeed: { home: BiteSpeedHome, menu: BiteSpeedMenu },
} satisfies Record<StorefrontPackId, StorefrontPackPages>
