import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";
import { blockLabel } from "../../lib/receipt-editor";
import { ORDER_META_LINE_COUNT } from "../../lib/receipt-studio";
import {
  RECEIPT_STYLE_SUPPORT,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptTheme,
} from "../../lib/receipt-layout";
import { StyleControls } from "./StyleControls";
import { MONO_FONT } from "./studio-theme";

/**
 * Everything about the block the merchant tapped on the paper: what it says,
 * how it prints, and where it sits.
 *
 * The arrange bar is the last row on purpose. The sheet rises from the bottom
 * edge, so the actions a merchant repeats most — nudge it up, nudge it down —
 * land under the thumb, and the paper above moves as they tap.
 */

/** Default printed label per renamable detail kind — the field's placeholder. */
const DETAIL_LABEL_DEFAULTS: Partial<Record<ReceiptBlockKind, string>> = {
  orderNumber: "Order #",
  orderDate: "Date",
  customerName: "Customer",
  orderType: "Type",
  tableNumber: "Table",
  deliveryAddress: "Address",
};

const DIVIDER_STYLES = [
  { char: "=", preview: "════════" },
  { char: "-", preview: "────────" },
  { char: "*", preview: "********" },
  { char: ".", preview: ". . . . ." },
];

/** What the inspector says about blocks that have nothing to set. */
const NOTES: Partial<Record<ReceiptBlockKind, string>> = {
  logo: "Prints your store logo in black and white. Change the logo in your store settings on the web.",
  qr: "Customers scan it to follow their order live. Each receipt gets its own code.",
  feed: "One blank line of paper — room to breathe between sections.",
  orderMeta: "Order #, date, customer, type and table, printed together.",
  storeAddress: "Prints the address saved for your store, when there is one.",
};

const MAX_TEXT_LENGTH = 64;
const MAX_LABEL_LENGTH = 32;
/** Show the character count once the merchant is this close to the limit. */
const COUNTER_THRESHOLD = 0.75;

function hasEditableLabel(block: ReceiptBlock): block is Extract<ReceiptBlock, { label?: string }> {
  return block.kind in DETAIL_LABEL_DEFAULTS;
}

interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  hasError?: boolean;
  onChangeText: (value: string) => void;
}

function Field({ label, value, placeholder, maxLength, hasError, onChangeText }: FieldProps) {
  const showCounter = value.length >= maxLength * COUNTER_THRESHOLD;
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.eyebrow}>{label}</Text>
        {showCounter ? (
          <Text style={styles.counter}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        maxLength={maxLength}
        onChangeText={onChangeText}
        style={[styles.input, hasError && styles.inputError]}
        accessibilityLabel={label}
        returnKeyType="done"
        autoCorrect={false}
      />
    </View>
  );
}

interface ContentFieldsProps {
  block: ReceiptBlock;
  hasError: boolean;
  onChange: (block: ReceiptBlock, field?: string) => void;
}

