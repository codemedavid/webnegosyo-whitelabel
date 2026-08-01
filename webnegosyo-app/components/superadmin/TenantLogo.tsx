import React, { useState } from "react";
import { Image, StyleSheet, View, PixelRatio } from "react-native";
import { logoThumbUrl } from "../../lib/tenant-logo";
import { Monogram } from "./Monogram";
import { colors, radius } from "../../theme/colors";

interface TenantLogoProps {
  name: string;
  logoUrl: string | null | undefined;
  /** Stable colour seed for the monogram fallback. */
  seed?: string;
  size?: number;
}

/**
 * A restaurant's logo, falling back to its coloured monogram.
 *
 * The fallback also covers a *failed* load, not just a missing url — a dead
 * ImageKit link would otherwise leave a blank hole in the list, which reads as
 * a broken screen rather than a store without a logo.
 */
export function TenantLogo({ name, logoUrl, seed, size = 44 }: TenantLogoProps) {
  const [hasFailed, setHasFailed] = useState(false);

  // Ask the CDN for a copy at physical pixel size, not layout size, or the
  // logo looks soft on a retina panel.
  const source = logoThumbUrl(logoUrl, PixelRatio.getPixelSizeForLayoutSize(size));

  if (!source || hasFailed) {
    return <Monogram name={name} seed={seed} size={size} />;
  }

  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 3.2 },
      ]}
    >
      <Image
        source={{ uri: source }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setHasFailed(true)}
        alt={`${name} logo`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
  },
  image: { width: "100%", height: "100%" },
});
