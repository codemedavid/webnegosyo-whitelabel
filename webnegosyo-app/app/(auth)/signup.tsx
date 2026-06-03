import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { colors, typography, radius, spacing } from "../../theme/colors";

export default function SignupScreen() {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!businessName.trim() || !contactName.trim() || !email.trim()) {
      Alert.alert(
        "Missing details",
        "Please enter your business name, your name, and an email."
      );
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from("app_signup_requests").insert({
        business_name: businessName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        business_type: businessType.trim() || null,
        message: message.trim() || null,
        source: "merchant_app",
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Something went wrong";
      Alert.alert("Could not submit", msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={[styles.container, styles.successContainer]}>
        <Text style={styles.successCheck}>✓</Text>
        <Text style={styles.successTitle}>Request received!</Text>
        <Text style={styles.successBody}>
          Thanks for your interest in WebNegosyo. Our team will reach out by
          email to set up your store. In the meantime, you can explore the demo
          to see how it works.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/(auth)/login")}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create your store</Text>
          <Text style={styles.subtitle}>
            WebNegosyo is open to any food or retail business. Tell us about
            yours and we&apos;ll get you set up.
          </Text>
        </View>

        <View style={styles.form}>
          <Field
            label="Business name *"
            placeholder="e.g. Maria's Cafe"
            value={businessName}
            onChangeText={setBusinessName}
          />
          <Field
            label="Your name *"
            placeholder="e.g. Maria Santos"
            value={contactName}
            onChangeText={setContactName}
          />
          <Field
            label="Email *"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Phone"
            placeholder="Optional"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Field
            label="Business type"
            placeholder="Cafe, restaurant, bakery, retail…"
            value={businessType}
            onChangeText={setBusinessType}
          />
          <Field
            label="Anything else?"
            placeholder="Optional message"
            value={message}
            onChangeText={setMessage}
            multiline
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Submit request</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline]}
        placeholderTextColor={colors.textTertiary}
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 32, paddingTop: 64 },
  header: { marginBottom: spacing.xl ?? 32 },
  title: { fontSize: 26, fontWeight: "700", color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  form: { gap: spacing.lg },
  inputGroup: { gap: spacing.xs },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "500",
    marginLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  backLink: { alignItems: "center", paddingVertical: spacing.sm },
  backText: { ...typography.body, color: colors.textSecondary },
  successContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  successCheck: {
    fontSize: 56,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  successBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl ?? 32,
  },
});
