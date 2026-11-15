/**
 * A chat order never outlives the store it was started in.
 *
 * "Make order" puts a store's Messenger chat on the register. Signing out, or
 * a superadmin moving to another store, must drop it: otherwise the next
 * store's register shows "Ordering for Ana C.", forces pay-later and names a
 * chat that store does not have. The server refuses a chat of another store
 * anyway; this keeps the register honest before it gets that far.
 *
 * Mounted once in `QueryProvider`, beside the cache scope, which watches the
 * same tenant.
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "../../stores/auth-store";
import { usePosCartStore } from "../../stores/pos-cart-store";

/** Whether the tenant in scope moved (first sight of a tenant is not a move). */
export function hasTenantScopeChanged(previous: string | null | undefined, current: string | null): boolean {
  return previous !== undefined && previous !== current;
}

export function useRegisterChatScope(): void {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (hasTenantScopeChanged(previous.current, tenantId) && usePosCartStore.getState().chat !== null) {
      usePosCartStore.getState().setChat(null);
    }
    previous.current = tenantId;
  }, [tenantId]);
}
