import React, { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useAuthStore } from "../stores/auth-store";
import { DEMO_STORE } from "./demo";

interface ConvexAuthProviderProps {
  children: React.ReactNode;
}

// A single idle placeholder client used only when no tenant convexUrl is set
// yet (e.g. on the login screen, or for a tenant without a Convex deployment).
// It is created against a real, valid public deployment but stays disconnected:
// ConvexReactClient connects lazily on the first subscription, and every screen
// passes "skip" to useQuery while convexUrl is null, so no socket ever opens.
//
// Why it exists: previously this provider rendered `<>{children}</>` when there
// was no client and `<ConvexProvider>{children}</ConvexProvider>` once a URL
// arrived. That changes the element type wrapping the whole navigation tree, so
// React unmounts and REMOUNTS the entire Stack the instant convexUrl flips
// null -> URL. On "Explore Demo" that flip happens at the same moment we
// router.replace() to the dashboard, and remounting react-native-screens views
// mid-transition can hard-crash on iOS (the app simply "exits"). Keeping a
// ConvexProvider mounted at all times makes the tree shape stable — flipping
// convexUrl now only swaps the client prop, which re-subscribes queries without
// tearing down the navigation tree.
let placeholderClient: ConvexReactClient | null | undefined;
function getPlaceholderClient(): ConvexReactClient | null {
  if (placeholderClient !== undefined) return placeholderClient;
  try {
    placeholderClient = new ConvexReactClient(DEMO_STORE.convexUrl, {
      unsavedChangesWarning: false,
    });
  } catch (e) {
    console.warn("Failed to initialize placeholder Convex client:", e);
    placeholderClient = null;
  }
  return placeholderClient;
}

export function ConvexAuthProvider({ children }: ConvexAuthProviderProps) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const client = useMemo(() => {
    if (!convexUrl) return null;
    // A malformed or unreachable convex_deployment_url must never crash the
    // whole app — this provider wraps the entire navigation tree. Degrade
    // gracefully instead of throwing.
    try {
      return new ConvexReactClient(convexUrl, {
        unsavedChangesWarning: false,
      });
    } catch (e) {
      console.warn("Failed to initialize Convex client:", e);
      return null;
    }
  }, [convexUrl]);

  // Always render a ConvexProvider so the tree shape never changes (see note).
  const activeClient = client ?? getPlaceholderClient();

  if (!activeClient) {
    // Only reached if even the placeholder failed to construct — keep children
    // alive rather than crashing.
    return <>{children}</>;
  }

  return <ConvexProvider client={activeClient}>{children}</ConvexProvider>;
}
