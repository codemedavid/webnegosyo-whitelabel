// The expo-updates shell. Every decision lives in `ota-rules.ts`; this file
// only talks to the native module and refuses to throw at the UI.
//
// The app is already configured for OTA (`updates.url` + an "appVersion"
// runtime policy in app.config.ts), so published JS reaches installs on their
// own at the next launch. What was missing is the merchant being told — and
// being able to take it NOW instead of a launch later, which is the whole
// point of the prompt.

import * as Updates from "expo-updates";
import {
  otaStatusFromCheck,
  shouldCheckOta,
  shouldReloadAfterFetch,
  type OtaCheckResult,
  type OtaFetchResult,
} from "./ota-rules";
import type { OtaStatus } from "./gate";

const NONE: OtaStatus = { isAvailable: false, updateId: null };

/**
 * Whether a JS update is waiting for this binary. Never throws: a merchant
 * offline or behind a captive portal simply has no update to take, and the
 * store half of the gate still works.
 */
export async function checkForOtaUpdate(): Promise<OtaStatus> {
  if (!shouldCheckOta({ isEnabled: Updates.isEnabled, isDev: __DEV__ })) return NONE;
  try {
    const result = (await Updates.checkForUpdateAsync()) as OtaCheckResult;
    return otaStatusFromCheck(result);
  } catch {
    return NONE;
  }
}

export type OtaApplyResult =
  | { status: "reloading" }
  | { status: "nothing-new" }
  | { status: "failed"; message: string };

/**
 * Downloads the waiting update and restarts into it. On success the process
 * reloads, so nothing after `reloadAsync` runs — the "reloading" result is
 * returned only for the paths where the reload itself is refused.
 */
export async function applyOtaUpdate(): Promise<OtaApplyResult> {
  try {
    const fetched = (await Updates.fetchUpdateAsync()) as OtaFetchResult;
    if (!shouldReloadAfterFetch(fetched)) return { status: "nothing-new" };
    await Updates.reloadAsync();
    return { status: "reloading" };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "The update could not be installed.",
    };
  }
}
