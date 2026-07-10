// The app's view switcher. The merchant app is split into three focused
// views (Operations / Insights / Products); this compact control names the
// active one and opens a sheet to change it. Switching lands on the view's
// default tab, and the tab bar re-filters to that view's tabs only.
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
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { getWorkspace } from "../lib/workspaces";
import { allowedWorkspaces } from "../lib/staff-permissions";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useAuthStore } from "../stores/auth-store";

export function WorkspaceSwitcher() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const [isOpen, setIsOpen] = useState(false);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  // Restricted staff only see views holding at least one permitted tab.
  const visibleWorkspaces = allowedWorkspaces({ role, isOwner, permissions });
  const active = getWorkspace(workspace);

  const handleSelect = (key: typeof workspace) => {
    setIsOpen(false);
    if (key === workspace) return;
    setWorkspace(key);
    const target = visibleWorkspaces.find((w) => w.key === key);
    const landingTab = target?.defaultTab ?? getWorkspace(key).defaultTab;
    router.replace(`/(main)/${landingTab}` as never);
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
        <Text style={styles.triggerText}>{active.label}</Text>
        <Text style={styles.triggerChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Views</Text>
            {visibleWorkspaces.map((w) => {
              const isActive = w.key === workspace;
              return (
                <TouchableOpacity
                  key={w.key}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => handleSelect(w.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                      {w.label}
                    </Text>
                    <Text style={styles.optionDescription}>{w.description}</Text>
                  </View>
                  {isActive && <View style={styles.activeDot} />}
                </TouchableOpacity>
              );
            })}
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
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  triggerText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  triggerChevron: { fontSize: 10, color: colors.textSecondary },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(29,24,21,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
    ...shadow.md,
  },
  sheetTitle: { ...typography.eyebrow, color: colors.textSecondary, marginBottom: spacing.md },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  optionActive: { backgroundColor: colors.surfaceSubtle },
  optionText: { flex: 1 },
  optionLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  optionLabelActive: { color: colors.textPrimary },
  optionDescription: { ...typography.small, color: colors.textSecondary, marginTop: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
