import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { fetchIdPhotoLink } from "../../lib/gov-id-photos/link-client";

interface IdPhotoViewerProps {
  tenantId: string;
  photoId: string;
  claimantName: string;
}

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "shown"; url: string }
  | { status: "error"; message: string };

/**
 * "View ID photo" for a reviewer. The link is asked for only on a tap and
 * lasts 60 seconds; the server checks the reviewer may see it first.
 */
export function IdPhotoViewer({ tenantId, photoId, claimantName }: IdPhotoViewerProps) {
  const [state, setState] = useState<ViewState>({ status: "idle" });

  const open = async () => {
    setState({ status: "loading" });
    const result = await fetchIdPhotoLink(tenantId, photoId);
    setState(result.status === "ok" ? { status: "shown", url: result.url } : { status: "error", message: result.message });
  };

  if (state.status === "shown") {
    return (
      <View style={styles.wrap}>
        <Image
          source={{ uri: state.url, cache: "reload" }}
          style={styles.photo}
          resizeMode="contain"
          alt={`ID photo for ${claimantName}`}
          accessibilityLabel={`ID photo for ${claimantName}`}
        />
        <Text style={styles.note}>Private. Deleted automatically 90 days after it was taken.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Button
        label="View ID photo"
        tone="secondary"
        size="sm"
        icon="photo"
        onPress={() => void open()}
        isLoading={state.status === "loading"}
      />
      {state.status === "error" ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {state.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, paddingTop: spacing.sm },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  note: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
});
