import {
  Award, Bike, Cake, Calendar, Camera, Car, Check, CheckCircle2, ChefHat, ChevronRight, Clock, Coffee,
  Cookie, CreditCard, Croissant, Crown, Facebook, Fish, Flame, Gift, Globe, Heart, IceCream, Instagram,
  Leaf, Mail, MapPin, MessageCircle, Moon, Music, Package, PartyPopper, Percent, Phone, Pizza, Salad,
  Sandwich, ShieldCheck, ShoppingBag, ShoppingCart, Smile, Soup, Sparkles, Star, Store, Sun, Tag, ThumbsUp,
  Timer, Trophy, Truck, Users, Utensils, UtensilsCrossed, Wallet, Wheat, Wine, Zap, ArrowRight, Beef,
  Beer, CupSoda, Egg, Martini, Popcorn, Sprout, Youtube, Twitter,
  type LucideIcon,
} from 'lucide-react'

/** Icons a design may use. Unknown names render the Star fallback. */
export const HERO_ICONS: Record<string, LucideIcon> = {
  Star, Heart, Check, CheckCircle2, Sparkles, Flame, Zap, Award, Trophy, Crown, ThumbsUp, Smile,
  Utensils, UtensilsCrossed, ChefHat, Coffee, Pizza, Soup, Salad, Sandwich, Croissant, Cake, Cookie,
  IceCream, Fish, Beef, Egg, Wheat, Leaf, Sprout, Wine, Beer, Martini, CupSoda, Popcorn,
  Clock, Timer, Calendar, MapPin, Phone, Mail, MessageCircle, Globe, Store,
  Truck, Bike, Car, Package, ShoppingBag, ShoppingCart, CreditCard, Wallet, Tag, Percent, Gift, PartyPopper,
  ShieldCheck, Users, Camera, Music, Sun, Moon, ArrowRight, ChevronRight,
  Facebook, Instagram, Youtube, Twitter,
}

export const HERO_ICON_NAMES: readonly string[] = Object.keys(HERO_ICONS)

interface HeroIconProps {
  name: string | undefined
  className?: string
}

export function HeroIcon({ name, className }: HeroIconProps) {
  // Own keys only: a design-supplied name like `constructor` must never
  // resolve to an Object.prototype member (it would crash the storefront).
  const Icon = (name && Object.prototype.hasOwnProperty.call(HERO_ICONS, name) && HERO_ICONS[name]) || Star
  return <Icon aria-hidden="true" className={className} />
}
