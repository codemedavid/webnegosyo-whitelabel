import {
  ArrowLeft, BadgePercent, BellRing, CalendarClock, ChefHat, CircleCheck, ListChecks, MessageCircle, MessageSquare,
  MousePointerClick, QrCode, ReceiptText, ShoppingBag, Stamp, Store, TicketPercent, User, Utensils, Wallet, Puzzle,
  type LucideIcon,
} from 'lucide-react'

/** Add-panel icons for the page-block registries (`PageBlockDef.icon`). Unknown names show a puzzle piece. */
export const PAGE_BLOCK_ICONS: Readonly<Record<string, LucideIcon>> = {
  ArrowLeft, BadgePercent, BellRing, CalendarClock, ChefHat, CircleCheck, ListChecks, MessageCircle, MessageSquare,
  MousePointerClick, QrCode, ReceiptText, ShoppingBag, Stamp, Store, TicketPercent, User, Utensils, Wallet,
}

export function pageBlockIcon(name: string): LucideIcon {
  return Object.prototype.hasOwnProperty.call(PAGE_BLOCK_ICONS, name) ? PAGE_BLOCK_ICONS[name] : Puzzle
}
