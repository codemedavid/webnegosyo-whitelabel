import { ConvexReactClient } from "convex/react";

let client: ConvexReactClient | null = null;
let currentUrl: string | null = null;

export function getConvexClient(url: string): ConvexReactClient {
  if (!client || currentUrl !== url) {
    client = new ConvexReactClient(url, {
      unsavedChangesWarning: false,
    });
    currentUrl = url;
  }
  return client;
}
