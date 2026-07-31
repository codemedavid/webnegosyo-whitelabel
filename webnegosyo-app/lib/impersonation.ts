// Superadmin tenant impersonation ("open as merchant").
//
// Every merchant screen resolves the store it is looking at from the auth
// store's tenant fields alone — tenantId, tenantSlug, convexUrl. So switching
// those fields IS the impersonation: the entire merchant surface (orders, POS,
// analytics, products, printing) then runs against the chosen tenant with no
// per-screen changes. Postgres RLS already grants a superadmin cross-tenant
// read/write, so the swap needs no server cooperation either.
//
// These are pure state transitions returning patches for
// `useAuthStore.setAuth`; nothing here touches the store directly, which keeps
// the round-trip invariant testable.

import { resolveOrderBackend, type OrderBackend } from "./order-backend";
import type { TenantRow } from "./session-resolve";

/** The slice of auth state impersonation reads and rewrites. */
export interface ImpersonationState {
  userId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  convexUrl: string | null;
  /** Which database serves the viewed tenant's orders; null off a tenant. */
  orderBackend: OrderBackend | null;
  isSuperadmin: boolean;
  isOwner: boolean;
  permissions: string[] | null;
  role: string | null;
  /** Set while a superadmin is viewing a tenant; null on the platform surface. */
  impersonatedTenantId: string | null;
}

/**
 * Fields an impersonation transition writes back to the auth store.
 *
 * `convexSchemaVersion` is written but never read here, so it is added to the
 * patch rather than to the state slice above. It must be WRITTEN on every
 * transition: a version left over from the previous tenant would decide which
 * arguments this app sends to a different store's deployment.
 */
export type ImpersonationPatch = { convexSchemaVersion: number | null } & Pick<
  ImpersonationState,
  | "userId"
  | "tenantId"
  | "tenantSlug"
  | "tenantName"
  | "convexUrl"
  | "orderBackend"
  | "isSuperadmin"
  | "isOwner"
  | "permissions"
  | "role"
  | "impersonatedTenantId"
>;

export function canImpersonate(state: ImpersonationState): boolean {
  return state.isSuperadmin === true;
}

/**
 * Enter a tenant's merchant view. Safe to call while already impersonating —
 * switching straight from one tenant to another needs no intermediate exit.
 */
export function enterTenant(
  state: ImpersonationState,
  tenant: TenantRow
): ImpersonationPatch {
  if (!canImpersonate(state)) {
    throw new Error("Only a superadmin can open a tenant's merchant view");
  }

  return {
    userId: state.userId,
    role: state.role,
    // Held so the platform surface stays reachable and the RLS grant survives.
    isSuperadmin: true,
    // A superadmin is never restricted staff — no permission gating applies.
    isOwner: true,
    permissions: null,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    convexUrl: tenant.convex_deployment_url ?? null,
    convexSchemaVersion: tenant.convex_schema_version ?? null,
    orderBackend: resolveOrderBackend(tenant),
    impersonatedTenantId: tenant.id,
  };
}

/**
 * Leave the tenant view and return to the platform surface. Clears every
 * tenant field — a stale tenantId would silently scope the next query.
 */
export function exitTenant(state: ImpersonationState): ImpersonationPatch {
  return {
    userId: state.userId,
    role: state.role,
    isSuperadmin: state.isSuperadmin,
    isOwner: false,
    permissions: null,
    tenantId: null,
    tenantSlug: null,
    tenantName: null,
    convexUrl: null,
    convexSchemaVersion: null,
    orderBackend: null,
    impersonatedTenantId: null,
  };
}

/**
 * Whether the session is a superadmin currently inside a tenant. False for an
 * ordinary merchant admin, who owns their tenant rather than borrowing it.
 */
export function isImpersonating(state: ImpersonationState): boolean {
  return state.isSuperadmin === true && state.impersonatedTenantId !== null;
}

/** Tenant label for the impersonation banner; null when not impersonating. */
export function impersonatedTenantName(
  state: ImpersonationState
): string | null {
  if (!isImpersonating(state)) return null;
  return state.tenantName || state.tenantSlug;
}
