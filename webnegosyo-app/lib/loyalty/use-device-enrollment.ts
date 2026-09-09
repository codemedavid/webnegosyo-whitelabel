import { useEffect, useState } from "react";
import { deviceCredentialStore } from "./sms-delivery-runtime";
import { subscribeDeviceEnrollment, type DeviceEnrollment } from "./device-credential-store";

/** Both the card and foreground worker observe the same durable enrollment. */
export function useDeviceEnrollment(tenantId: string | null, actorId: string | null, enabled: boolean, refresh?: string) {
  const [value, setValue] = useState<{ scope: string; enrollment: DeviceEnrollment | null } | null>(null);
  const scope = tenantId && actorId ? `${tenantId}.${actorId}` : null;
  useEffect(() => {
    if (!enabled || !tenantId || !actorId || !scope) return;
    let current = true;
    let generation = 0;
    const reload = () => {
      const version = ++generation;
      void deviceCredentialStore({ tenantId, actorId }).read().then((enrollment) => {
        if (current && version === generation) setValue({ scope, enrollment });
      });
    };
    const unsubscribe = subscribeDeviceEnrollment({ tenantId, actorId }, reload);
    reload();
    return () => { current = false; unsubscribe(); };
  }, [tenantId, actorId, enabled, scope, refresh]);
  // Never expose the old actor/tenant's credential during an asynchronous read.
  return enabled && value?.scope === scope ? value.enrollment : null;
}
