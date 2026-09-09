import { useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { useAuthStore } from "../stores/auth-store";
import { isLoyaltySmsDeliveryEnabled } from "../lib/loyalty/sms-delivery-flag";
import { createDeliveryWorker, deviceCredentialStore } from "../lib/loyalty/sms-delivery-runtime";
import { nextPollDelayMs, shouldRunLoyaltySmsDelivery } from "../lib/loyalty/sms-delivery-mount";
import type { DeviceEnrollment } from "../lib/loyalty/device-credential-store";
import { useDeviceEnrollment } from "../lib/loyalty/use-device-enrollment";

/**
 * Foreground OTP delivery for an enrolled Android handset.
 *
 * Mounted app-wide like the auto-print watchers so a queued code leaves while
 * the merchant is on any tab. The pure gate in `sms-delivery-mount.ts` decides
 * whether to run; the worker decides what one poll does; the server decides
 * whether this device may do it at all. A 403 from a delivery route means the
 * owner revoked this phone: the stored credential is dropped and polling stops.
 */
export function GlobalLoyaltySmsDelivery() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const loyaltyEnabled = useAuthStore((s) => s.loyaltyEnabled);
  const isDemo = useAuthStore((s) => s.isDemo);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const enrollment = useDeviceEnrollment(tenantId, userId, Platform.OS === "android" && isLoyaltySmsDeliveryEnabled(), appState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const isArmed =
    !!tenantId &&
    !!userId &&
    shouldRunLoyaltySmsDelivery({
      platform: Platform.OS,
      releaseEnabled: isLoyaltySmsDeliveryEnabled(),
      loyaltyEnabled,
      isDemo,
      isImpersonating: impersonatedTenantId !== null,
      hasEnrollment: enrollment !== null,
      appState,
    });

  if (!isArmed || !enrollment) return null;
  return (
    <DeliveryLoop tenantId={tenantId} actorId={userId} enrollment={enrollment} />
  );
}

interface DeliveryLoopProps {
  tenantId: string;
  actorId: string;
  enrollment: DeviceEnrollment;
}

function DeliveryLoop({ tenantId, actorId, enrollment }: DeliveryLoopProps) {
  const { deviceId, credential } = enrollment;

  useEffect(() => {
    let active = true;
    const scope = { tenantId, actorId };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revoked = () => {
      active = false;
      clearTimeout(timer);
      void deviceCredentialStore(scope)
        .clearIfMatches({ deviceId, credential })
        .catch(() => undefined);
    };
    const canSend = () => {
      const state = useAuthStore.getState();
      return active && state.tenantId === tenantId && state.userId === actorId &&
        shouldRunLoyaltySmsDelivery({
          platform: Platform.OS, releaseEnabled: isLoyaltySmsDeliveryEnabled(),
          loyaltyEnabled: state.loyaltyEnabled, isDemo: state.isDemo,
          isImpersonating: state.impersonatedTenantId !== null,
          hasEnrollment: true, appState: AppState.currentState,
        });
    };
    const worker = createDeliveryWorker(scope, { deviceId, credential }, canSend, revoked);
    const tick = async () => {
      if (!active) return;
      const result = await worker.runOnce();
      if (active) timer = setTimeout(() => void tick(), nextPollDelayMs(result));
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tenantId, actorId, deviceId, credential]);

  return null;
}
