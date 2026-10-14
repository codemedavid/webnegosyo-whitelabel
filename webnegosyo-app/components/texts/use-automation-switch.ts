import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { automationsApi, type Automation, type AutomationsView } from "../../lib/sms-automations/api";
import { draftFromAutomation, toApiDraft } from "../../lib/sms-automations/editor";
import { blockerFor, type Blocker, type SheetMode } from "../../lib/sms-automations/view";
import type { SheetTarget } from "./TurnOnSheet";

interface OpenSheet {
  target: SheetTarget;
  mode: SheetMode;
  /** Decided when the sheet opens, so a refetch behind it cannot re-trigger the preview. */
  blocker: Blocker | null;
}

interface SwitchOptions {
  tenantId: string | null;
  view: AutomationsView | undefined;
  /** After any accepted write: refresh the list. */
  onChanged: () => void;
  /** The blocker's one-tap fix: open the Rules tab or Rewards. */
  onFix: (blocker: Blocker) => void;
}

/** Read-only demo stores answer every write with the same notice. */
export function isBlockedByDemo(): boolean {
  if (!useAuthStore.getState().isDemo) return false;
  Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
  return true;
}

export function sheetTargetOf(automation: Automation): SheetTarget {
  return {
    automationId: automation.id,
    name: automation.name,
    draft: toApiDraft(draftFromAutomation(automation)),
    runMode: automation.runMode,
  };
}

/**
 * Turning an automation on, off, or running it now — the same flow from the
 * hub's switches and from the editor. On asks first (TurnOnSheet); off
 * confirms that waiting texts are withdrawn; a blocked recipe never reaches
 * the API.
 */
export function useAutomationSwitch({ tenantId, view, onChanged, onFix }: SwitchOptions) {
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = useCallback(
    (target: SheetTarget, mode: SheetMode, recipe: Automation["recipe"]) => {
      if (!view || isBlockedByDemo()) return;
      setSheet({ target, mode, blocker: blockerFor(recipe, view) });
    },
    [view],
  );

  const turnOn = useCallback((automation: Automation) => open(sheetTargetOf(automation), "turn_on", automation.recipe), [open]);
  const runNow = useCallback((automation: Automation) => open(sheetTargetOf(automation), "run_now", automation.recipe), [open]);

  const turnOff = useCallback(
    (automation: Automation) => {
      if (!tenantId || isBlockedByDemo()) return;
      const stop = async () => {
        setBusyId(automation.id);
        const result = await automationsApi.setStatus(tenantId, automation.id, "off");
        setBusyId(null);
        if (!result.ok) {
          Alert.alert("Couldn’t turn it off", result.error);
          return;
        }
        onChanged();
      };
      Alert.alert("Stop sending?", "Texts still waiting are withdrawn.", [
        { text: "Keep it on", style: "cancel" },
        { text: "Turn off", style: "destructive", onPress: () => void stop() },
      ]);
    },
    [tenantId, onChanged],
  );

  const close = useCallback(() => setSheet(null), []);
  const fix = useCallback(
    (blocker: Blocker) => {
      setSheet(null);
      onFix(blocker);
    },
    [onFix],
  );

  return {
    turnOn,
    turnOff,
    runNow,
    open,
    busyId,
    sheetProps: {
      tenantId,
      target: sheet?.target ?? null,
      mode: sheet?.mode ?? ("turn_on" as SheetMode),
      blocker: sheet?.blocker ?? null,
      onFix: fix,
      onClose: close,
      onChanged,
    },
  };
}
