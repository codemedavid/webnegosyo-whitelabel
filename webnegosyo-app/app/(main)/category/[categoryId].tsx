/**
 * The editor for one menu section.
 *
 * It writes through `updateCategory`, which touches only the five columns this
 * app's form owns. `order`, `display_layout`, `card_template` and
 * `default_addons` are set on the web (the Branding Studio's Menu Layout) and
 * have no editor on a phone, so a whole-row save from here would quietly
 * flatten the merchant's storefront layout every time they renamed a section.
 *
 * Deleting is not destructive to dishes: `menu_items.category_id` is ON DELETE
 * SET NULL, so the dishes survive but land uncategorised. The confirmation says
 * how many, because "delete" reads like it takes the food with it.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import {
  buildCategoryEditorState,
  countProductsIn,
  createCategory,
  deleteCategory,
  getCategory,
  updateCategory,
  validateCategoryInput,
  EMPTY_CATEGORY_INPUT,
  type CategoryInput,
} from "../../../lib/categories";
import { useMenuCatalogCache } from "../../../lib/query/use-products";
import { notifyMenuRevalidate } from "../../../lib/menu-revalidate";
import { NEW_CATEGORY_ID, categoryHref } from "../../../lib/navigation";
import { goTo } from "../../../lib/tab-navigation";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { LoadingState } from "../../../components/LoadingState";
import { BackHeader } from "../../../components/BackHeader";
import { CategoryIcon } from "../../../components/CategoryIcon";
import { CategoryIconPicker } from "../../../components/CategoryIconPicker";

const PREVIEW_ICON_SIZE = 26;

export default function CategoryEditorScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const isNew = categoryId === NEW_CATEGORY_ID;
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const { invalidate: invalidateCatalog } = useMenuCatalogCache();

  const [form, setForm] = useState<CategoryInput>(EMPTY_CATEGORY_INPUT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPickingIcon, setIsPickingIcon] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        // Always through buildCategoryEditorState — the editor is reached from
        // a persistent tab tree, so the add path has to be a clean slate
        // rather than whichever category was open last.
        const loaded = isNew ? null : await getCategory(categoryId, tenantId);
        setForm(buildCategoryEditorState(loaded).form);
        setErrors({});
      } catch {
        setLoadError("Could not load this category.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tenantId, categoryId, isNew]);

  const updateField = <K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** True when this session may not write; alerts the merchant if so. */
  const blockedByDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  /** Everything downstream of a category write: the caches, then the storefront. */
  const publishMenuChange = () => {
    if (!tenantId) return;
    void invalidateCatalog(tenantId);
    if (tenantSlug) void notifyMenuRevalidate(tenantId, tenantSlug);
  };

  const handleSave = async () => {
    if (blockedByDemo()) return;
    if (!tenantId) return;

    const validation = validateCategoryInput(form);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      if (isNew) {
        const created = await createCategory(tenantId, form);
        publishMenuChange();
        // goTo, not router.replace: replacing into a route inside the tab
        // navigator renames its state key and remounts it, which crashes with
        // "Cannot read property 'stale' of undefined". See lib/tab-navigation.ts.
        goTo(router, categoryHref(created.id));
        Alert.alert("Saved", "Category added.");
      } else {
        await updateCategory(categoryId, tenantId, form);
        publishMenuChange();
        Alert.alert("Saved", "Category updated.");
        router.back();
      }
    } catch {
      Alert.alert("Error", "Could not save this category. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (blockedByDemo()) return;
    if (!tenantId) return;

    // Named before the merchant decides: the dishes survive a delete, but they
    // land uncategorised, and "delete" reads like it takes the food with it.
    let orphanCount = 0;
    try {
      orphanCount = await countProductsIn(categoryId, tenantId);
    } catch {
      Alert.alert("Error", "Could not check what is in this category.");
      return;
    }

    Alert.alert(
      "Delete category",
      orphanCount === 0
        ? "This section is empty. Delete it?"
        : `${orphanCount} product${orphanCount === 1 ? "" : "s"} will be left without a category and hidden from the menu until you move ${orphanCount === 1 ? "it" : "them"}. Delete anyway?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCategory(categoryId, tenantId);
              publishMenuChange();
              router.back();
            } catch {
              Alert.alert(
                "Could not delete",
                "Something is still using this category. Hide it instead.",
              );
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading category..." />;
  }

  return (
    <View style={styles.screen}>
      <BackHeader title={isNew ? "New category" : "Edit category"} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        <Card style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(v) => updateField("name", v)}
            placeholder="e.g. Rice meals"
            placeholderTextColor={colors.textTertiary}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.description}
            onChangeText={(v) => updateField("description", v)}
            placeholder="Optional — shown under the section heading"
            placeholderTextColor={colors.textTertiary}
            multiline
          />

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>Shown on the menu</Text>
              <Text style={styles.hint}>Off hides the whole section from customers</Text>
            </View>
            <Switch
              value={form.is_active}
              onValueChange={(v) => updateField("is_active", v)}
              trackColor={{ false: colors.separator, true: colors.success }}
            />
          </View>
        </Card>

        <Card title="Icon" style={styles.card}>
          <Text style={styles.hint}>
            Shown beside the section name everywhere customers see your menu.
          </Text>
          <TouchableOpacity
            style={styles.iconRow}
            onPress={() => setIsPickingIcon(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Choose an icon for this category"
          >
            <View style={styles.iconWell}>
              <CategoryIcon
                icon={form.icon}
                color={form.icon_color}
                size={PREVIEW_ICON_SIZE}
                fallback="placeholder"
              />
            </View>
            <Text style={styles.iconAction}>
              {form.icon ? "Change icon" : "Choose an icon"}
            </Text>
          </TouchableOpacity>
          {errors.icon && <Text style={styles.errorText}>{errors.icon}</Text>}
          {errors.icon_color && <Text style={styles.errorText}>{errors.icon_color}</Text>}
        </Card>

        <Button
          label="Save category"
          size="lg"
          onPress={handleSave}
          isLoading={isSaving}
        />

        {!isNew && (
          <Button
            label="Delete category"
            tone="danger"
            size="lg"
            onPress={handleDelete}
            style={styles.delete}
          />
        )}
      </ScrollView>

      <CategoryIconPicker
        visible={isPickingIcon}
        icon={form.icon}
        color={form.icon_color}
        onClose={() => setIsPickingIcon(false)}
        onApply={(icon, color) => {
          setForm((prev) => ({ ...prev, icon, icon_color: color }));
          setIsPickingIcon(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2 },
  card: { marginBottom: spacing.lg, ...shadow.sm },
  label: {
    ...typography.eyebrow,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  hint: { ...typography.caption, color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  switchText: { flex: 1 },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  iconWell: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  iconAction: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  delete: { marginTop: spacing.md },
});
