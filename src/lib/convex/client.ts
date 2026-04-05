// Convex client is now created per-component via SafeConvexProvider.
// This file is kept for backward compatibility but the cached singleton
// pattern has been removed to prevent stale WebSocket connections from
// throwing errors after navigation.

import { ConvexReactClient } from "convex/react";

export function getConvexClient(deploymentUrl: string): ConvexReactClient {
  return new ConvexReactClient(deploymentUrl);
}
