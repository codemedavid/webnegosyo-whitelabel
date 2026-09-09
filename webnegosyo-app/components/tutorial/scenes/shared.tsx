import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Icon, TabIcon, type IconName } from "../../Icon";
import { getWorkspace, type WorkspaceKey } from "../../../lib/workspaces";
import { OFF_BAR_TABS } from "../../../lib/tab-visibility";
import { WORKSPACE_ICONS, tabLabel, tabPresentation } from "../../../lib/workspace-presentation";
import { useAuthStore } from "../../../stores/auth-store";
import { CoachTarget } from "../spotlight";

/**
 * The chrome every simulated screen shares, drawn to the same numbers as the
 * real thing: the dark tab bar the (main) layout draws, the view chip the
 * switcher draws, and the alerts and sheets the real screens raise. A scene
 * built from these plus the app's own cards is indistinguishable from the
 * screen it teaches — except that nothing here talks to a backend.
 */

export interface SceneProps {
  phase: string;
  tried: boolean;
  onTried: () => void;
}

/** The merchant's own store name, so the tour is set in their store. */
export function useSceneStoreName(): string {
  return useAuthStore((s) => s.tenantName) ?? "Your store";
}

/** Height of the real bar's icon + label rows, before the home inset. */
const TAB_BAR_CONTENT_HEIGHT = 56;

export function useMockTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, spacing.sm);
}

/** Full-screen scene ground with the mock bar pinned to the bottom. */
export function SceneFrame({
  workspace,
  activeTab,
  onTab,
  children,
  tone = "light",
}: {
  workspace: WorkspaceKey;
  activeTab: string;
  onTab?: (tab: string) => void;
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <View style={[styles.frame, tone === "dark" && styles.frameDark]}>
      <View style={styles.frameBody}>{children}</View>
      <MockTabBar workspace={workspace} activeTab={activeTab} onTab={onTab} />
    </View>
  );
}

export function MockTabBar({
  workspace,
  activeTab,
  onTab,
  tabs,
  targetTab,
}: {
  workspace: WorkspaceKey;
  activeTab: string;
  onTab?: (tab: string) => void;
  /** Overrides the view's tabs, e.g. a restricted staff preview. */
  tabs?: readonly string[];
  /** The one tab the spotlight should sit on. */
  targetTab?: string;
}) {
  const insets = useSafeAreaInsets();
  // The simulated bar has to match the real one, so it drops the same off-bar
  // screens the layout does (OFF_BAR_TABS) plus Scheduled, which the real bar
  // gates on a store setting the tour has no store to read.
  const shown = [
    ...(tabs ??
      getWorkspace(workspace).tabs.filter(
        (t) => !OFF_BAR_TABS.includes(t) && t !== "scheduled",
      )),
    "menu",
  ];
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {shown.map((tab) => {
        const isActive = tab === activeTab;
        const color = isActive ? colors.tabBarActive : colors.tabBarInactive;
        return (
          <CoachTarget key={tab} active={tab === targetTab} padding={2} style={styles.tab}>
            <TouchableOpacity
              style={styles.tabInner}
              onPress={onTab ? () => onTab(tab) : undefined}
              disabled={!onTab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tabLabel(tab)}
            >
              <TabIcon name={tabPresentation(tab).icon} color={color} />
              <Text style={[styles.tabLabel, { color }]}>{tabLabel(tab)}</Text>
            </TouchableOpacity>
          </CoachTarget>
        );
      })}
    </View>
  );
}

/** The view chip, exactly as the switcher draws it, minus the navigation. */
export function MockViewChip({ workspace, onPress }: { workspace: WorkspaceKey; onPress?: () => void }) {
  const active = getWorkspace(workspace);
  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Current view: ${active.label}. Change view`}
    >
      <Icon name={WORKSPACE_ICONS[workspace]} size={15} color={colors.textPrimary} />
      <Text style={styles.chipLabel}>{active.label}</Text>
      <Icon name="chevron-down" size={13} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

/** A native-looking alert, drawn in-scene so the spotlight can target it. */
export function MockAlert({
  title,
  message,
  actions,
}: {
  title: string;
  message: string;
  actions: { label: string; onPress?: () => void; tone?: "default" | "bold" | "destructive" }[];
}) {
  return (
    <View style={styles.alertBackdrop} pointerEvents="box-none">
      <View style={styles.alert}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertMessage}>{message}</Text>
        <View style={styles.alertActions}>
          {actions.map((a) => (
            <TouchableOpacity key={a.label} onPress={a.onPress} style={styles.alertAction} accessibilityRole="button" accessibilityLabel={a.label}>
              <Text style={[styles.alertActionText, a.tone === "bold" && styles.alertBold, a.tone === "destructive" && styles.alertDestructive]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

/** A bottom sheet drawn inside the scene (the real ones are Modals). */
export function MockSheet({ title, hint, children, style }: { title?: string; hint?: string; children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.sheetBackdrop} pointerEvents="box-none">
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }, style]}>
        <View style={styles.grabber} />
        {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
        {hint ? <Text style={styles.sheetHint}>{hint}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/** A green "it happened" toast, the way the real screens confirm a save. */
export function MockToast({ icon = "check", text }: { icon?: IconName; text: string }) {
  return (
    <View style={styles.toast}>
      <Icon name={icon} size={14} color={colors.textOnDark} strokeWidth={2.5} />
      <Text style={styles.toastText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.background },
  frameDark: { backgroundColor: colors.heroInk },
  frameBody: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.tabBar,
    borderTopColor: colors.tabBarBorder,
    borderTopWidth: 0.5,
    paddingTop: spacing.sm,
  },
  tab: { flex: 1 },
  tabInner: { alignItems: "center", paddingVertical: 2, gap: 2 },
  tabLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipLabel: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  alertBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  alert: { width: 270, backgroundColor: "#F2F2F2", borderRadius: 14, paddingTop: spacing.lg, alignItems: "center", overflow: "hidden" },
  alertTitle: { fontSize: 17, fontWeight: "600", color: "#000", textAlign: "center", paddingHorizontal: spacing.lg },
  alertMessage: { fontSize: 13, color: "#000", textAlign: "center", paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: spacing.lg, lineHeight: 18 },
  alertActions: { flexDirection: "row", alignSelf: "stretch", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#B4B4B4" },
  alertAction: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#B4B4B4" },
  alertActionText: { fontSize: 17, color: "#007AFF" },
  alertBold: { fontWeight: "600" },
  alertDestructive: { color: "#FF3B30" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm, ...shadow.md },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.separator, alignSelf: "center", marginBottom: spacing.sm },
  sheetTitle: { ...typography.heading, color: colors.textPrimary },
  sheetHint: { ...typography.caption, color: colors.textSecondary, marginTop: -4 },
  toast: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "center", backgroundColor: colors.success, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, ...shadow.md },
  toastText: { ...typography.caption, fontWeight: "700", color: colors.textOnDark },
});
