import { useAuthStore } from "../stores/auth-store";
import { hasPermission, type StaffPermissionKey } from "./staff-permissions";

/**
 * Whether the signed-in account holds `key` (outright, through a containing
 * grant, or as an owner / full-access admin). For a screen that shows or hides
 * a part of itself; tab-level gates go through lib/tab-visibility.ts.
 */
export function useHasPermission(key: StaffPermissionKey): boolean {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  return hasPermission({ role, isOwner, permissions }, key);
}
