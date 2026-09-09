/**
 * The app's one realtime hub, bound to the real Supabase client.
 *
 * Kept apart from `realtime-hub.ts` so the factory stays importable under
 * node (the logic test project cannot load the Expo-backed client).
 */

import { supabase } from "../supabase";
import { createRealtimeHub, type RealtimeClientLike } from "./realtime-hub";

export const realtimeHub = createRealtimeHub(supabase as unknown as RealtimeClientLike);
