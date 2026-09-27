import { onlineManager } from "@tanstack/query-core";

/** Refresh imperative resources when the app's query layer reconnects. */
export function subscribeOnReconnect(refresh: () => void): () => void {
  return onlineManager.subscribe((online) => {
    if (online) refresh();
  });
}
