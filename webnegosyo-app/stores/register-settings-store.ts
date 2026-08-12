/**
 * Per-device register settings.
 *
 * Deliberately device-local rather than a tenant column: whether this till
 * counts online orders in its drawer depends on whether this till is the one
 * taking that money, and a store with a counter tablet and a kitchen tablet
 * needs different answers on each.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Storage note: a boolean preference, no PII and no secrets, so AsyncStorage
 * is appropriate — the same reasoning as the printer config.
 */
const DRAWER_ONLINE_KEY = "drawer_includes_online";

interface RegisterSettingsState {
  /**
   * Count Smart Menu orders this register confirmed toward the drawer.
   * Off by default: a store that confirms online orders on the web dashboard
   * would otherwise see money in its till report that never reached the till.
   */
  drawerIncludesOnlineOrders: boolean;
  setDrawerIncludesOnlineOrders: (value: boolean) => Promise<void>;
  loadSaved: () => Promise<void>;
}

export const useRegisterSettingsStore = create<RegisterSettingsState>((set) => ({
  drawerIncludesOnlineOrders: false,

  setDrawerIncludesOnlineOrders: async (drawerIncludesOnlineOrders) => {
    // Set first, persist second: a failed write must not leave the cashier
    // looking at a toggle that snapped back for no visible reason.
    set({ drawerIncludesOnlineOrders });
    try {
      await AsyncStorage.setItem(DRAWER_ONLINE_KEY, JSON.stringify(drawerIncludesOnlineOrders));
    } catch (err) {
      console.warn("[RegisterSettings] Failed to persist drawer setting:", err);
    }
  },

  loadSaved: async () => {
    try {
      const saved = await AsyncStorage.getItem(DRAWER_ONLINE_KEY);
      if (saved !== null) {
        set({ drawerIncludesOnlineOrders: JSON.parse(saved) === true });
      }
    } catch {
      // Corrupt storage keeps the safe default rather than guessing.
    }
  },
}));
