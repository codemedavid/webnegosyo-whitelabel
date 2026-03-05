import type { BrandingColors } from '@/lib/branding-utils'
import type { Tenant } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MobileTheme extends BrandingColors {
  // Additional mobile-specific theme properties can be added here
}

export interface ThemeContextValue {
  theme: MobileTheme
  tenant: Tenant | null
  isLoading: boolean
}
