import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Icon } from "../../Icon";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { MapPreview } from "./MapPreview";
import {
  googleMapsUrl,
  placeAddressText,
  type AddressPlace,
} from "../../../lib/maps/address-search";
import { MIN_QUERY_CHARS, useAddressSearch } from "../../../lib/maps/use-address-search";
import type { LatLng } from "../../../lib/pos-checkout-fields";

interface AddressFieldProps {
  tenantId: string | null;
  address: string;
  location: LatLng | null;
  /** The store's pin, to rank nearby places first. */
  near: LatLng | null;
  onChange: (next: { address: string; location: LatLng | null }) => void;
}

const SEARCH_HINTS: Partial<Record<string, string>> = {
  offline: "No connection — the address is saved as typed.",
  unavailable: "Search isn't available — the address is saved as typed.",
  busy: "Searching too fast — pause a moment, or keep typing.",
};

/**
 * One box for the delivery address: type freely, or pick a suggestion to pin
 * the exact spot (which unlocks the map preview and the fee suggestion).
 *
 * Typing after a pick drops the pin — the text no longer describes that spot,
 * the same rule as the storefront's address field.
 */
export function AddressField({ tenantId, address, location, near, onChange }: AddressFieldProps) {
  // Searching only follows the cashier's own typing; a picked place's text
  // must not immediately search for itself.
  const [query, setQuery] = useState("");
  // The text a pick wrote. Adding to it ("…, Unit 5B, blue gate") keeps the
  // pin — that still describes the same spot — so nothing searches either.
  const [pickedText, setPickedText] = useState<string | null>(null);
  const search = useAddressSearch(tenantId, query, near);

  function handleType(next: string) {
    // A sheet reopened on a pinned sale has no pick in this session; its saved text counts.
    const base = pickedText ?? (location ? address : null);
    if (location && base !== null && next.startsWith(base)) {
      onChange({ address: next, location });
      return;
    }
    setPickedText(null);
    setQuery(next);
    onChange({ address: next, location: null });
  }

  function handlePick(place: AddressPlace) {
    const text = placeAddressText(place);
    setQuery("");
    setPickedText(text);
    Keyboard.dismiss();
    onChange({ address: text, location: place.location });
  }

  function handleClear() {
    setQuery("");
    setPickedText(null);
    onChange({ address: "", location: null });
  }

  const isOpen = query.trim().length >= MIN_QUERY_CHARS;
  const hint = isOpen ? SEARCH_HINTS[search.status] : undefined;
  const typedLink = !location ? googleMapsUrl(address, null) : null;

  return (
    <View>
      <View style={[styles.inputRow, location !== null && styles.inputRowPinned]}>
        <Icon
          name={location ? "pin" : "search"}
          size={18}
          color={location ? colors.accent : colors.textSecondary}
          strokeWidth={2}
        />
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={handleType}
          placeholder="Search a place or type the address"
          placeholderTextColor={colors.textTertiary}
          multiline
          autoCorrect={false}
          accessibilityLabel="Delivery address"
          accessibilityHint="Type to search. Pick a suggestion to pin it on the map."
        />
        {search.status === "searching" && isOpen ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : address !== "" ? (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Clear address"
          >
            <Icon name="close" size={16} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isOpen && search.places.length > 0 && (
        <View style={styles.suggestions} accessibilityRole="list">
          {search.places.map((place, index) => (
            <TouchableOpacity
              key={`${place.location.lat},${place.location.lng},${index}`}
              style={[styles.suggestion, index > 0 && styles.suggestionDivider]}
              onPress={() => handlePick(place)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${placeAddressText(place)}`}
            >
              <Icon name="pin" size={16} color={colors.textSecondary} />
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {place.name ?? place.address}
                </Text>
                {place.name && place.address ? (
                  <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                    {place.address}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isOpen && search.status === "done" && search.places.length === 0 && (
        <Text style={styles.hint}>No matches — the address is saved as typed.</Text>
      )}
      {hint && <Text style={styles.hint}>{hint}</Text>}

      {location && tenantId && !isOpen && (
        <View style={styles.preview}>
          <MapPreview tenantId={tenantId} location={location} address={address} />
        </View>
      )}

      {typedLink && !isOpen && (
        <TouchableOpacity
          style={styles.mapsLink}
          onPress={() => void Linking.openURL(typedLink)}
          accessibilityRole="link"
        >
          <Icon name="external" size={14} color={colors.textSecondary} strokeWidth={2} />
          <Text style={styles.mapsLinkText}>Check in Google Maps</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
  },
  inputRowPinned: { borderColor: colors.accent, backgroundColor: colors.card },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    maxHeight: 96,
  },
  suggestions: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  suggestionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  suggestionText: { flex: 1 },
  suggestionTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  suggestionSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  preview: { marginTop: spacing.sm },
  mapsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
  },
  mapsLinkText: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
});
