import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/constants'
import type { Database } from '@/types/database'
import { Platform } from 'react-native'

let _instance: ReturnType<typeof createClient<Database>> | undefined

export function supabase() {
  if (!_instance) {
    _instance = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: Platform.OS !== 'web',
        detectSessionInUrl: false,
      },
    })
  }
  return _instance
}
