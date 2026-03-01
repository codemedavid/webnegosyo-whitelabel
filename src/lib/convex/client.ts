import { ConvexReactClient } from "convex/react";

const clientCache = new Map<string, ConvexReactClient>();

export function getConvexClient(deploymentUrl: string): ConvexReactClient {
  if (!clientCache.has(deploymentUrl)) {
    clientCache.set(deploymentUrl, new ConvexReactClient(deploymentUrl));
  }
  return clientCache.get(deploymentUrl)!;
}
