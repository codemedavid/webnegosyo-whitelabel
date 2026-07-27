import { create } from "zustand";
import type { OrderBackend } from "../lib/order-backend";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  convexUrl: string | null;
  /**
   * Which database serves this tenant's orders. `lib/hooks.ts` dispatches on it
   * to pick the Convex client or the platform-Supabase adapter.
   */
  orderBackend: OrderBackend | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True when the user entered via "Explore Demo" on the login screen instead
   * of signing in. Demo sessions are read-only: screens block mutations so a
   * guest (e.g. an App Store reviewer) can browse a fully-populated store
   * without an account and without altering real merchant data.
   */
  isDemo: boolean;
  /**
   * Platform superadmin. Their app_users row carries no tenant_id, so they sign
   * in without a tenant attached and land on the (superadmin) surface. Stays
   * true while impersonating a tenant — see lib/impersonation.ts.
   */
  isSuperadmin: boolean;
  /** Tenant a superadmin is currently viewing; null on the platform surface. */
  impersonatedTenantId: string | null;
  /** Tenant owner — full access. Staff accounts are false. */
  isOwner: boolean;
  /** Per-feature permission keys; null = full access (owner/legacy admins). */
  permissions: string[] | null;
  role: string | null;
  setAuth: (data: Partial<AuthState>) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  convexUrl: null,
  orderBackend: null,
  isLoading: true,
  isAuthenticated: false,
  isDemo: false,
  isSuperadmin: false,
  impersonatedTenantId: null,
  isOwner: false,
  permissions: null,
  role: null,
  setAuth: (data) => set(data),
  clear: () =>
    set({
      userId: null,
      tenantId: null,
      tenantSlug: null,
      tenantName: null,
      convexUrl: null,
      orderBackend: null,
      isLoading: false,
      isAuthenticated: false,
      isDemo: false,
      isSuperadmin: false,
      impersonatedTenantId: null,
      isOwner: false,
      permissions: null,
      role: null,
    }),
}));
