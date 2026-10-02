import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { describeProgramRules, parseProgramForm, type ProgramForm } from "../../lib/loyalty/programs";
import {
  MAX_STAMPS,
  MIN_STAMPS,
  PROGRAM_TEMPLATES,
  previewSteps,
  resizeCard,
  type ProgramTemplate,
} from "../../lib/loyalty/wizard";
import type { PortfolioOutlet as Outlet } from "../../lib/portfolio-rows";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { RewardCardPreview } from "./RewardCardPreview";

/** The body of each wizard step. Pure presentation over the form the wizard owns. */

interface StepProps {
  form: ProgramForm;
  onChange: (form: ProgramForm) => void;
}

export function StyleStep({ onPick }: { onPick: (template: ProgramTemplate) => void }) {
  return (
    <View style={styles.stack}>
      <Text style={styles.lead}>Start from a card regulars already love. You can change everything after.</Text>
      {PROGRAM_TEMPLATES.map(template => (
        <TouchableOpacity
          key={template.id}
          style={styles.templateTile}
          accessibilityRole="button"
          accessibilityLabel={`${template.title}: ${template.tagline}`}
          onPress={() => onPick(template)}
        >
          <View style={styles.templateEmojiWrap}><Text style={styles.templateEmoji}>{template.emoji}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.templateTitle}>{template.title}</Text>
            <Text style={styles.templateTagline}>{template.tagline}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const QUICK_SIZES = [5, 8, 10, 12] as const;

export function SizeStep({ form, onChange, isEditing }: StepProps & { isEditing: boolean }) {
  const size = Number(form.threshold) || 0;
  const isStamp = form.earnMode === "stamp";
  const setSize = (next: number) => onChange(resizeCard(form, Math.max(MIN_STAMPS, Math.min(MAX_STAMPS, next))));

  return (
    <View style={styles.stack}>
      {!isEditing ? (
        <View style={styles.segment}>
          {(["stamp", "points"] as const).map(mode => {
            const isActive = form.earnMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentItem, isActive && styles.segmentActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                onPress={() => onChange({ ...form, earnMode: mode, threshold: mode === "stamp" ? "10" : "500", milestones: [] })}
              >
                <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>{mode === "stamp" ? "🎟️ A stamp per visit" : "💎 Points per peso"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {isStamp ? (
        <>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepperButton} accessibilityLabel="Fewer stamps" onPress={() => setSize(size - 1)}>
              <Text style={styles.stepperSign}>−</Text>
            </TouchableOpacity>
            <View style={styles.stepperValue}>
              <Text style={styles.bigNumber}>{size}</Text>
              <Text style={styles.bigUnit}>stamps fill the card</Text>
            </View>
            <TouchableOpacity style={styles.stepperButton} accessibilityLabel="More stamps" onPress={() => setSize(size + 1)}>
              <Text style={styles.stepperSign}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chips}>
            {QUICK_SIZES.map(quick => (
              <TouchableOpacity key={quick} style={[styles.chip, size === quick && styles.chipActive]} onPress={() => setSize(quick)}>
                <Text style={[styles.chipLabel, size === quick && styles.chipLabelActive]}>{quick}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>Every completed order earns one stamp. Short cards bring people back sooner.</Text>
        </>
      ) : (
        <>
          <Field label="Points that fill the card" value={form.threshold} onChange={threshold => onChange({ ...form, threshold, milestones: form.milestones.filter(m => m.at < Number(threshold)) })} />
          <Field label="Points per ₱1 spent" value={form.pointsPerPeso} onChange={pointsPerPeso => onChange({ ...form, pointsPerPeso })} />
          <Text style={styles.hint}>At 1 point per peso, a ₱{form.threshold || "500"} spend fills the card.</Text>
        </>
      )}

      <RewardCardPreview
        name={form.name}
        earnMode={form.earnMode}
        threshold={size}
        steps={previewSteps(form)}
        filled={Math.floor(size * 0.3)}
        isCompact
      />
    </View>
  );
}

export function RewardsStep({ form, onSlotPress }: { form: ProgramForm; onSlotPress: (at: number) => void }) {
  const [pointsAt, setPointsAt] = useState("");
  const size = Number(form.threshold) || 0;
  const isStamp = form.earnMode === "stamp";
  const total = form.milestones.length + 1;

  const addAtPoints = () => {
    const at = Math.floor(Number(pointsAt));
    if (!(at > 0) || at >= size) return;
    setPointsAt("");
    onSlotPress(at);
  };

  return (
    <View style={styles.stack}>
      <Text style={styles.lead}>
        {isStamp
          ? "Tap any slot to put a reward on it. The last slot is the big reward — it starts a fresh card."
          : "Tap a reward to change it, or add one on the way to the big reward."}
      </Text>
      <RewardCardPreview name={form.name} earnMode={form.earnMode} threshold={size} steps={previewSteps(form)} onSlotPress={onSlotPress} />
      <View style={styles.counter}>
        <Text style={styles.counterText}>{total} reward{total === 1 ? "" : "s"} on this card</Text>
        <Text style={styles.hint}>Up to 5. A treat half way keeps regulars coming back.</Text>
      </View>
      {!isStamp ? (
        <View style={styles.inlineAdd}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            keyboardType="number-pad"
            placeholder={`Points, e.g. ${Math.round(size / 2) || 250}`}
            placeholderTextColor={colors.textTertiary}
            value={pointsAt}
            onChangeText={setPointsAt}
            accessibilityLabel="Points for a new reward"
          />
          <TouchableOpacity style={styles.smallButton} onPress={addAtPoints} accessibilityRole="button">
            <Text style={styles.smallButtonLabel}>＋ Add reward</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const EXPIRY_CHOICES = [
  { label: "Never", value: "" },
  { label: "30 days", value: "30" },
  { label: "60 days", value: "60" },
  { label: "90 days", value: "90" },
] as const;

export function DetailsStep({ form, onChange, isEditing, outlets }: StepProps & { isEditing: boolean; outlets: Outlet[] }) {
  const [showDates, setShowDates] = useState(Boolean(form.activatesAt || form.endsAt));
  return (
    <View style={styles.stack}>
      <Text style={styles.label}>Card name</Text>
      <TextInput
        style={[styles.input, styles.nameInput, isEditing && styles.inputLocked]}
        placeholder="e.g. Coffee Club"
        placeholderTextColor={colors.textTertiary}
        editable={!isEditing}
        value={form.name}
        onChangeText={name => onChange({ ...form, name })}
        accessibilityLabel="Program name"
        maxLength={80}
      />

      {!isEditing && outlets.length > 0 ? (
        <>
          <Text style={styles.label}>Where customers earn</Text>
          <View style={styles.chips}>
            <TouchableOpacity style={[styles.chip, form.scope === "business" && styles.chipActive]} onPress={() => onChange({ ...form, scope: "business", outletId: "" })}>
              <Text style={[styles.chipLabel, form.scope === "business" && styles.chipLabelActive]}>All branches</Text>
            </TouchableOpacity>
            {outlets.map(outlet => {
              const isActive = form.scope === "branch" && form.outletId === outlet.id;
              return (
                <TouchableOpacity key={outlet.id} style={[styles.chip, isActive && styles.chipActive]} onPress={() => onChange({ ...form, scope: "branch", outletId: outlet.id })}>
                  <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{outlet.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      <Field label="Minimum order to earn (₱, optional)" value={form.minSpend} onChange={minSpend => onChange({ ...form, minSpend })} />

      <Text style={styles.label}>Rewards expire after</Text>
      <View style={styles.chips}>
        {EXPIRY_CHOICES.map(choice => {
          const isActive = form.rewardExpiryDays === choice.value;
          return (
            <TouchableOpacity key={choice.label} style={[styles.chip, isActive && styles.chipActive]} onPress={() => onChange({ ...form, rewardExpiryDays: choice.value })}>
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{choice.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!isEditing ? (
        showDates ? (
          <>
            <Text style={styles.hint}>Optional earning dates, in Manila time.</Text>
            <Field label="Start date (YYYY-MM-DD)" value={form.activatesAt} numeric={false} onChange={activatesAt => onChange({ ...form, activatesAt })} />
            <Field label="End date (YYYY-MM-DD)" value={form.endsAt} numeric={false} onChange={endsAt => onChange({ ...form, endsAt })} />
          </>
        ) : (
          <TouchableOpacity onPress={() => setShowDates(true)} accessibilityRole="button">
            <Text style={styles.link}>＋ Set start or end dates</Text>
          </TouchableOpacity>
        )
      ) : null}
      <Text style={styles.hint}>One reward per sale. Rewards don’t combine with vouchers or manual discounts.</Text>
    </View>
  );
}

export function ReviewStep({ form, isEditing, outlets }: { form: ProgramForm; isEditing: boolean; outlets: Outlet[] }) {
  const parsed = parseProgramForm(form);
  const size = Number(form.threshold) || 0;
  const branch = form.scope === "branch" ? outlets.find(outlet => outlet.id === form.outletId)?.name ?? "One branch" : "All branches";
  return (
    <View style={styles.stack}>
      <Text style={styles.lead}>{isEditing ? "Here’s the updated card. New rules apply to future visits; rewards already earned keep their terms." : "This is exactly what your regulars will see. Looking good! 🎉"}</Text>
      <RewardCardPreview name={form.name} earnMode={form.earnMode} threshold={size} steps={previewSteps(form)} filled={Math.max(1, Math.floor(size * 0.4))} />
      <View style={styles.summary}>
        <SummaryRow emoji="🎯" text={parsed.ok ? describeProgramRules(parsed.program.rules) : "Finish the earlier steps"} />
        <SummaryRow emoji="📍" text={branch} />
        <SummaryRow emoji="⏳" text={form.rewardExpiryDays ? `Rewards expire after ${form.rewardExpiryDays} days` : "Rewards never expire"} />
        {form.minSpend ? <SummaryRow emoji="🧾" text={`Orders of ₱${form.minSpend}+ earn`} /> : null}
      </View>
    </View>
  );
}

function SummaryRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryEmoji}>{emoji}</Text>
      <Text style={styles.summaryText}>{text}</Text>
    </View>
  );
}

function Field({ label, value, onChange, numeric = true }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        keyboardType={numeric ? "decimal-pad" : "default"}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  lead: { ...typography.body, color: colors.textSecondary },
  templateTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.separator,
    borderBottomWidth: 5,
  },
  templateEmojiWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center" },
  templateEmoji: { fontSize: 30 },
  templateTitle: { ...typography.heading, color: colors.textPrimary },
  templateTagline: { ...typography.caption, color: colors.textSecondary },
  chevron: { fontSize: 28, color: colors.textTertiary },
  segment: { flexDirection: "row", gap: spacing.sm },
  segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.separator, alignItems: "center" },
  segmentActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  segmentLabel: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  segmentLabelActive: { color: colors.accent },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: 24, padding: spacing.md },
  stepperButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: "#000" },
  stepperSign: { fontSize: 30, fontWeight: "800", color: colors.textOnDark, lineHeight: 34 },
  stepperValue: { alignItems: "center" },
  bigNumber: { fontSize: 56, fontWeight: "900", color: colors.textPrimary, lineHeight: 62 },
  bigUnit: { ...typography.caption, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.separator },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  chipLabel: { ...typography.body, fontWeight: "700", color: colors.textSecondary },
  chipLabelActive: { color: colors.accent },
  hint: { ...typography.caption, color: colors.textSecondary },
  counter: { gap: 2 },
  counterText: { ...typography.heading, color: colors.textPrimary },
  inlineAdd: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  smallButton: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  smallButtonLabel: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
  label: { ...typography.eyebrow, color: colors.textSecondary },
  input: { ...typography.body, color: colors.textPrimary, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  nameInput: { fontSize: 20, fontWeight: "700" },
  inputLocked: { color: colors.textSecondary },
  link: { ...typography.body, fontWeight: "700", color: colors.accent },
  summary: { backgroundColor: colors.card, borderRadius: 20, padding: spacing.lg, gap: spacing.sm },
  summaryRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  summaryEmoji: { fontSize: 18 },
  summaryText: { ...typography.body, color: colors.textPrimary, flex: 1 },
});
