import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { captureIdPhoto, discardIdPhoto } from "../../../lib/gov-id-photos/capture";
import type { CapturedIdPhoto } from "../../../lib/gov-id-photos/types";

type Props = {
  claimantId: string;
  photo: CapturedIdPhoto | null;
  /** The photo already applied to the sale for this claimant, if any. */
  appliedPhoto: CapturedIdPhoto | null;
  onChange: (photo: CapturedIdPhoto | null) => void;
};

const CAPTURE_MESSAGES = {
  "permission-denied": "Camera access is off. You can skip the photo, or allow the camera in Settings.",
  "too-large": "That photo is too large to keep. Try again a little further from the card.",
  unavailable: "This phone can't take the photo right now. You can skip it — the ID number is enough.",
} as const;

/**
 * The optional photo of the ID. Never required: the name and number are
 * what the sales book needs, so the cashier can always just carry on.
 */
export function IdPhotoField({ claimantId, photo, appliedPhoto, onChange }: Props) {
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A photo taken in this draft and then replaced or removed is deleted at
  // once; the one already on the sale stays until the sale lets go of it.
  const discardDraftPhoto = async (current: CapturedIdPhoto | null) => {
    if (current && current.fileUri !== appliedPhoto?.fileUri) await discardIdPhoto(current.fileUri);
  };

  const take = async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      const outcome = await captureIdPhoto(claimantId);
      if (outcome.status === "captured") {
        await discardDraftPhoto(photo);
        onChange(outcome.photo);
      } else if (outcome.status !== "canceled") {
        setMessage(CAPTURE_MESSAGES[outcome.status]);
      }
    } catch {
      setMessage("The photo could not be saved. You can skip it — the ID number is enough.");
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async () => {
    await discardDraftPhoto(photo);
    onChange(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Photo of the ID (optional)</Text>
      {photo ? (
        <View style={styles.row}>
          <Image source={{ uri: photo.fileUri }} style={styles.thumb} alt="Photo of the ID" accessibilityLabel="Photo of the ID" />
          <View style={styles.actions}>
            <Button label="Retake" tone="secondary" size="sm" icon="photo" onPress={take} isLoading={isBusy} />
            <Button label="Remove" tone="ghost" size="sm" icon="trash" onPress={remove} disabled={isBusy} />
          </View>
        </View>
      ) : (
        <Button
          label="Take a photo of the ID"
          tone="secondary"
          size="sm"
          icon="photo"
          onPress={take}
          isLoading={isBusy}
          accessibilityHint="Optional. You can skip this and continue."
        />
      )}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Text style={styles.footnote}>
        You can skip this. Photos are private and deleted after 90 days.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: {
    width: 96,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  actions: { gap: spacing.xs },
  message: { ...typography.caption, color: colors.warning, fontWeight: "600" },
  footnote: { ...typography.caption, color: colors.textTertiary },
});
