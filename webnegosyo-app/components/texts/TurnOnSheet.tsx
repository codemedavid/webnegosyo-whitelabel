import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Modal } from "../Modal";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { colors, radius, spacing, typography } from "../../theme/colors";
import {
  automationsApi,
  type AutomationDraft,
  type AutomationsView,
  type DeliveryOutlook,
  type RunMode,
} from "../../lib/sms-automations/api";
import {
  blockerFix,
  etaAfterQueueing,
  pacingLine,
  sheetChoices,
  sheetDoneText,
  turnOnQuestion,
  type Blocker,
  type SheetChoice,
  type SheetMode,
} from "../../lib/sms-automations/view";

/** What the sheet acts on: a saved automation, previewed as the draft it is. */
export interface SheetTarget {
  automationId: string;
  name: string;
  draft: AutomationDraft;
  runMode: RunMode;
}

interface TurnOnSheetProps {
  tenantId: string | null;
  view: AutomationsView;
  /** null = closed. */
  target: SheetTarget | null;
  mode: SheetMode;
  /** When set, the sheet shows the fix and never calls the API. */
  blocker: Blocker | null;
  onFix: (blocker: Blocker) => void;
  onClose: () => void;
  /** After the server accepted the change; the caller refreshes its list. */
  onChanged: () => void;
}

type Phase =
  | { kind: "checking" }
  | { kind: "ask"; queued: number; outlook: DeliveryOutlook; sample: string | null }
  | { kind: "working"; queued: number; outlook: DeliveryOutlook; sample: string | null; chosen: string }
  | { kind: "done"; text: string }
  | { kind: "unreadable"; error: string };

/**
 * The one confirm sheet for "turn this on" and "run it now".
 *
 * It asks the server who would be texted BEFORE anything is queued, then puts
 * the honest choice in front of the owner: text the guests who already
 * qualify too, or only new ones — with when the last text would go out and the
 * phone's pace. A recipe that cannot run yet shows its one-tap fix instead.
 */
