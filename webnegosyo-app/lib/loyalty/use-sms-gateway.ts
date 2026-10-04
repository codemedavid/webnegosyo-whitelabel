import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { smsGatewayNative } from "./sms-delivery-runtime";

export interface SmsGatewayView {
  /** The installed APK ships the gateway service. */
  hasNative: boolean;
  isEnabled: boolean;
  isRunning: boolean;
  /** Android may still throttle the service; null until read. */
  isBatteryUnrestricted: boolean | null;
  refresh(): Promise<void>;
}

/**
 * The gateway switch as the native side reports it. Re-read on app focus: the
 * service can stop on its own (sign-out, revocation) while the app is away.
 */
export function useSmsGateway(isShown: boolean): SmsGatewayView {
  const native = isShown ? smsGatewayNative() : null;
  const [state, setState] = useState({ isEnabled: false, isRunning: false, isBatteryUnrestricted: null as boolean | null });

  const refresh = useCallback(async () => {
    if (!native) return;
    try {
      const [gateway, battery] = await Promise.all([
        native.getSmsGatewayState(),
        native.isIgnoringBatteryOptimizations(),
      ]);
      setState({ isEnabled: gateway.enabled, isRunning: gateway.running, isBatteryUnrestricted: battery });
    } catch {
      // Keep the last known state; the card stays usable.
    }
  }, [native]);

  useEffect(() => {
    if (!native) return;
    void refresh();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => subscription.remove();
  }, [native, refresh]);

  return { hasNative: native !== null, ...state, refresh };
}
