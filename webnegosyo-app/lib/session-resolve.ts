// Post-authentication session resolution. Both the cold-start path
// (app/_layout.tsx) and the interactive sign-in (app/(auth)/login.tsx) read the
// same two rows from Supabase — app_users and tenants — and must agree on what
// they mean. This module owns that decision so the two callers cannot drift.
//
// The platform superadmin is the reason this exists: their app_users row has
// tenant_id = NULL, so a tenant lookup returns nothing. Treating that as a
// failure (the previous behaviour) locked the superadmin out of the app
// entirely. Here it resolves to its own session mode instead.

import { resolveOrderBackend, type OrderBackend } from "./order-backend";

/** Where each session mode lands after sign-in. */
export const MERCHANT_LANDING_HREF = "/(main)/dashboard";
export const SUPERADMIN_LANDING_HREF = "/(superadmin)/tenants";

const DENIED_NOT_ADMIN = "You do not have admin access";
const DENIED_NO_TENANT = "Tenant not found";

/** Shape of the `app_users` row the app selects. */
export interface AppUserRow {
  tenant_id: string | null;
  role: string | null;
  is_owner: boolean | null;
  permissions: string[] | null;
  /** Branch this account is confined to. NULL = the whole store. */
  outlet_id?: string | null;
}

/** Shape of the `outlets` row the app selects for a branch-scoped account. */
export interface OutletRow {
  id: string;
  name: string;
}

/** Shape of the `tenants` row the app selects. */
export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  convex_deployment_url: string | null;
  order_backend?: OrderBackend | null;
}

export type SessionMode = "superadmin" | "merchant" | "denied";

/** Fields handed straight to `useAuthStore.setAuth`. */
export interface SessionAuthPatch {
  userId: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  convexUrl: string | null;
  /**
   * Which database serves this tenant's orders. Screens dispatch on it to pick
   * the Convex client or the platform-Supabase adapter. Null for a superadmin,
   * who holds no tenant until they impersonate one.
   */
  orderBackend: OrderBackend | null;
  isLoading: false;
  isAuthenticated: true;
  isSuperadmin: boolean;
  isOwner: boolean;
  permissions: string[] | null;
  role: string | null;
  /**
   * Branch this session is confined to; null means the whole store. The order
   * screens filter on it, and the register stamps it onto a counter sale.
   */
  outletId: string | null;
  /**
   * The branch's name at sign-in. Written onto counter sales as a snapshot, so
   * renaming a branch does not rewrite the tickets it already took.
   */
  outletName: string | null;
}

export interface SessionResult {
  mode: SessionMode;
  /** User-facing denial message; only set when mode is "denied". */
  reason?: string;
  /** Only set when the session is granted. */
  auth?: SessionAuthPatch;
  /** Only set when the session is granted. */
  landingHref?: string;
}

function isSuperadminRow(appUser: AppUserRow): boolean {
  return appUser.role === "superadmin";
}

/**
 * Whether the caller still needs to fetch the tenant row. False for a
 * superadmin, whose tenant_id is NULL — skipping the query avoids a guaranteed
 * miss that would otherwise read as a denial.
 */
export function needsTenantLookup(appUser: AppUserRow): boolean {
  return !isSuperadminRow(appUser);
}

/**
 * Whether the caller still needs to fetch the branch row.
 *
 * Only a branch-confined account has one. An owner or a superadmin is never
 * confined, so asking would be a guaranteed miss.
 */
export function needsOutletLookup(appUser: AppUserRow): boolean {
  if (isSuperadminRow(appUser) || appUser.is_owner) return false;
  return typeof appUser.outlet_id === "string" && appUser.outlet_id.trim() !== "";
}

/**
 * The branch this account is confined to, read from the account row itself.
 *
 * Mirrors `needsOutletLookup`: an owner or superadmin is never confined, and a
 * blank id means the whole store.
 */
function confinedOutletId(appUser: AppUserRow): string | null {
  if (!needsOutletLookup(appUser)) return null;
  return (appUser.outlet_id as string).trim();
}

export function resolveSession(
  userId: string,
  appUser: AppUserRow | null,
  tenant: TenantRow | null,
  outlet?: OutletRow | null
): SessionResult {
  if (!appUser) return { mode: "denied", reason: DENIED_NOT_ADMIN };

  if (isSuperadminRow(appUser)) {
    return {
      mode: "superadmin",
      landingHref: SUPERADMIN_LANDING_HREF,
      auth: {
        userId,
        // A superadmin holds no tenant of their own. Impersonation fills these
        // in later; see lib/impersonation.ts.
        tenantId: null,
        tenantSlug: null,
        tenantName: null,
        convexUrl: null,
        orderBackend: null,
        isLoading: false,
        isAuthenticated: true,
        isSuperadmin: true,
        isOwner: false,
        permissions: null,
        role: appUser.role,
        // A superadmin is never confined to a branch, impersonating or not.
        outletId: null,
        outletName: null,
      },
    };
  }

  if (appUser.role !== "admin") {
    return { mode: "denied", reason: DENIED_NOT_ADMIN };
  }

  if (!tenant) return { mode: "denied", reason: DENIED_NO_TENANT };

  // No billing check here, deliberately. The subscription pause is enforced on
  // the web admin only: an owner deals with money there, while this app is what
  // their staff run a shift on. Locking a register mid-service over an unpaid
  // invoice costs the merchant trade the invoice was never worth.
  return {
    mode: "merchant",
    landingHref: MERCHANT_LANDING_HREF,
    auth: {
      userId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      convexUrl: tenant.convex_deployment_url ?? null,
      orderBackend: resolveOrderBackend(tenant),
      isLoading: false,
      isAuthenticated: true,
      isSuperadmin: false,
      isOwner: appUser.is_owner ?? false,
      permissions: appUser.permissions ?? null,
      role: appUser.role,
      // The account column is the boundary; the outlets row only supplies a
      // label. Taking the scope from the join meant any failed lookup — a
      // cold-start network blip, a deleted branch, a projection that quietly
      // stopped selecting the column — widened a manager to the whole store.
      // Convex tenants have no server-side backstop, so that was the only gate.
      // A missing branch row now costs the *name*, never the confinement.
      outletId: confinedOutletId(appUser),
      outletName: outlet?.name ?? null,
    },
  };
}
