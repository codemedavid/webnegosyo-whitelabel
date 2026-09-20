import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { BackHeader } from "../../BackHeader";
import { IconButton } from "../../IconButton";
import { Button } from "../../Button";
import { SectionHeader } from "../../SectionHeader";
import { ListRow } from "../../ListRow";
import { Icon, type IconName } from "../../Icon";
import { CoachTarget } from "../spotlight";
import { MockSheet, MockTabBar, type SceneProps } from "./shared";

/** Team: adding a staff account and granting it screens. */
const PERMISSIONS: { key: string; label: string; icon: IconName; hint: string }[] = [
  { key: "orders", label: "Orders", icon: "orders", hint: "The live queue and order details" },
  { key: "kitchen", label: "Kitchen", icon: "kitchen", hint: "The kitchen board" },
  { key: "pos", label: "POS", icon: "register", hint: "Counter sales and the drawer" },
  { key: "analytics", label: "Analytics", icon: "analytics", hint: "Sales, growth and customers" },
];

export function TeamScene({ phase, tried, onTried }: SceneProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [hasStaff, setHasStaff] = useState(phase === "permissions");
  const [name, setName] = useState("Ana Cruz");
  const [email, setEmail] = useState("ana@example.com");
  const [granted, setGranted] = useState<Record<string, boolean>>({ orders: true, kitchen: true, pos: false, analytics: true });

  const onlyRegister = granted.pos && !granted.orders && !granted.kitchen && !granted.analytics;
  const toggle = (key: string, value: boolean) => {
    const next = { ...granted, [key]: value };
    setGranted(next);
    if (phase === "permissions" && next.pos && !next.orders && !next.kitchen && !next.analytics) onTried();
  };
  const previewTabs = PERMISSIONS.filter((p) => granted[p.key]).map((p) => (p.key === "pos" ? "pos" : p.key));

  return (
    <View style={styles.screen}>
      <BackHeader title="Team" subtitle={`${hasStaff ? 2 : 1} of 3 accounts`} actions={
        phase === "invite" && !hasStaff ? (
          <CoachTarget active={!tried && !isAdding}>
            <IconButton icon="plus" label="Add staff" tone="primary" onPress={() => setIsAdding(true)} />
          </CoachTarget>
        ) : (
          <IconButton icon="plus" label="Add staff" tone="primary" onPress={() => {}} />
        )
      } />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <ListRow icon="account" tone="ink" title="You" subtitle="Owner · full access" grouped={hasStaff} />
          {hasStaff ? <ListRow icon="customers" title={name} subtitle={`${email} · Staff`} onPress={() => {}} /> : null}
        </View>
        {phase === "permissions" ? (
          <>
            <SectionHeader title={`${name.split(" ")[0]} can open`} hint="Grant each screen separately" />
            <View style={styles.group}>
              {PERMISSIONS.map((p, i) => {
                const needsFlip = !tried && (p.key === "pos" ? !granted.pos : granted[p.key]);
                const row = (
                  <View style={[styles.permRow, i < PERMISSIONS.length - 1 && styles.permRowGrouped]}>
                    <View style={styles.permTile}><Icon name={p.icon} size={18} color={colors.textPrimary} /></View>
                    <View style={styles.permCopy}>
                      <Text style={styles.permLabel}>{p.label}</Text>
                      <Text style={styles.permHint}>{p.hint}</Text>
                    </View>
                    <Switch value={granted[p.key]} onValueChange={(v) => toggle(p.key, v)} trackColor={{ true: colors.success, false: colors.separator }} accessibilityLabel={p.label} />
                  </View>
                );
                return <CoachTarget key={p.key} active={needsFlip} padding={0}>{row}</CoachTarget>;
              })}
            </View>
            <SectionHeader title={`What ${name.split(" ")[0]}'s bar will show`} />
            <View style={styles.preview}>
              <MockTabBar activeTab={onlyRegister ? "pos" : previewTabs[0] ?? "menu"} tabs={previewTabs.length ? previewTabs : []} />
            </View>
            <Text style={styles.note}>{onlyRegister ? "POS only. Everything else is invisible to this account, not just locked." : "Turn everything off except POS to see a cashier's bar."}</Text>
          </>
        ) : null}
      </ScrollView>
      {isAdding ? (
        <MockSheet title="Add staff" hint="They sign in to this app with the password you set.">
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value="••••••••" editable={false} />
          <CoachTarget active={!tried}>
            <Button label="Create account" size="lg" onPress={() => { setIsAdding(false); setHasStaff(true); onTried(); }} />
          </CoachTarget>
        </MockSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  permRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.card },
  permRowGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  permTile: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" },
  permCopy: { flex: 1, gap: 2 },
  permLabel: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  permHint: { ...typography.caption, color: colors.textSecondary },
  preview: { borderRadius: radius.md, overflow: "hidden" },
  note: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  label: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  input: { height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.lg, ...typography.body, color: colors.textPrimary },
});
