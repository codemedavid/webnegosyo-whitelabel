import { create } from "zustand";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  convexUrl: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
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
    }),
}));
