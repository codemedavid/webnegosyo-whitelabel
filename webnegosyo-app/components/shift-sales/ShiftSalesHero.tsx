import React from "react";
import { Text, View } from "react-native";

import { HIDDEN_MESSAGE, HIDDEN_TITLE, NOT_LOADED, heroLines, receiptRangeText, sourceNote } from "../../lib/cash/shift-sales-view";
import type { ShiftSalesReport } from "../../lib/cash/shift-sales";
import { colors } from "../../theme/colors";
import { BigAmount } from "../BigAmount";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { ink } from "./shift-sales-styles";

interface ShiftSalesHeroProps {
  report: ShiftSalesReport;
  title: string;
  isOpen: boolean;
  onPrint?: () => void;
  onShare?: () => void;
  isPrinting?: boolean;
  /** Only for the cashier's own open shift. */
  onEndShift?: () => void;
}

/**
 * The one ink figure on the screen: what the store sold in this shift, then
 * the facts a cashier checks a stack of receipts against (#range, discounts
 * and voids, what is still unpaid). Blind count shows the receipts' range
 * and a plain sentence instead of any peso — never a zero.
 */
export function ShiftSalesHero({ report, title, isOpen, onPrint, onShare, isPrinting, onEndShift }: ShiftSalesHeroProps) {
  const note = sourceNote(report.source);
  const lines = heroLines(report);
  return (
    <View style={ink.hero} testID="shift-sales-hero">
      <View style={ink.head}>
        <View style={ink.chip}>
          <Icon name="clock" size={14} color={colors.heroInkText} />
          <Text style={ink.chipText} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={ink.chip} accessibilityLabel={isOpen ? "Shift still open" : "Shift ended"}>
          <Icon name={isOpen ? "bolt" : "check"} size={12} color={isOpen ? colors.heroInkPositive : colors.heroInkText} />
          <Text style={ink.chipText}>{isOpen ? "Live" : "Ended"}</Text>
        </View>
        {note ? (
          <View style={ink.chip}>
            <Icon name="info" size={12} color={colors.heroInkText} />
            <Text style={ink.chipText}>{note}</Text>
          </View>
        ) : null}
      </View>

      <Text style={ink.eyebrow}>{isOpen ? "Net sales this shift" : "Net sales"}</Text>
      <HeroFigure report={report} />
      <Text style={ink.text} testID="shift-sales-range">
        {receiptRangeText(report)}
      </Text>

      {lines.length > 0 ? (
        <View style={ink.lines}>
          {lines.map((line) => (
            <View key={line.key} style={ink.line}>
              <Text style={ink.muted}>{line.label}</Text>
              <Text style={[ink.lineValue, line.isAttention && ink.attention]}>{line.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {onPrint || onShare ? (
        <View style={ink.actions}>
          {onPrint ? (
            <Button label="Print" icon="printer" tone="secondary" size="lg" fullWidth={false} onPress={onPrint} isLoading={isPrinting} style={ink.action} />
          ) : null}
          {onShare ? <Button label="Share" icon="export" tone="secondary" size="lg" fullWidth={false} onPress={onShare} style={ink.action} /> : null}
        </View>
      ) : null}
      {onEndShift ? (
        <Button
          label="End shift & remit"
          size="lg"
          onPress={onEndShift}
          fullWidth
          style={ink.coral}
          accessibilityHint="Count the drawer and close your shift"
        />
      ) : null}
    </View>
  );
}

function HeroFigure({ report }: { report: ShiftSalesReport }) {
  if (report.hidden) {
    return (
      <View testID="shift-sales-hidden" accessible accessibilityLabel={`${HIDDEN_TITLE}. ${HIDDEN_MESSAGE}`}>
        <View style={ink.head}>
          <Icon name="lock" size={18} color={colors.heroInkText} />
          <Text style={ink.pending}>{HIDDEN_TITLE}</Text>
        </View>
        <Text style={ink.muted}>{HIDDEN_MESSAGE}</Text>
      </View>
    );
  }
  if (!report.summary) return <Text style={ink.pending}>{NOT_LOADED}</Text>;
  return <BigAmount cents={report.summary.netCents} color={colors.heroInkText} testID="shift-sales-net" />;
}
