import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  countTotalCents,
  pieceCounts,
  pressCountKey,
  setCount,
  setLooseCoinsCents,
  stepCount,
  type CountKey,
  type DenominationCounts,
  type DenominationKey,
} from "../../lib/cash/denominations";
import { EMPTY_KEYPAD, keypadDisplay, keypadFromCents, pressKey, keypadCents, type KeypadState } from "../../lib/expenses/keypad";
import { isTabletScreen } from "../../lib/screen-size";
import { colors, spacing, typography } from "../../theme/colors";
import { Keypad, type KeypadPress } from "../Keypad";
import { CountTotalPanel } from "./CountTotalPanel";
import { counterRows, isLastFocus, nextFocus, type CounterFocus, type CounterRows } from "./counter-focus";
import { DenominationRow } from "./DenominationRow";
import { LooseCoinsRow } from "./LooseCoinsRow";

export interface DenominationCounterProps {
  /** The count (controlled). */
  value: DenominationCounts;
  onChange: (next: DenominationCounts) => void;
  /** Under the total: "Should be ₱8,465", or blind, "We'll compare after you finish." */
  hint?: string | null;
  /** Defaults to the window size (lib/screen-size). */
  isTablet?: boolean;
  isDisabled?: boolean;
  /** Next on the last row: e.g. go to the next step. Without it Next just closes the keypad. */
  onDone?: () => void;
  doneLabel?: string;
}

const TABLET_PANEL_WIDTH = 360;

interface RowListProps {
  rows: CounterRows;
  value: DenominationCounts;
  focus: CounterFocus;
  isTablet: boolean;
  isDisabled: boolean;
  isMoreCoinsShown: boolean;
  loose: KeypadState | null;
  onStep: (key: DenominationKey, delta: 1 | -1) => void;
  onFocus: (focus: CounterFocus) => void;
  onShowMoreCoins: () => void;
  onCountByTotal: () => void;
}

