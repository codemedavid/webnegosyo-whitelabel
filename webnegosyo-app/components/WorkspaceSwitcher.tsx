// The app's view switcher. The merchant app is split into focused views
// (Operations / Register / Insights / Products, plus Business for an account
// that runs several branches); this chip names the active one and opens a
// sheet to change it. Switching lands on the view's default tab, and the tab
// bar re-filters to that view's tabs only. The sheet lists only the views this
// account may see — see lib/portfolio-landing.ts — and, under each, the
// screens inside it, so a merchant can see what a view holds before switching.
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { getWorkspace, type WorkspaceKey } from "../lib/workspaces";
import { activeWorkspace, visibleWorkspaces } from "../lib/portfolio-landing";
import { usePortfolioAudience } from "../lib/use-portfolio-audience";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useAuthStore } from "../stores/auth-store";
import { goTo, type TabAwareRouter } from "../lib/tab-navigation";
import { WORKSPACE_ICONS, tabLabel } from "../lib/workspace-presentation";
import { Icon } from "./Icon";

export function WorkspaceSwitcher() {
  const storedWorkspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const [isOpen, setIsOpen] = useState(false);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const audience = usePortfolioAudience();
  const insets = useSafeAreaInsets();
  const caller = { role, isOwner, permissions };
  // Restricted staff only see views holding at least one permitted tab, and a
  // branch manager never sees Business — the view of the whole company.
  const views = visibleWorkspaces(caller, audience);
  // The stored view can outlive the right to see it (a persisted selection, a
  // handed-over device), so the label names what the tab bar is showing.
  const workspace = activeWorkspace(storedWorkspace, caller, audience);
  const active = getWorkspace(workspace);

  const handleSelect = (key: WorkspaceKey) => {
    setIsOpen(false);
    if (key === workspace) return;
    setWorkspace(key);
    const target = views.find((w) => w.key === key);
    const landingTab = target?.defaultTab ?? getWorkspace(key).defaultTab;
    // navigate, not replace: replacing into a sibling tab renames the tab
    // navigator's state key and remounts it mid-switch, which crashes with
    // "Cannot read property 'stale' of undefined". See lib/tab-navigation.ts.
    //
    // The cast is expo-router's typed-routes limitation, not a soundness hole:
    // its generated Href union lists every tab literally, so a computed
    // `/(main)/${tab}` template never matches. Every landingTab comes from the
    // workspace registry, so the route always exists.
    goTo(
      router as TabAwareRouter<`/(main)/${string}`>,
      `/(main)/${landingTab}`,
    );
  };

  const openMenu = () => {
    setIsOpen(false);
    goTo(router as TabAwareRouter<`/(main)/${string}`>, "/(main)/menu");
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Current view: ${active.label}. Change view`}
      >
        <Icon name={WORKSPACE_ICONS[workspace]} size={16} color={colors.textPrimary} />
        <Text style={styles.triggerText}>{active.label}</Text>
        <Icon name="chevron-down" size={12} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsOpen(false)}
          accessibilityLabel="Close view picker"
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Switch view</Text>
            <Text style={styles.sheetHint}>
              Each view keeps its own tabs at the bottom of the screen.
            </Text>
            {views.map((w) => {
              const isActive = w.key === workspace;
              const inside = w.tabs.map(tabLabel).join(" · ");
              return (
                <TouchableOpacity
                  key={w.key}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => handleSelect(w.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Switch to ${w.label}`}
                  accessibilityHint={w.description}
                >
                  <View style={[styles.tile, isActive && styles.tileActive]}>
                    <Icon
                      name={WORKSPACE_ICONS[w.key]}
                      size={20}
                      color={isActive ? colors.textOnDark : colors.textPrimary}
                    />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{w.label}</Text>
                    <Text style={styles.optionDescription} numberOfLines={1}>
                      {w.description}
                    </Text>
                    <Text style={styles.optionTabs} numberOfLines={1}>
                      {inside}
                    </Text>
                  </View>
                  {isActive ? (
                    <Icon name="check" size={18} color={colors.textPrimary} />
                  ) : (
                    <Icon name="chevron" size={16} color={colors.textTertiary} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.menuLink}
              onPress={openMenu}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open the full menu"
            >
              <Icon name="menu" size={16} color={colors.textPrimary} />
              <Text style={styles.menuLinkText}>See every screen in Menu</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  triggerText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(29,24,21,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...shadow.md,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.separator,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.heading,
    fontSize: 20,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
  },
  sheetHint: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  optionActive: { backgroundColor: colors.surfaceSubtle },
  tile: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tileActive: { backgroundColor: colors.primary },
  optionText: { flex: 1 },
  optionLabel: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  optionDescription: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  optionTabs: { ...typography.small, color: colors.textTertiary, marginTop: 3 },
  menuLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 48,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  menuLinkText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});
