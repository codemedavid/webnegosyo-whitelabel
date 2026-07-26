import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/auth-store";
import { enterTenant } from "../../../lib/impersonation";
import {
  FEATURE_TOGGLES,
  TENANT_EDITOR_TABS,
  applyFeatureToggle,
  toFormValues,
  toUpdatePayload,
  validateTenantForm,
  type TenantEditorRow,
  type TenantFormErrors,
  type TenantFormValues,
} from "../../../lib/tenant-form";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import {
  colors,
  typography,
  radius,
  spacing,
  shadow,
} from "../../../theme/colors";

const EDITOR_COLUMNS =
  "id, name, slug, is_active, messenger_page_id, messenger_username, messenger_redirect_mode, mapbox_enabled, enable_order_management, menu_engineering_enabled, checkout_upsell_enabled, hide_currency_symbol, flash_screen_feature_enabled, bundles_enabled, pairing_rules_enabled, qr_handoff_enabled, app_enabled, restaurant_address, restaurant_latitude, restaurant_longitude, lalamove_enabled, lalamove_api_key, lalamove_secret_key, lalamove_market, lalamove_service_type, lalamove_sandbox, lalamove_sender_phone, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, convex_deployment_url, convex_deploy_key, admin_email, email_notifications_enabled";

interface StaffRow {
  user_id: string;
  role: string | null;
  is_owner: boolean | null;
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  keyboardType,
  autoCapitalize = "sentences",
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  autoCapitalize?: "none" | "sentences";
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleDisabled]}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