export function TurnOnSheet({ tenantId, view, target, mode, blocker, onFix, onClose, onChanged }: TurnOnSheetProps) {
  const insets = useSafeAreaInsets();
  // Each phase belongs to the target it was read for, so reopening the sheet
  // on another automation never flashes the previous one's answer.
  const [current, setCurrent] = useState<{ target: SheetTarget | null; phase: Phase }>({ target: null, phase: { kind: "checking" } });
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const phase: Phase = current.target === target ? current.phase : { kind: "checking" };

  useEffect(() => {
    if (!target || blocker || !tenantId) return;
    const mine = ++request.current;
    setError(null);
    void automationsApi.preview(tenantId, target.draft).then((result) => {
      if (mine !== request.current) return;
      if (!result.ok) {
        setCurrent({ target, phase: { kind: "unreadable", error: result.error } });
        return;
      }
      const queued = result.value.now?.queued ?? 0;
      setCurrent({ target, phase: { kind: "ask", queued, outlook: result.value.outlook, sample: result.value.sampleText } });
    });
  }, [target, blocker, tenantId]);

  if (!target) return null;

  const close = () => {
    // Once the server is queueing texts, closing would only hide that it did.
    if (phase.kind === "working") return;
    request.current += 1;
    onClose();
  };

  const choose = async (choice: SheetChoice) => {
    if (!tenantId || phase.kind !== "ask") return;
    const asked = phase;
    setCurrent({ target, phase: { ...asked, kind: "working", chosen: choice.label } });
    setError(null);
    const result = mode === "run_now"
      ? await automationsApi.runNow(tenantId, target.automationId)
      : await automationsApi.setStatus(tenantId, target.automationId, "on", choice.sendBacklog);
    if (!result.ok) {
      setError(result.error);
      setCurrent({ target, phase: asked });
      return;
    }
    const backlog = "backlog" in result.value ? result.value.backlog : result.value;
    const sent = backlog?.queued ?? 0;
    const eta = backlog ? etaAfterQueueing(backlog.outlook, view.settings, 0, Date.now()) : "";
    setCurrent({ target, phase: { kind: "done", text: sheetDoneText(mode, sent, eta) } });
    onChanged();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <Text style={styles.kicker} numberOfLines={1}>{target.name}</Text>
          {blocker ? (
            <BlockedBody blocker={blocker} onFix={() => onFix(blocker)} onClose={close} />
          ) : (
            <Body
              phase={phase}
              mode={mode}
              view={view}
              target={target}
              error={error}
              onChoose={(choice) => void choose(choice)}
              onClose={close}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function BlockedBody({ blocker, onFix, onClose }: { blocker: Blocker; onFix: () => void; onClose: () => void }) {
  const fix = blockerFix(blocker);
  return (
    <>
      <Text style={styles.title}>{blocker.text}</Text>
      <Text style={styles.body}>{fix.why}</Text>
      <View style={styles.actions}>
        <Button label={fix.label} onPress={onFix} size="lg" />
        <Button label="Not now" tone="ghost" onPress={onClose} fullWidth />
      </View>
    </>
  );
}

interface BodyProps {
  phase: Phase;
  mode: SheetMode;
  view: AutomationsView;
  target: SheetTarget;
  error: string | null;
  onChoose: (choice: SheetChoice) => void;
  onClose: () => void;
}

function Body({ phase, mode, view, target, error, onChoose, onClose }: BodyProps) {
  if (phase.kind === "checking") {
    return (
      <View style={styles.checking}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.body}>Checking who qualifies…</Text>
      </View>
    );
  }
  if (phase.kind === "unreadable") {
    return (
      <>
        <Text style={styles.title}>Couldn’t check who qualifies</Text>
        <Text style={styles.error}>{phase.error}</Text>
        <Button label="Close" tone="secondary" onPress={onClose} fullWidth />
      </>
    );
  }
  if (phase.kind === "done") {
    return (
      <>
        <View style={styles.doneRow}>
          <View style={styles.doneIcon}>
            <Icon name="check" size={20} color={colors.success} />
          </View>
          <Text style={[styles.body, styles.doneText]}>{phase.text}</Text>
        </View>
        <Button label="Done" onPress={onClose} size="lg" />
      </>
    );
  }

  const { queued, outlook, sample } = phase;
  const question = turnOnQuestion(queued);
  const { choices, note } = sheetChoices({
    mode,
    queued,
    hasSender: view.sender.enrolled > 0,
    isOnline: view.sender.online,
    runMode: target.runMode,
  });
  const isWorking = phase.kind === "working";
  const body = mode === "run_now" && queued > 0 ? "Send this text to them now?" : question.body;
  return (
    <>
      <Text style={styles.title}>{question.title}</Text>
      <Text style={styles.body}>{body}</Text>
      {queued > 0 && sample ? (
        <View style={styles.sample}>
          <Text style={styles.sampleLabel}>They’ll get a text like</Text>
          <Text style={styles.sampleText} numberOfLines={4}>{sample}</Text>
        </View>
      ) : null}
      {queued > 0 ? (
        <View style={styles.facts}>
          <Fact icon="clock" text={etaAfterQueueing(outlook, view.settings, queued, Date.now())} />
          <Fact icon="send" text={pacingLine(view.settings)} />
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {choices.map((choice) => (
          <Button
            key={choice.label}
            label={choice.label}
            tone={choice.tone}
            size="lg"
            isLoading={phase.kind === "working" && phase.chosen === choice.label}
            disabled={isWorking}
            onPress={() => onChoose(choice)}
          />
        ))}
        <Button label={choices.length === 0 ? "Close" : "Cancel"} tone="ghost" onPress={onClose} disabled={isWorking} fullWidth />
      </View>
    </>
  );
}

function Fact({ icon, text }: { icon: "clock" | "send"; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={16} color={colors.textSecondary} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  kicker: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  checking: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  facts: { gap: spacing.sm, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: spacing.md },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  factText: { ...typography.caption, color: colors.textPrimary, flex: 1, lineHeight: 18 },
  sample: { gap: 4, borderLeftWidth: 3, borderLeftColor: colors.separator, paddingLeft: spacing.md },
  sampleLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  sampleText: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  note: { ...typography.caption, color: colors.statusPending.text, lineHeight: 18 },
  error: { ...typography.caption, color: colors.danger, lineHeight: 18 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  doneIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { flex: 1 },
});
