import { create } from "zustand";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  convexUrl: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True when the user entered via "Explore Demo" on the login screen instead
   * of signing in. Demo sessions are read-only: screens block mutations so a
   * guest (e.g. an App Store reviewer) can browse a fully-populated store
   * without an account and without altering real merchant data.
   */
  isDemo: boolean;
  setAuth: (data: Partial<AuthState>) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  convexUrl: null,
  isLoading: true,
  isAuthenticated: false,
  isDemo: false,
  setAuth: (data) => set(data),
  clear: () =>
    set({
      userId: null,
      tenantId: null,
      tenantSlug: null,
      tenantName: null,
      convexUrl: null,
      isLoading: false,
      isAuthenticated: false,
      isDemo: false,
    }),
}));
