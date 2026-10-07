/**
 * "Is this store ready to open?" — the launch checklist.
 *
 * Only three things truly block a launch: without a menu, a way to pay or a
 * way to order, a customer cannot finish a checkout. Everything else is a
 * nudge that raises the score; a merchant is never held back by a missing
 * Facebook page.
 */

export interface LaunchSnapshot {
  menuItemCount: number
  paymentMethodCount: number
  enabledOrderTypeCount: number
  hasLogo: boolean
  hasMessenger: boolean
  hasHours: boolean
  isLoyaltyLive: boolean
  boostOfferCount: number
}

export interface ReadinessItem {
  id: 'menu' | 'payments' | 'order_types' | 'logo' | 'hours' | 'messenger' | 'boost' | 'loyalty'
  label: string
  hint: string
  isDone: boolean
  isBlocker: boolean
  /** Path under `/<slug>/admin`. */
  adminPath: string
}

export interface LaunchReadiness {
  items: ReadinessItem[]
  blockers: ReadinessItem[]
  canLaunch: boolean
  /** 0–100, share of checklist items done. */
  score: number
}

export function buildLaunchReadiness(snapshot: LaunchSnapshot): LaunchReadiness {
  const items: ReadinessItem[] = [
    {
      id: 'menu', isBlocker: true, adminPath: '/menu', isDone: snapshot.menuItemCount > 0,
      label: snapshot.menuItemCount > 0 ? `${snapshot.menuItemCount} items on your menu` : 'Add your menu',
      hint: 'Check names and prices — fix anything the photo reading got wrong.',
    },
    {
      id: 'payments', isBlocker: true, adminPath: '/payment-methods', isDone: snapshot.paymentMethodCount > 0,
      label: 'Ways to pay', hint: 'GCash, Maya or cash — customers pick one at checkout.',
    },
    {
      id: 'order_types', isBlocker: true, adminPath: '/order-types', isDone: snapshot.enabledOrderTypeCount > 0,
      label: 'Pickup, delivery or dine-in', hint: 'Turn on at least one way to order.',
    },
    {
      id: 'logo', isBlocker: false, adminPath: '/branding', isDone: snapshot.hasLogo,
      label: 'Logo and colors', hint: 'Your store colors come from your logo.',
    },
    {
      id: 'hours', isBlocker: false, adminPath: '/settings/hours', isDone: snapshot.hasHours,
      label: 'Opening hours', hint: 'Orders pause automatically while you are closed.',
    },
    {
      id: 'messenger', isBlocker: false, adminPath: '/settings/messenger', isDone: snapshot.hasMessenger,
      label: 'Connect your Facebook page', hint: 'Orders also arrive in your Messenger inbox.',
    },
    {
      id: 'boost', isBlocker: false, adminPath: '/boost-sales', isDone: snapshot.boostOfferCount > 0,
      label: snapshot.boostOfferCount > 0 ? `${snapshot.boostOfferCount} combos and upsells live` : 'Combos and upsells',
      hint: 'Bigger orders from the same customers.',
    },
    {
      id: 'loyalty', isBlocker: false, adminPath: '/loyalty', isDone: snapshot.isLoyaltyLive,
      label: 'Loyalty stamp card', hint: 'Brings first-timers back for a second order.',
    },
  ]

  const blockers = items.filter((item) => item.isBlocker && !item.isDone)
  const score = Math.round((items.filter((item) => item.isDone).length / items.length) * 100)
  return { items, blockers, canLaunch: blockers.length === 0, score }
}
