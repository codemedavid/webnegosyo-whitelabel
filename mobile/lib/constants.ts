import Constants from 'expo-constants'

export const TENANT_SLUG = Constants.expoConfig?.extra?.tenantSlug as string || process.env.EXPO_PUBLIC_TENANT_SLUG || 'demo'
export const TENANT_ID = Constants.expoConfig?.extra?.tenantId as string || ''
export const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string || process.env.EXPO_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey as string || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
export const GOOGLE_SCRIPT_URL = Constants.expoConfig?.extra?.googleScriptUrl as string || ''
