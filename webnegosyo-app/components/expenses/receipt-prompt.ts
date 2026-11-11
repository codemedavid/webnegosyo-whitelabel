import { Alert } from "react-native";

import { captureReceipt, describeCaptureOutcome, type CapturedReceipt } from "../../lib/expenses/receipt-files";

/**
 * "Add a receipt": take a photo or pick one, and replace or remove the one
 * already taken. Never blocks saving — a refusal is said and the sheet stays.
 */
export function promptForReceipt(current: CapturedReceipt | null, onChange: (next: CapturedReceipt | null) => void): void {
  const take = async (source: "camera" | "library") => {
    try {
      const outcome = await captureReceipt(source);
      if (outcome.status === "captured") {
        onChange(outcome.receipt);
        return;
      }
      const message = describeCaptureOutcome(outcome);
      if (message) Alert.alert("Receipt", message);
    } catch {
      Alert.alert("Receipt", "The photo could not be saved. Try again.");
    }
  };
  Alert.alert("Add a receipt", current ? "Replace the photo you took?" : undefined, [
    { text: "Take a photo", onPress: () => void take("camera") },
    { text: "Choose from gallery", onPress: () => void take("library") },
    ...(current ? [{ text: "Remove photo", style: "destructive" as const, onPress: () => onChange(null) }] : []),
    { text: "Cancel", style: "cancel" as const },
  ]);
}
