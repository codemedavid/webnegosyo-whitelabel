import React, { useEffect, useState } from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "../../Icon";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { fetchMapPreviewUrl, googleMapsUrl } from "../../../lib/maps/address-search";
import type { LatLng } from "../../../lib/pos-checkout-fields";

const PREVIEW_HEIGHT = 140;
/** Widths are requested in steps so a re-layout by a pixel does not re-sign. */
const WIDTH_STEP = 40;
const MAX_WIDTH = 640;

const urlCache = new Map<string, string>();

interface MapPreviewProps {
  tenantId: string;
  location: LatLng;
  address: string;
}

/**
 * A picture of the pinned spot (Apple Maps snapshot, signed by the web app)
 * that opens Google Maps when tapped. A static image rather than a live map:
 * the app ships no native map module yet, and a picture is all a cashier needs
 * to confirm "yes, that's the place".
 *
 * Fails quietly to a plain pin row — the address text above it is the record.
 */
export function MapPreview({ tenantId, location, address }: MapPreviewProps) {
  const [width, setWidth] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  const requestWidth = Math.min(MAX_WIDTH, Math.ceil(width / WIDTH_STEP) * WIDTH_STEP);
  const key = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}|${requestWidth}`;

  useEffect(() => {
    if (requestWidth === 0) return;
    const cached = urlCache.get(key);
    if (cached) {
      setUrl(cached);
      setHasFailed(false);
      return;
    }

    let isCurrent = true;
    setUrl(null);
    setHasFailed(false);
    void fetchMapPreviewUrl(tenantId, location, { width: requestWidth, height: PREVIEW_HEIGHT }).then(
      (result) => {
        if (!isCurrent) return;
        if (result.ok) {
          urlCache.set(key, result.value);
          setUrl(result.value);
        } else {
          setHasFailed(true);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
    // `key` covers the location and the width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tenantId]);

  const mapsLink = googleMapsUrl(address, location);

  return (
    <TouchableOpacity
      style={styles.frame}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onPress={() => mapsLink && void Linking.openURL(mapsLink)}
      activeOpacity={0.85}
      accessibilityRole="link"
      accessibilityLabel="Map of the delivery address. Opens Google Maps."
    >
      {url && !hasFailed ? (
        <Image
          source={{ uri: url }}
          alt="Map of the delivery address"
          style={styles.image}
          resizeMode="cover"
          onError={() => setHasFailed(true)}
        />
      ) : (
        <View style={styles.placeholder}>
          <Icon name="pin" size={22} color={colors.textTertiary} />
          {hasFailed && <Text style={styles.placeholderText}>Map preview unavailable</Text>}
        </View>
      )}
      <View style={styles.badge}>
        <Icon name="external" size={13} color={colors.textPrimary} strokeWidth={2} />
        <Text style={styles.badgeText}>Google Maps</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: PREVIEW_HEIGHT,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  placeholderText: { ...typography.small, color: colors.textSecondary },
  badge: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
});
