// Composes the update gate: read the platform's release policy, ask
// expo-updates whether JS is waiting, and decide what to say.
//
// Runs once per signed-in session. It deliberately does NOT poll — a merchant
// mid-service should not have a dialog appear over the register — so a newly
// published release reaches them at their next app open, which is the same
// cadence expo-updates itself uses.

import { useCallback, useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import { useAuthStore } from "../../stores/auth-store";
import { decideUpdatePrompt, shouldCheckForUpdates, type UpdatePrompt } from "./gate";
import { readDismissedSignature, writeDismissedSignature } from "./dismissal";
import { applyOtaUpdate, checkForOtaUpdate } from "./ota";
import { fetchAppRelease } from "./service";

/** The running binary's version, or null when the manifest has none. */
export function currentAppVersion(): string | null {
  const version = Constants.expoConfig?.version;
  return typeof version === "string" && version !== "" ? version : null;
}

export interface AppUpdateState {
  prompt: UpdatePrompt;
  /** True while the OTA bundle is downloading. */
  isApplying: boolean;
  /** Set when an OTA install failed; the store link stays available. */
  error: string | null;
  applyOta: () => Promise<void>;
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemo = useAuthStore((s) => s.isDemo);

  const [prompt, setPrompt] = useState<UpdatePrompt>({ kind: "none" });
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChecked = useRef(false);

  const isEligible = shouldCheckForUpdates({ isAuthenticated, isDemo });

  useEffect(() => {
    if (!isEligible || hasChecked.current) return;
    hasChecked.current = true;

    let cancelled = false;
    // Both reads already swallow their own failures and resolve to "nothing
    // to offer", so the gate stays silent rather than guessing.
    Promise.all([fetchAppRelease(), checkForOtaUpdate(), readDismissedSignature()])
      .then(([release, ota, dismissedSignature]) => {
        if (cancelled) return;
        setPrompt(
          decideUpdatePrompt({
            currentVersion: currentAppVersion(),
            release,
            ota,
            dismissedSignature,
          })
        );
      })
      .catch(() => {
        // Nothing to say. Never a reason to interrupt a merchant.
      });

    return () => {
      cancelled = true;
    };
  }, [isEligible]);

  // A sign-out re-arms the check, so the next merchant on a shared device is
  // gated on their own session rather than inheriting this one's answer.
  useEffect(() => {
    if (isAuthenticated) return;
    hasChecked.current = false;
    setPrompt({ kind: "none" });
    setError(null);
  }, [isAuthenticated]);

  const applyOta = useCallback(async () => {
    setIsApplying(true);
    setError(null);
    const result = await applyOtaUpdate();
    if (result.status === "reloading") return; // The process is restarting.
    setIsApplying(false);
    if (result.status === "failed") {
      setError(result.message);
      return;
    }
    // Nothing new after all — say so by closing rather than leaving a button
    // that does nothing.
    setPrompt({ kind: "none" });
  }, []);

  const dismiss = useCallback(() => {
    setPrompt((current) => {
      if (current.kind === "none") return current;
      if (current.isBlocking) return current;
      void writeDismissedSignature(current.signature);
      return { kind: "none" };
    });
  }, []);

  return { prompt, isApplying, error, applyOta, dismiss };
}
