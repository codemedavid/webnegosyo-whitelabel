import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { StaffAvatar } from "../staff/StaffAvatar";

export interface Receiver {
  userId: string;
  name: string;
  isOwner: boolean;
  /** Branch name, or null for the whole store. */
  branch: string | null;
}

interface ReceiversSectionProps {
  /** null = the roster could not be read by this account; the rule is still said. */
  receivers: readonly Receiver[] | null;
  canOpenTeam: boolean;
  onOpenTeam: () => void;
}

/** Who can accept remittances and pickups. Read-only: Team is where it changes. */
export function ReceiversSection({ receivers, canOpenTeam, onOpenTeam }: ReceiversSectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading} accessibilityRole="header">
        Who can receive cash
      </Text>
      <Text style={styles.hint}>The owner and anyone with Cash & day close. They accept remittances and pickups.</Text>
      {(receivers ?? []).map((receiver) => (
        <View key={receiver.userId} style={styles.person}>
          <StaffAvatar name={receiver.name} seed={receiver.userId} size="sm" />
          <View style={styles.personCopy}>
            <Text style={styles.personName}>{receiver.name}</Text>
            <Text style={styles.hint}>{receiver.isOwner ? "Owner" : receiver.branch ?? "Every branch"}</Text>
          </View>
        </View>
      ))}
      {canOpenTeam ? <Button label="Change who has access" tone="ghost" icon="customers" onPress={onOpenTeam} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52 },
  personCopy: { flex: 1, gap: 2 },
  personName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
});
