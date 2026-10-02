import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EMPTY_REWARD, type ProgramForm } from "../../lib/loyalty/programs";
import {
  CREATE_STEPS,
  EDIT_STEPS,
  STEP_TITLES,
  applyTemplate,
  placeReward,
  removeReward,
  rewardAt,
  stepIssue,
} from "../../lib/loyalty/wizard";
import type { PortfolioOutlet } from "../../lib/portfolio-rows";
import type { Product } from "../../lib/products";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { RewardEditorSheet } from "./RewardEditorSheet";
import { DetailsStep, ReviewStep, RewardsStep, SizeStep, StyleStep } from "./WizardSteps";

/**
 * Building a reward card, one decision per screen: style → size → rewards on
 * the card → final touches → review. The live card is on screen the whole way,
 * so the merchant is designing the thing customers will hold, not a form.
 *
 * The form is owned by the parent (it also drives which menu items load), so
 * this component only moves between steps and edits through `onFormChange`.
 */

interface ProgramWizardProps {
  isVisible: boolean;
  isEditing: boolean;
  form: ProgramForm;
  onFormChange: (form: ProgramForm) => void;
  outlets: PortfolioOutlet[];
  products: Product[];
  catalogError: string | null;
  isSaving: boolean;
  saveError: string | null;
  /** `launch` = create and switch the card on in one go. */
  onSubmit: (launch: boolean) => void;
  onClose: () => void;
}

export function ProgramWizard({
  isVisible,
  isEditing,
  form,
  onFormChange,
  outlets,
  products,
  catalogError,
  isSaving,
  saveError,
  onSubmit,
  onClose,
}: ProgramWizardProps) {
  const steps = isEditing ? EDIT_STEPS : CREATE_STEPS;
  const [index, setIndex] = useState(0);
  const [issue, setIssue] = useState<string | null>(null);
  const [slotAt, setSlotAt] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (!isVisible) return;
    setIndex(0);
    setIssue(null);
    setSlotAt(null);
  }, [isVisible]);

  useEffect(() => {
    Animated.spring(progress, { toValue: (index + 1) / steps.length, friction: 8, useNativeDriver: false }).start();
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [index, steps.length, progress]);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const size = Number(form.threshold) || 0;
  const unit = form.earnMode === "stamp" ? "stamp" : "point";

  const goNext = () => {
    const problem = stepIssue(form, step);
    if (problem) {
      setIssue(problem);
      return;
    }
    setIssue(null);
    setIndex(current => Math.min(steps.length - 1, current + 1));
  };

  const goBack = () => {
    setIssue(null);
    if (index === 0) onClose();
    else setIndex(current => current - 1);
  };

  const editingReward = slotAt === null ? EMPTY_REWARD : rewardAt(form, slotAt) ?? EMPTY_REWARD;
  const isFinalSlot = slotAt === size;

  return (
    <Modal visible={isVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={goBack}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
          <View style={styles.track} accessibilityLabel={`Step ${index + 1} of ${steps.length}`}>
            <Animated.View
              style={[styles.trackFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
            />
          </View>
          <Text style={styles.stepCount}>{index + 1}/{steps.length}</Text>
        </View>

        <ScrollView ref={scroller} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{isEditing && step === "review" ? "Updated card" : STEP_TITLES[step]}</Text>
          {step === "style" ? (
            <StyleStep onPick={template => { onFormChange(applyTemplate(template)); setIndex(1); }} />
          ) : step === "size" ? (
            <SizeStep form={form} onChange={onFormChange} isEditing={isEditing} />
          ) : step === "rewards" ? (
            <RewardsStep form={form} onSlotPress={setSlotAt} />
          ) : step === "details" ? (
            <DetailsStep form={form} onChange={onFormChange} isEditing={isEditing} outlets={outlets} />
          ) : (
            <ReviewStep form={form} isEditing={isEditing} outlets={outlets} />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {issue || (isLast && saveError) ? (
            <View style={styles.issue} accessibilityLiveRegion="polite">
              <Text style={styles.issueText}>{issue ?? saveError}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {index > 0 ? (
              <TouchableOpacity style={styles.back} onPress={goBack} accessibilityRole="button" disabled={isSaving}>
                <Text style={styles.backLabel}>Back</Text>
              </TouchableOpacity>
            ) : null}
            {step === "style" ? null : !isLast ? (
              <TouchableOpacity style={styles.next} onPress={goNext} accessibilityRole="button">
                <Text style={styles.nextLabel}>Continue</Text>
              </TouchableOpacity>
            ) : isEditing ? (
              <TouchableOpacity style={styles.next} onPress={() => onSubmit(false)} disabled={isSaving} accessibilityRole="button">
                <Text style={styles.nextLabel}>{isSaving ? "Saving…" : "Save new rules"}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.back} onPress={() => onSubmit(false)} disabled={isSaving} accessibilityRole="button">
                  <Text style={styles.backLabel}>Save draft</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.next} onPress={() => onSubmit(true)} disabled={isSaving} accessibilityRole="button">
                  <Text style={styles.nextLabel}>{isSaving ? "Launching…" : "Launch card 🚀"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <RewardEditorSheet
          isVisible={slotAt !== null}
          at={slotAt ?? 0}
          unit={unit}
          isFinal={isFinalSlot}
          initial={editingReward}
          products={products}
          catalogError={catalogError}
          onClose={() => setSlotAt(null)}
          onSave={draft => {
            if (slotAt !== null) onFormChange(placeReward(form, slotAt, draft));
            setSlotAt(null);
            setIssue(null);
          }}
          onRemove={!isFinalSlot && slotAt !== null && rewardAt(form, slotAt) ? () => { onFormChange(removeReward(form, slotAt)); setSlotAt(null); } : undefined}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  close: { fontSize: 22, color: colors.textSecondary, fontWeight: "700" },
  track: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.separator, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 7, backgroundColor: colors.success },
  stepCount: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...typography.title, fontSize: 28, color: colors.textPrimary },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.separator, backgroundColor: colors.background },
  issue: { backgroundColor: colors.dangerLight, borderRadius: radius.lg, padding: spacing.md },
  issueText: { ...typography.body, fontWeight: "600", color: colors.danger },
  actions: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm },
  back: {
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.separator,
    borderBottomWidth: 4,
    alignItems: "center",
  },
  backLabel: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  next: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: radius.lg,
    backgroundColor: colors.success,
    borderBottomWidth: 4,
    borderBottomColor: "#03543F",
    alignItems: "center",
  },
  nextLabel: { ...typography.body, fontWeight: "800", color: colors.textOnDark, letterSpacing: 0.5 },
});
