import {
  Clock,
  CreditCard,
  KeyRound,
  LayoutTemplate,
  MapPin,
  MessageCircle,
  PanelBottom,
  Paintbrush,
  QrCode,
  ReceiptText,
  ShoppingBag,
  Smartphone,
  Store,
  Trash2,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { SettingsIconKey } from '@/lib/settings/settings-catalog'

const ICONS: Record<SettingsIconKey, LucideIcon> = {
  store: Store,
  clock: Clock,
  'map-pin': MapPin,
  'shopping-bag': ShoppingBag,
  'credit-card': CreditCard,
  truck: Truck,
  receipt: ReceiptText,
  'qr-code': QrCode,
  message: MessageCircle,
  key: KeyRound,
  paintbrush: Paintbrush,
  layout: LayoutTemplate,
  'panel-bottom': PanelBottom,
  smartphone: Smartphone,
  users: Users,
  user: UserRound,
  trash: Trash2,
}

interface SettingsIconProps {
  name: SettingsIconKey
  className?: string
}

export function SettingsIcon({ name, className }: SettingsIconProps) {
  const Icon = ICONS[name]
  return <Icon className={className} aria-hidden />
}