export default function TenantEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantEditorRow | null>(null);
  const [values, setValues] = useState<TenantFormValues | null>(null);
  const [errors, setErrors] = useState<TenantFormErrors>({});
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [tab, setTab] = useState<string>("general");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("tenants")
      .select(EDITOR_COLUMNS)
      .eq("id", id)
      .single();

    if (error || !data) {
      setLoadError(error?.message ?? "Restaurant not found");
      return;
    }

    const row = data as unknown as TenantEditorRow;
    setLoadError(null);
    setTenant(row);
    setValues(toFormValues(row));

    const { data: staffRows } = await supabase
      .from("app_users")
      .select("user_id, role, is_owner")
      .eq("tenant_id", id);
    setStaff((staffRows ?? []) as StaffRow[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: keyof TenantFormValues, next: string) => {
    setValues((current) => (current ? { ...current, [key]: next } : current));
  };

  const handleSave = async () => {
    if (!values) return;

    const found = validateTenantForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      Alert.alert("Check the form", "Some fields need attention before saving.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update(toUpdatePayload(values))
      .eq("id", id);
    setIsSaving(false);

    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }
    Alert.alert("Saved", "Restaurant updated.");
    void load();
  };

  const handleOpenAsMerchant = () => {
    if (!tenant) return;
    useAuthStore.getState().setAuth(
      enterTenant(useAuthStore.getState(), {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        convex_deployment_url: tenant.convex_deployment_url,
      })
    );
    router.replace("/(main)/dashboard");
  };

  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;
  if (!values || !tenant) return <LoadingState fullScreen message="Loading restaurant…" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Restaurant</Text>
      <Text style={styles.title}>{tenant.name}</Text>
      <Text style={styles.subtitle}>/{tenant.slug}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tabRow}>
          {TENANT_EDITOR_TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {tab === "general" ? (
        <View style={styles.card}>
          <Field
            label="Name"
            value={values.name}
            onChange={(v) => setField("name", v)}
            error={errors.name}
          />
          <Field
            label="Slug"
            value={values.slug}
            onChange={(v) => setField("slug", v)}
            error={errors.slug}
            autoCapitalize="none"
            placeholder="corner-grill"
          />
          <Field
            label="Restaurant address"
            value={values.restaurant_address}
            onChange={(v) => setField("restaurant_address", v)}
            error={errors.restaurant_address}
          />
          <Field
            label="Latitude"
            value={values.restaurant_latitude}
            onChange={(v) => setField("restaurant_latitude", v)}
            error={errors.restaurant_latitude}
            keyboardType="numeric"
          />
          <Field
            label="Longitude"
            value={values.restaurant_longitude}
            onChange={(v) => setField("restaurant_longitude", v)}
            error={errors.restaurant_longitude}
            keyboardType="numeric"
          />
        </View>
      ) : null}

      {tab === "features" ? (
        <View style={styles.card}>
          {FEATURE_TOGGLES.map((toggle) => {
            const blocked = toggle.requires ? !values[toggle.requires] : false;
            return (
              <ToggleRow
                key={toggle.key}
                label={toggle.label}
                description={
                  blocked
                    ? `Requires ${
                        FEATURE_TOGGLES.find((f) => f.key === toggle.requires)
                          ?.label ?? toggle.requires
                      }`
                    : toggle.description
                }
                value={values[toggle.key]}
                disabled={blocked}
                onChange={(next) =>
                  setValues((current) =>
                    current ? applyFeatureToggle(current, toggle.key, next) : current
                  )
                }
              />
            );
          })}
        </View>
      ) : null}

      {tab === "integrations" ? (
        <View style={styles.card}>
          <Field
            label="Messenger page ID"
            value={values.messenger_page_id}
            onChange={(v) => setField("messenger_page_id", v)}
            autoCapitalize="none"
          />
          <Field
            label="Messenger username"
            value={values.messenger_username}
            onChange={(v) => setField("messenger_username", v)}
            autoCapitalize="none"
          />
          <Field
            label="Convex deployment URL"
            value={values.convex_deployment_url}
            onChange={(v) => setField("convex_deployment_url", v)}
            autoCapitalize="none"
            placeholder="https://….convex.cloud"
          />
          <Field
            label="Convex deploy key"
            value={values.convex_deploy_key}
            onChange={(v) => setField("convex_deploy_key", v)}
            autoCapitalize="none"
            secureTextEntry
          />
          <Field
            label="Admin email"
            value={values.admin_email}
            onChange={(v) => setField("admin_email", v)}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <ToggleRow
            label="Email notifications"
            description="Email the admin on each new order"
            value={values.email_notifications_enabled}
            onChange={(next) =>
              setValues((c) =>
                c ? { ...c, email_notifications_enabled: next } : c
              )
            }
          />
        </View>
      ) : null}

      {tab === "delivery" ? (
        <View style={styles.card}>
          <ToggleRow
            label="Lalamove"
            description="Book couriers through Lalamove"
            value={values.lalamove_enabled}
            onChange={(next) =>
              setValues((c) => (c ? { ...c, lalamove_enabled: next } : c))
            }
          />
          {values.lalamove_enabled ? (
            <>
              <Field
                label="Lalamove API key"
                value={values.lalamove_api_key}
                onChange={(v) => setField("lalamove_api_key", v)}
                error={errors.lalamove_api_key}
                autoCapitalize="none"
                secureTextEntry
              />
              <Field
                label="Lalamove secret key"
                value={values.lalamove_secret_key}
                onChange={(v) => setField("lalamove_secret_key", v)}
                error={errors.lalamove_secret_key}
                autoCapitalize="none"
                secureTextEntry
              />
              <Field
                label="Market"
                value={values.lalamove_market}
                onChange={(v) => setField("lalamove_market", v)}
                autoCapitalize="none"
                placeholder="PH"
              />
              <Field
                label="Sender phone"
                value={values.lalamove_sender_phone}
                onChange={(v) => setField("lalamove_sender_phone", v)}
                autoCapitalize="none"
              />
              <ToggleRow
                label="Sandbox"
                description="Use the Lalamove sandbox environment"
                value={values.lalamove_sandbox}
                onChange={(next) =>
                  setValues((c) => (c ? { ...c, lalamove_sandbox: next } : c))
                }
              />
            </>
          ) : null}

          <ToggleRow
            label="Distance-based fee"
            description="Charge by distance when Lalamove is off"
            value={values.distance_delivery_enabled}
            onChange={(next) =>
              setValues((c) =>
                c ? { ...c, distance_delivery_enabled: next } : c
              )
            }
          />
          {values.distance_delivery_enabled ? (
            <>
              <Field
                label="Price per km"
                value={values.delivery_price_per_km}
                onChange={(v) => setField("delivery_price_per_km", v)}
                error={errors.delivery_price_per_km}
                keyboardType="numeric"
              />
              <Field
                label="Minimum fee"
                value={values.delivery_min_fee}
                onChange={(v) => setField("delivery_min_fee", v)}
                error={errors.delivery_min_fee}
                keyboardType="numeric"
              />
              <Field
                label="Delivery radius (km)"
                value={values.delivery_radius_km}
                onChange={(v) => setField("delivery_radius_km", v)}
                error={errors.delivery_radius_km}
                keyboardType="numeric"
              />
            </>
          ) : null}
        </View>
      ) : null}

      {tab === "team" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Team</Text>
          {staff.length === 0 ? (
            <Text style={styles.muted}>No team members yet.</Text>
          ) : (
            staff.map((member) => (
              <View key={member.user_id} style={styles.staffRow}>
                <Text style={styles.staffId} numberOfLines={1}>
                  {member.user_id}
                </Text>
                <Text style={styles.staffRole}>
                  {member.is_owner ? "Owner" : member.role ?? "staff"}
                </Text>
              </View>
            ))
          )}
          <Text style={styles.note}>
            Adding, removing and password resets need the service-role bridge —
            use the web console for now.
          </Text>
        </View>
      ) : null}

      {tab === "import" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bulk menu import</Text>
          <Text style={styles.note}>
            AI menu parsing runs server-side and needs the superadmin API
            bridge — use the web console for now.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <Text style={styles.saveButtonText}>
          {isSaving ? "Saving…" : "Save changes"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={handleOpenAsMerchant}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>Open as merchant</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.small, color: colors.textTertiary },
  tabRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  tabTextActive: { color: colors.textOnDark },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  field: { gap: spacing.xs },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { ...typography.small, color: colors.danger },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleDisabled: { opacity: 0.5 },
  toggleText: { flex: 1 },
  toggleLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  toggleDescription: { ...typography.small, color: colors.textTertiary },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textTertiary },
  note: {
    ...typography.small,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  staffRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  staffId: { ...typography.small, color: colors.textSecondary, flex: 1 },
  staffRole: { ...typography.small, color: colors.textPrimary, fontWeight: "700" },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
});
