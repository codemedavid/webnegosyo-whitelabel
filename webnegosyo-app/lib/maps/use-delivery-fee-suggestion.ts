/**
 * The fee suggestion for a pinned delivery address: the store's ROAD-distance
 * quote from the web app, or — when it cannot be reached — the labelled
 * estimate (`pos-delivery-quote.ts`). Never both in turn: the box would show
 * one figure and then jump to another under the cashier's thumb, so while the
 * quote is on its way there is no suggestion, only `isCalculating`.
 */

import { useEffect, useMemo, useState } from "react";
import type { DeliveryPricingSetup, LatLng } from "../pos-checkout-fields";
import {
  canSuggestDeliveryFee,
  estimateDeliveryQuote,
  toSuggestion,
  type DeliveryFeeSuggestion,
  type RoadDeliveryQuote,
} from "../pos-delivery-quote";
import { fetchDeliveryQuote } from "./address-search";

const MAX_CACHED_QUOTES = 50;
const quoteCache = new Map<string, RoadDeliveryQuote>();

function remember(key: string, quote: RoadDeliveryQuote): void {
  if (quoteCache.size >= MAX_CACHED_QUOTES) {
    const oldest = quoteCache.keys().next().value;
    if (oldest !== undefined) quoteCache.delete(oldest);
  }
  quoteCache.set(key, quote);
}

export interface DeliveryFeeSuggestionState {
  suggestion: DeliveryFeeSuggestion | null;
  isCalculating: boolean;
}

type QuoteState =
  | { kind: "none" }
  | { kind: "calculating" }
  | { kind: "quote"; quote: RoadDeliveryQuote; isEstimate: boolean };

export function useDeliveryFeeSuggestion(
  tenantId: string | null,
  setup: DeliveryPricingSetup,
  location: LatLng | null,
  itemsSubtotal: number,
): DeliveryFeeSuggestionState {
  const [state, setState] = useState<QuoteState>({ kind: "none" });
  const canSuggest = tenantId !== null && canSuggestDeliveryFee(setup);
  const key = location && canSuggest ? `${tenantId}|${location.lat.toFixed(6)},${location.lng.toFixed(6)}` : null;

  useEffect(() => {
    if (!key || !location || !tenantId) {
      setState({ kind: "none" });
      return;
    }
    const cached = quoteCache.get(key);
    if (cached) {
      setState({ kind: "quote", quote: cached, isEstimate: false });
      return;
    }

    let isCurrent = true;
    setState({ kind: "calculating" });
    void fetchDeliveryQuote(tenantId, location).then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        remember(key, result.value);
        setState({ kind: "quote", quote: result.value, isEstimate: false });
        return;
      }
      const estimate = estimateDeliveryQuote(setup, location);
      setState(estimate ? { kind: "quote", quote: estimate, isEstimate: true } : { kind: "none" });
    });
    return () => {
      isCurrent = false;
    };
    // `key` covers the tenant and the location; the setup only feeds the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const suggestion = useMemo(
    () =>
      state.kind === "quote" ? toSuggestion(state.quote, setup, itemsSubtotal, state.isEstimate) : null,
    [state, setup, itemsSubtotal],
  );
  return { suggestion, isCalculating: state.kind === "calculating" };
}

/** Test seam: forget every remembered quote. */
export function clearDeliveryQuoteCache(): void {
  quoteCache.clear();
}
