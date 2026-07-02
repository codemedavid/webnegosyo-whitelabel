import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { useSafeQuery, useSafeMutation } from "../../../lib/hooks";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  validateProductInput,
  calculateMargin,
  type ProductInput,
  type Category,
} from "../../../lib/products";
import { supabase } from "../../../lib/supabase";
import { uploadProductImage } from "../../../lib/product-image-upload";
import { notifyMenuRevalidate } from "../../../lib/menu-revalidate";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { LoadingState } from "../../../components/LoadingState";
import { formatPeso } from "../../../lib/format";

const getCostRef = "productCosts:getCost" as unknown as FunctionReference<"query">;
const setCostRef = "productCosts:setCost" as unknown as FunctionReference<"mutation">;

interface CostRecord {
  costPrice: number;
}

const EMPTY_INPUT: ProductInput = {
  name: "",
  description: "",
  price: 0,
  discounted_price: null,
  image_url: "",
  category_id: "",
  is_available: true,
  is_featured: false,
};

export default function ProductEditorScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const isNew = productId === "new";
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ProductInput>(EMPTY_INPUT);
  const [priceText, setPriceText] = useState("");
  const [discountedPriceText, setDiscountedPriceText] = useState("");
  const [costText, setCostText] = useState("");
  const [isSavingCost, setIsSavingCost] = useState(false);

  const { data: costRecord } = useSafeQuery<CostRecord | null>(
    getCostRef,
    isNew ? "skip" : { menuItemId: productId }
  );
  const setCost = useSafeMutation(setCostRef);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const cats = await listCategories(tenantId);
      setCategories(cats);
      if (!isNew) {
        const { data } = await supabase
          .from("menu_items")
          .select("*")
          .eq("id", productId)
          .eq("tenant_id", tenantId)
          .single();
        if (data) {
          const loaded: ProductInput = {
            name: data.name ?? "",
            description: data.description ?? "",
            price: data.price ?? 0,
            discounted_price: data.discounted_price ?? null,
            image_url: data.image_url ?? "",
            category_id: data.category_id ?? "",
            is_available: data.is_available ?? true,
            is_featured: data.is_featured ?? false,
          };
          setForm(loaded);
          setPriceText(String(loaded.price));
          setDiscountedPriceText(loaded.discounted_price ? String(loaded.discounted_price) : "");
        }
      }
      setIsLoading(false);
    })();
  }, [tenantId, productId, isNew]);

  useEffect(() => {
    if (costRecord) setCostText(String(costRecord.costPrice));
  }, [costRecord]);

  const margin = useMemo(() => {
    const cost = parseFloat(costText);
    return calculateMargin(form.price, isNaN(cost) ? null : cost);
  }, [form.price, costText]);

  const updateField = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePickImage = async () => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to add a product image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsUploadingImage(true);
    try {
      const upload = await uploadProductImage({
        uri: asset.uri,
        fileName: asset.fileName ?? "product.jpg",
        mimeType: asset.mimeType ?? "image/jpeg",
      });
      updateField("image_url", upload.url);
    } catch {
      Alert.alert("Upload failed", "Could not upload the image. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (!tenantId) return;

    const price = parseFloat(priceText);
    const discountedPrice = discountedPriceText.trim() ? parseFloat(discountedPriceText) : null;
    const candidate: ProductInput = {
      ...form,
      price: isNaN(price) ? 0 : price,
      discounted_price: discountedPrice !== null && !isNaN(discountedPrice) ? discountedPrice : null,
    };

    const validation = validateProductInput(candidate);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      if (isNew) {
        const created = await createProduct(tenantId, candidate);
        router.replace({
          pathname: "/(main)/product/[productId]",
          params: { productId: created.id },
        });
      } else {
        await updateProduct(productId, tenantId, candidate);
      }
      if (tenantSlug) void notifyMenuRevalidate(tenantId, tenantSlug);
      Alert.alert("Saved", "Product saved successfully.");
      if (!isNew) router.back();
    } catch {
      Alert.alert("Error", "Could not save the product. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    Alert.alert("Delete product", "This cannot be undone. Delete this product?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!tenantId) return;
          try {
            await deleteProduct(productId, tenantId);
            if (tenantSlug) void notifyMenuRevalidate(tenantId, tenantSlug);
            router.back();
          } catch {
            Alert.alert("Error", "Could not delete the product.");
          }
        },
      },
    ]);
  };

  const handleSaveCost = async () => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    const cost = parseFloat(costText);
    if (isNaN(cost) || cost < 0) {
      Alert.alert("Invalid cost", "Enter a valid cost price (a number ≥ 0).");
      return;
    }
    setIsSavingCost(true);
    try {
      await setCost({ menuItemId: productId, costPrice: cost });
      Alert.alert("Saved", "Cost price saved.");
    } catch {
      Alert.alert("Error", "Could not save the cost price.");
    } finally {
      setIsSavingCost(false);
    }
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading product..." />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{isNew ? "New Product" : "Edit Product"}</Text>

      <TouchableOpacity style={styles.imagePicker} onPress={handlePickImage} activeOpacity={0.8}>
        {form.image_url ? (
          <Image source={{ uri: form.image_url }} style={styles.image} />
        ) : (
          <Text style={styles.imagePlaceholder}>{isUploadingImage ? "Uploading..." : "+ Add Photo"}</Text>
        )}
      </TouchableOpacity>

      <Card style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(v) => updateField("name", v)}
          placeholder="e.g. Iced Latte"
          placeholderTextColor={colors.textTertiary}
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={form.description}
          onChangeText={(v) => updateField("description", v)}
          placeholder="Describe this item"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
        {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Price (₱)</Text>
            <TextInput
              style={styles.input}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
            />
            {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Discounted Price</Text>
            <TextInput
              style={styles.input}
              value={discountedPriceText}
              onChangeText={setDiscountedPriceText}
              keyboardType="decimal-pad"
              placeholder="Optional"
              placeholderTextColor={colors.textTertiary}
            />
            {errors.discounted_price && <Text style={styles.errorText}>{errors.discounted_price}</Text>}
          </View>
        </View>

        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryPill,
                form.category_id === cat.id && styles.categoryPillActive,
              ]}
              onPress={() => updateField("category_id", cat.id)}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  form.category_id === cat.id && styles.categoryPillTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {errors.category_id && <Text style={styles.errorText}>{errors.category_id}</Text>}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Available</Text>
          <Switch
            value={form.is_available}
            onValueChange={(v) => updateField("is_available", v)}
            trackColor={{ false: colors.separator, true: colors.success }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Featured</Text>
          <Switch
            value={form.is_featured}
            onValueChange={(v) => updateField("is_featured", v)}
            trackColor={{ false: colors.separator, true: colors.primary }}
          />
        </View>
      </Card>

      {!isNew && (
        <Card title="Cost & Profit" style={styles.card}>
          <Text style={styles.label}>Cost Price (₱)</Text>
          <TextInput
            style={styles.input}
            value={costText}
            onChangeText={setCostText}
            keyboardType="decimal-pad"
            placeholder="What this item costs to make"
            placeholderTextColor={colors.textTertiary}
          />
          {margin && (
            <View style={styles.marginSummary}>
              <Text style={styles.marginText}>
                Profit: {formatPeso(margin.profit)}
                {margin.marginPercent !== null ? ` · ${margin.marginPercent.toFixed(1)}% margin` : ""}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.secondaryButton, isSavingCost && { opacity: 0.6 }]}
            onPress={handleSaveCost}
            disabled={isSavingCost}
          >
            <Text style={styles.secondaryButtonText}>
              {isSavingCost ? "Saving..." : "Save Cost"}
            </Text>
          </TouchableOpacity>
        </Card>
      )}

      <TouchableOpacity
        style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={isSaving}
      >
        <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save Product"}</Text>
      </TouchableOpacity>

      {!isNew && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete Product</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  imagePicker: {
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { ...typography.body, color: colors.textSecondary },
  card: { marginBottom: spacing.lg, ...shadow.sm },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  errorText: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  row: { flexDirection: "row", gap: spacing.md },
  rowItem: { flex: 1 },
  categoryScroll: { marginTop: spacing.xs },
  categoryPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.separator,
    marginRight: spacing.sm,
  },
  categoryPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryPillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  categoryPillTextActive: { color: "#FFFFFF" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  marginSummary: { marginTop: spacing.sm },
  marginText: { ...typography.caption, color: colors.textSecondary },
  secondaryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryButtonText: { ...typography.body, color: colors.primary, fontWeight: "700" },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonText: { ...typography.body, color: "#FFFFFF", fontWeight: "700" },
  deleteButton: { alignItems: "center", marginTop: spacing.lg },
  deleteButtonText: { ...typography.body, color: colors.danger, fontWeight: "600" },
});
