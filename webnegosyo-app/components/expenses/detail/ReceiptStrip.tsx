import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ReceiptTile } from "../../../lib/expenses/expense-detail";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Icon } from "../../Icon";

interface ReceiptStripProps {
  tiles: readonly ReceiptTile[];
  /** Signed links still on their way. */
  isSigning: boolean;
  /** PDF being signed to open in the browser. */
  openingPdfId: string | null;
  canAdd: boolean;
  onAdd: () => void;
  /** A photo (uploaded or waiting) by its tile key. */
  onOpenPhoto: (key: string) => void;
  onOpenPdf: (receiptId: string) => void;
}

const TILE_W = 64;
const TILE_H = 84;

function TileBody({ tile, isSigning, isOpening }: { tile: ReceiptTile; isSigning: boolean; isOpening: boolean }) {
  if (tile.kind === "pdf") {
    return (
      <View style={styles.center}>
        {isOpening ? <ActivityIndicator color={colors.textPrimary} /> : <Icon name="document" size={22} color={colors.textPrimary} />}
        <Text style={styles.tileLabel}>PDF</Text>
      </View>
    );
  }
  const uri = tile.kind === "photo" ? tile.uri : tile.isPdf ? null : tile.uri;
  return (
    <>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" alt="" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.center}>
          {isSigning && tile.kind === "photo" ? <ActivityIndicator color={colors.textMuted} /> : <Icon name="photo" size={22} color={colors.textMuted} />}
        </View>
      )}
      {tile.kind === "waiting" ? (
        <View style={[styles.waiting, tile.refusedReason ? styles.refused : null]}>
          <Text style={styles.waitingText} numberOfLines={2}>
            {tile.refusedReason ? "Didn't upload" : "Waiting to upload"}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function tileLabel(tile: ReceiptTile, index: number): string {
  if (tile.kind === "waiting") return `Receipt ${index + 1}, ${tile.refusedReason ? "did not upload" : "waiting to upload"}`;
  return tile.kind === "pdf" ? `Receipt ${index + 1}, PDF` : `Receipt ${index + 1}`;
}

/**
 * Receipt thumbnails in a row, then "Add photo" for another. Tap a photo to
 * see it full screen. With none yet it just says so: the screen already
 * offers "Add receipt" in its bottom bar (and in the flag, when one is due).
 */
export function ReceiptStrip({ tiles, isSigning, openingPdfId, canAdd, onAdd, onOpenPhoto, onOpenPdf }: ReceiptStripProps) {
  if (tiles.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>No receipts yet.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {tiles.map((tile, index) => (
          <TouchableOpacity
            key={tile.key}
            style={styles.tile}
            onPress={() => (tile.kind === "pdf" ? onOpenPdf(tile.receiptId) : onOpenPhoto(tile.key))}
            disabled={(tile.kind === "waiting" && tile.isPdf) || openingPdfId !== null}
            accessibilityRole="button"
            accessibilityLabel={tileLabel(tile, index)}
            testID={`receipt-${tile.key}`}
          >
            <TileBody tile={tile} isSigning={isSigning} isOpening={tile.kind === "pdf" && openingPdfId === tile.receiptId} />
          </TouchableOpacity>
        ))}
        {canAdd ? (
          <TouchableOpacity style={[styles.tile, styles.add]} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add a receipt photo">
            <Icon name="plus" size={20} color={colors.textPrimary} />
            <Text style={styles.addText}>Add photo</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
  strip: { padding: spacing.md, gap: spacing.sm },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  tileLabel: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  waiting: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, paddingHorizontal: 4, paddingVertical: 3 },
  refused: { backgroundColor: colors.danger },
  waitingText: { ...typography.small, fontSize: 9, lineHeight: 11, fontWeight: "700", color: colors.textOnDark, textAlign: "center" },
  add: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.textTertiary,
  },
  addText: { ...typography.small, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  empty: { ...typography.body, color: colors.textMuted, padding: spacing.lg },
});
