import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "../Button";
import { formatPeso } from "../../lib/format";
import type { DeleteOrdersFlowState } from "../../lib/order-deletion/use-delete-orders-flow";
import { colors } from "../../theme/colors";
import { CheckRow } from "./CheckRow";
import { deletionStyles as styles } from "./styles";

// Mirrors src/lib/order-deletion/constants.ts (the server enforces both;
// these only word the copy). Change them together.
const RECOVERY_DAYS = 7;
const EXPORT_TTL_MINUTES = 30;

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
}

export function ExportStep({ flow }: { flow: DeleteOrdersFlowState }) {
  const preview = flow.preview;
  if (!preview) return null;
  return (
    <View style={styles.panel}>
      <View style={styles.statGrid}>
        <View style={styles.stat}>
          <Text style={styles.caption}>Orders</Text>
          <Text style={styles.statValue}>{preview.orderCount}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.caption}>Sales total</Text>
          <Text style={styles.statValue}>{formatPeso(preview.orderTotal)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.caption}>Oldest</Text>
          <Text style={styles.body}>{day(preview.earliest)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.caption}>Newest</Text>
          <Text style={styles.body}>{day(preview.latest)}</Text>
        </View>
      </View>
      {preview.activeCount > 0 && (
        <Text style={[styles.caption, { color: colors.danger }]}>
          {preview.activeCount} of these are still in progress.
        </Text>
      )}
      <Text style={styles.caption}>
        Save a copy first — it is the only way to continue, and after {RECOVERY_DAYS} days it is the only copy
        left. Choose Files, Drive or email in the share sheet.
      </Text>
      <Button
        label={`Save ${preview.orderCount} orders (CSV)`}
        icon="export"
        onPress={flow.exportAndShare}
        isLoading={flow.isBusy}
        fullWidth
      />
    </View>
  );
}

export function ConfirmStep({ flow, storeName }: { flow: DeleteOrdersFlowState; storeName: string }) {
  const [hasSavedFile, setHasSavedFile] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const exported = flow.exported;
  if (!exported) return null;

  const canDelete = hasSavedFile && confirmation.trim() !== "" && password !== "" && !flow.isBusy;
  const submit = () => {
    void flow.confirm(password, confirmation).then(() => setPassword(""));
  };

  return (
    <View style={[styles.panel, styles.dangerPanel]}>
      <Text style={styles.caption}>
        Saved {exported.fileName} with {exported.orderCount} orders ({formatPeso(exported.orderTotal)}). Only
        those orders will be deleted — any that change before you confirm are kept. Valid for{" "}
        {EXPORT_TTL_MINUTES} minutes.
      </Text>
      <CheckRow
        isChecked={hasSavedFile}
        onToggle={() => setHasSavedFile(!hasSavedFile)}
        label="I have kept the file somewhere safe"
      />
      <Text style={styles.body}>
        Type <Text style={{ fontWeight: "700" }}>{storeName}</Text> to confirm
      </Text>
      <TextInput
        style={styles.input}
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Store name"
      />
      <Text style={styles.body}>Your password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        accessibilityLabel="Your password"
      />
      <Button
        label={`Delete ${exported.orderCount} orders`}
        tone="danger"
        icon="trash"
        onPress={submit}
        isLoading={flow.isBusy}
        disabled={!canDelete}
        fullWidth
      />
    </View>
  );
}

export function DoneStep({ flow }: { flow: DeleteOrdersFlowState }) {
  const result = flow.result;
  if (!result) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>
        {result.deleted} order{result.deleted === 1 ? "" : "s"} deleted ({formatPeso(result.total)})
      </Text>
      {result.skipped > 0 && (
        <Text style={styles.caption}>
          {result.skipped} were kept because they changed after your export or belong to a loyalty settlement.
        </Text>
      )}
      <Text style={styles.caption}>
        Restore them from the history below until {day(result.purgeAfter)}. After that they are erased.
      </Text>
      <Button label="Done" tone="secondary" onPress={flow.startOver} fullWidth />
    </View>
  );
}