function TextLink({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function RowList(props: RowListProps) {
  const { rows, value, focus, isTablet, isDisabled } = props;
  const pieces = pieceCounts(value);
  const row = (key: DenominationKey, denomination: CounterRows["bills"][number]) => (
    <DenominationRow
      key={key}
      denomination={denomination}
      count={value[key] ?? 0}
      isFocused={focus === key}
      isTablet={isTablet}
      isDisabled={isDisabled}
      onStep={(delta) => props.onStep(key, delta)}
      onFocus={() => props.onFocus(key)}
    />
  );
  const hasHiddenMoreCoins = !props.isMoreCoinsShown && !rows.isCoinsByTotal && rows.coins.every((d) => !d.isMoreCoins);
  return (
    <View style={[styles.columns, isTablet && styles.columnsTablet]}>
      <View style={styles.column}>
        <Text style={styles.eyebrow}>{`Bills · ${pieces.bills}`}</Text>
        {rows.bills.map((d) => row(d.key, d))}
      </View>
      <View style={styles.column}>
        <Text style={styles.eyebrow}>{`Coins · ${pieces.coins}`}</Text>
        {rows.isCoinsByTotal ? <Text style={styles.note}>Counted by total</Text> : rows.coins.map((d) => row(d.key, d))}
        {rows.isLooseShown ? (
          <LooseCoinsRow
            cents={value.loose_coins_cents ?? 0}
            typing={props.loose ? keypadDisplay(props.loose) : null}
            isFocused={focus === "loose"}
            isDisabled={isDisabled}
            onFocus={() => props.onFocus("loose")}
          />
        ) : null}
        <View style={styles.links}>
          {hasHiddenMoreCoins ? <TextLink label="More coins (5¢, 1¢)" onPress={props.onShowMoreCoins} testID="denomination-more-coins" /> : <View />}
          {!rows.isLooseShown ? <TextLink label="Count coins by total" onPress={props.onCountByTotal} testID="denomination-by-total" /> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * The drawer count by denomination (06 §5): bills then coins, biggest first;
 * steppers for small piles, the keypad for big ones (tap a count, type it,
 * Next moves down), coins by total for anyone who weighed them. A phone docks
 * the keypad under the list once a count is tapped; a tablet keeps the list on
 * the left and the total + keypad on the right, always visible.
 *
 * Controlled: every change hands back a NEW count (lib/cash/denominations).
 */
export function DenominationCounter({ value, onChange, hint, isTablet: isTabletProp, isDisabled = false, onDone, doneLabel = "Done" }: DenominationCounterProps) {
  const window = useWindowDimensions();
  const isTablet = isTabletProp ?? isTabletScreen(window);
  const [isMoreCoinsShown, setMoreCoinsShown] = useState(false);
  const [isLooseRequested, setLooseRequested] = useState(false);
  const [focus, setFocus] = useState<CounterFocus>(isTablet ? "b1000" : null);
  const [loose, setLoose] = useState<KeypadState | null>(null);
  // Held + taps arrive faster than the parent re-renders; step from the
  // latest count, not the one this render was given.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const rows = counterRows(value, isMoreCoinsShown, isLooseRequested);
  const total = countTotalCents(value) ?? 0;
  const pieces = pieceCounts(value);

  const emit = useCallback(
    (next: DenominationCounts) => {
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );

  const focusRow = (next: CounterFocus) => {
    setFocus(next);
    setLoose(next === "loose" ? keypadFromCents(latest.current.loose_coins_cents ?? 0) : null);
  };

  const handleKey = (key: KeypadPress) => {
    if (key === "next") {
      const following = nextFocus(rows, focus);
      if (following === null && onDone) onDone();
      focusRow(following);
      return;
    }
    if (focus === "loose") {
      const typed = pressKey(loose ?? EMPTY_KEYPAD, key);
      setLoose(typed);
      emit(setLooseCoinsCents(latest.current, keypadCents(typed)));
      return;
    }
    if (focus === null || key === "decimal") return;
    emit(setCount(latest.current, focus, pressCountKey(latest.current[focus] ?? 0, key as CountKey)));
  };

  const list = (
    <RowList
      rows={rows}
      value={value}
      focus={focus}
      isTablet={isTablet}
      isDisabled={isDisabled}
      isMoreCoinsShown={isMoreCoinsShown}
      loose={focus === "loose" ? loose : null}
      onStep={(key, delta) => emit(stepCount(latest.current, key, delta))}
      onFocus={focusRow}
      onShowMoreCoins={() => setMoreCoinsShown(true)}
      onCountByTotal={() => {
        setLooseRequested(true);
        focusRow("loose");
      }}
    />
  );
  const keypad =
    focus !== null ? (
      <Keypad
        mode={focus === "loose" ? "amount" : "count"}
        onKey={handleKey}
        isDisabled={isDisabled}
        nextLabel={isLastFocus(rows, focus) ? doneLabel : "Next"}
        testIDPrefix="counter-key"
      />
    ) : null;
  const totalPanel = <CountTotalPanel totalCents={total} bills={pieces.bills} coins={pieces.coins} hint={hint} isCompact={!isTablet} />;
  const looseNextKey = focus === "loose" ? <NextKey onPress={() => handleKey("next")} label={isLastFocus(rows, focus) ? doneLabel : "Next"} /> : null;

  if (isTablet) {
    return (
      <View style={styles.tablet} testID="denomination-counter">
        <View style={styles.tabletList}>{list}</View>
        <View style={styles.tabletPanel}>
          {totalPanel}
          {keypad}
          {looseNextKey}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.phone} testID="denomination-counter">
      {list}
      <View style={styles.dock}>
        {totalPanel}
        {keypad}
        {looseNextKey}
      </View>
    </View>
  );
}

/** Amount mode has `00` where count mode has Next, so the loose row gets its own Next under the pad. */
function NextKey({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.nextKey} accessibilityRole="button" accessibilityLabel={label} testID="counter-loose-next">
      <Text style={styles.nextKeyText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phone: { gap: spacing.md },
  dock: { gap: spacing.sm },
  tablet: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  tabletList: { flex: 1, minWidth: 0 },
  tabletPanel: { width: TABLET_PANEL_WIDTH, gap: spacing.md },
  columns: { gap: spacing.lg },
  columnsTablet: { flexDirection: "row" },
  column: { flex: 1, gap: 6 },
  eyebrow: { ...typography.eyebrow, color: colors.textMuted, marginBottom: 2 },
  note: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.sm },
  links: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: spacing.sm, paddingHorizontal: 4 },
  link: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
  nextKey: { height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  nextKeyText: { fontSize: 15, fontWeight: "800", color: colors.textOnDark },
});
