import { createClient, processLock } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState } from "react-native";
import { bindAutoRefreshToAppState } from "./supabase-auth-refresh";

export const supabaseUrl: string = Constants.expoConfig?.extra?.supabaseUrl ?? "";
export const supabaseAnonKey: string =
  Constants.expoConfig?.extra?.supabaseAnonKey ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // React Native has no `navigator.locks`, so GoTrue would otherwise fall
    // back to a no-op lock and let two concurrent refreshes race for the stored
    // session. `processLock` serialises them within this process, which is the
    // only scope a phone has.
    lock: processLock,
  },
});

// Refresh tokens only while the app is in front of the user. A refresh that
// fires after the OS has suspended the network never completes, and GoTrue
// makes every later `getSession()` queue behind it — which is how one
// backgrounded register ends up unable to close a second sale until it is
// force-quit. See lib/supabase-auth-refresh.ts.
bindAutoRefreshToAppState(AppState, supabase.auth, AppState.currentState);
