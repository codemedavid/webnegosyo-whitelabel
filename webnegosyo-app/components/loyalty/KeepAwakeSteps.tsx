import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { keepAwakeGuideFor } from "../../lib/sms-automations/keep-awake";
import { readDeviceMaker } from "../../lib/sms-automations/phone-info-device";

/**
 * "Keep it sending in the background": this phone brand's steps to stop its
 * battery manager killing the gateway (the same words as the web Texts page,
 * lib/sms-automations/keep-awake.ts). Folded until tapped.
 */
export function KeepAwakeSteps() {
  const [isOpen, setOpen] = useState(false);
  const guide = useMemo(() => {
    const { manufacturer, model } = readDeviceMaker();
    return keepAwakeGuideFor(manufacturer, model);
  }, []);
  return (
    <View style={styles.box}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setOpen((open) => !open)}
        style={styles.header}
      >
        <Text style={styles.headerText}>Keep it sending in the background</Text>
        <Text style={styles.chevron}>{isOpen ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {isOpen ? (
        <View style={styles.steps}>
          <Text style={styles.lead}>
            Many phones put apps to sleep even with battery saver off, and the gateway quietly stops.
            {guide.title ? ` On ${guide.title}:` : ""}
          </Text>
          {guide.steps.map((step, index) => (
            <Text key={step} style={styles.step}>{`${index + 1}. ${step}`}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.sm, minHeight: 44 },
  headerText: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  chevron: { ...typography.caption, color: colors.textSecondary },
  steps: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  lead: { ...typography.caption, color: colors.textSecondary },
  step: { ...typography.caption, color: colors.textPrimary },
});