/** A block's own content: its text, its printed label or its rule character. */
function ContentFields({ block, hasError, onChange }: ContentFieldsProps) {
  if (block.kind === "text") {
    return (
      <Field
        label="Text"
        value={block.text}
        maxLength={MAX_TEXT_LENGTH}
        hasError={hasError}
        onChangeText={(text) => onChange({ ...block, text }, "text")}
      />
    );
  }
  if (block.kind === "fillIn") {
    return (
      <Field
        label="Label"
        value={block.label}
        placeholder="Name"
        maxLength={MAX_LABEL_LENGTH}
        hasError={hasError}
        onChangeText={(label) => onChange({ ...block, label }, "label")}
      />
    );
  }
  if (hasEditableLabel(block)) {
    return (
      <Field
        label="Printed label"
        value={block.label ?? ""}
        placeholder={DETAIL_LABEL_DEFAULTS[block.kind]}
        maxLength={MAX_LABEL_LENGTH}
        // No label saved = print the default; keeps stored layouts minimal.
        onChangeText={(label) => onChange({ ...block, label: label || undefined }, "label")}
      />
    );
  }
  if (block.kind === "divider") {
    const current = block.char ?? "=";
    return (
      <View style={styles.field}>
        <Text style={styles.eyebrow}>Line</Text>
        <View style={styles.dividerRow} accessibilityRole="radiogroup" accessibilityLabel="Divider style">
          {DIVIDER_STYLES.map((style) => {
            const isActive = current === style.char;
            return (
              <TouchableOpacity
                key={style.char}
                style={[styles.dividerOption, isActive && styles.dividerActive]}
                onPress={() => onChange({ ...block, char: style.char })}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
                accessibilityLabel={`Line of ${style.char}`}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  style={[styles.dividerPreview, isActive && styles.dividerPreviewActive]}
                >
                  {style.preview}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }
  return null;
}

interface ArrangeButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  isDanger?: boolean;
}

function ArrangeButton({ icon, label, onPress, disabled, isDanger }: ArrangeButtonProps) {
  const color = isDanger ? colors.danger : colors.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.arrange, disabled && styles.arrangeDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon name={icon} size={19} color={color} />
      <Text style={[styles.arrangeLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export interface BlockInspectorProps {
  block: ReceiptBlock;
  theme: ReceiptTheme;
  columns: number;
  isFirst: boolean;
  isLast: boolean;
  hasLogo: boolean;
  /** A publish refusal pointing at this block, shown where the fix is. */
  problem: string | null;
  onChange: (block: ReceiptBlock, field?: string) => void;
  onMove: (offset: -1 | 1) => void;
  onDuplicate: () => void;
  onAddBelow: () => void;
  onRemove: () => void;
  onSplit: () => void;
  onDone: () => void;
}

export function BlockInspector({
  block,
  theme,
  columns,
  isFirst,
  isLast,
  hasLogo,
  problem,
  onChange,
  onMove,
  onDuplicate,
  onAddBelow,
  onRemove,
  onSplit,
  onDone,
}: BlockInspectorProps) {
  const label = blockLabel(block.kind);
  const isStylable = RECEIPT_STYLE_SUPPORT[block.kind] !== undefined;
  const note = NOTES[block.kind];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {label}
        </Text>
        <TouchableOpacity
          onPress={onDone}
          style={styles.done}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Done editing this block"
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      {problem ? (
        <View style={styles.problem} accessibilityRole="alert">
          <Icon name="warning" size={16} color={colors.danger} />
          <Text style={styles.problemText}>{problem}</Text>
        </View>
      ) : null}

      <ContentFields block={block} hasError={problem !== null} onChange={onChange} />

      {isStylable ? (
        <StyleControls block={block} theme={theme} columns={columns} onChange={(next) => onChange(next)} />
      ) : null}

      {note ? <Text style={styles.note}>{note}</Text> : null}

      {block.kind === "logo" && !hasLogo ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Your store has no logo yet, so this prints nothing. Upload one in your store settings first.
          </Text>
        </View>
      ) : null}

      {block.kind === "orderMeta" ? (
        <TouchableOpacity
          style={styles.split}
          onPress={onSplit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityHint="Replaces this block with one block per line, so each can be styled"
        >
          <Text style={styles.splitText}>Split into {ORDER_META_LINE_COUNT} lines to style each one</Text>
          <Icon name="arrow-right" size={16} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.arrangeBar}>
        <ArrangeButton icon="arrow-up" label="Up" onPress={() => onMove(-1)} disabled={isFirst} />
        <ArrangeButton icon="arrow-down" label="Down" onPress={() => onMove(1)} disabled={isLast} />
        <ArrangeButton icon="duplicate" label="Copy" onPress={onDuplicate} />
        <ArrangeButton icon="plus" label="Add below" onPress={onAddBelow} />
        <ArrangeButton icon="trash" label="Remove" onPress={onRemove} isDanger />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { flex: 1, fontSize: 19, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  done: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { fontSize: 14, fontWeight: "800", color: colors.textOnDark },
  problem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
  },
  problemText: { flex: 1, ...typography.caption, fontWeight: "600", color: colors.danger },
  field: { gap: spacing.sm },
  fieldHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  counter: { ...typography.small, fontWeight: "700", color: colors.textSecondary },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  inputError: { borderColor: colors.danger, borderWidth: 1.5 },
  dividerRow: { flexDirection: "row", gap: spacing.sm },
  dividerOption: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    overflow: "hidden",
  },
  dividerActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dividerPreview: { fontFamily: MONO_FONT, fontSize: 12, color: colors.textPrimary },
  dividerPreviewActive: { color: colors.textOnDark },
  note: { ...typography.caption, lineHeight: 19, color: colors.textSecondary },
  warn: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningLight },
  warnText: { ...typography.caption, lineHeight: 19, color: colors.statusPending.text },
  split: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  splitText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  arrangeBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  arrange: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4 },
  arrangeDisabled: { opacity: 0.3 },
  arrangeLabel: { fontSize: 11, fontWeight: "700" },
});
