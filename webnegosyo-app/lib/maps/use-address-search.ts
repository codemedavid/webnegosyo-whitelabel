/**
 * Type-ahead over `searchAddresses`: waits for a pause in typing, ignores
 * anything shorter than {@link MIN_QUERY_CHARS}, keeps only the newest answer
 * (a slow reply for "SM N" must never replace the one for "SM North"), and
 * remembers answers for the session so retyping costs no quota.
 */

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "../pos-checkout-fields";
import { searchAddresses, type AddressPlace } from "./address-search";

export const MIN_QUERY_CHARS = 3;
export const SEARCH_DEBOUNCE_MS = 350;
const MAX_CACHED_QUERIES = 50;

export type AddressSearchStatus = "idle" | "searching" | "done" | "offline" | "unavailable" | "busy";

export interface AddressSearchState {
  status: AddressSearchStatus;
  places: AddressPlace[];
}

const IDLE: AddressSearchState = { status: "idle", places: [] };
const cache = new Map<string, AddressPlace[]>();

function remember(key: string, places: AddressPlace[]): void {
  if (cache.size >= MAX_CACHED_QUERIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, places);
}

/**
 * @param query what the cashier has typed; pass "" to stop searching (e.g.
 *   right after a place was picked, so its own text does not search again).
 */
export function useAddressSearch(
  tenantId: string | null,
  query: string,
  near: LatLng | null,
): AddressSearchState {
  const [state, setState] = useState<AddressSearchState>(IDLE);
  const latest = useRef(0);
  const trimmed = query.trim();
  const nearKey = near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : "";

  useEffect(() => {
    const requestId = ++latest.current;
    if (!tenantId || trimmed.length < MIN_QUERY_CHARS) {
      setState(IDLE);
      return;
    }

    const key = `${tenantId}|${nearKey}|${trimmed.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached) {
      setState({ status: "done", places: cached });
      return;
    }

    setState((previous) => ({ status: "searching", places: previous.places }));
    const timer = setTimeout(() => {
      void searchAddresses(tenantId, trimmed, near).then((result) => {
        if (requestId !== latest.current) return;
        if (result.ok) {
          remember(key, result.value);
          setState({ status: "done", places: result.value });
        } else {
          setState({ status: result.reason, places: [] });
        }
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `near` is keyed by `nearKey`, so a new object for the same spot does not re-search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, trimmed, nearKey]);

  return state;
}

/** Test seam: forget every remembered search. */
export function clearAddressSearchCache(): void {
  cache.clear();
}
