import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, router, useRootNavigationState, type ErrorBoundaryProps } from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import { supabase } from "../lib/supabase";
import { registerForPushNotifications, ensureOrdersChannel } from "../lib/notifications";
import { CrashFallback } from "../components/CrashFallback";

/**
 * App-wide Error Boundary. expo-router automatically wraps the route tree with
 * a same-file `ErrorBoundary` export, so ANY uncaught render throw anywhere in
 * the app degrades to this recoverable screen instead of force-closing the
 * process. "Sign Out" clears the (possibly demo) session and returns to login.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // No session to clear (e.g. demo mode) — ignore.
    }
    useAuthStore.getState().clear();
    await retry();
  };
  return (
    <CrashFallback
      error={error}
      onRetry={() => {
        void retry();
      }}
      onSignOut={handleSignOut}
    />
  );
}

/**
 * Catch JS errors that escape React's render phase (async callbacks, event
 * handlers, native module callbacks). Without a handler these can terminate the
 * process in a release build; here we log them so failures are diagnosable.
 */
function useGlobalErrorHandler() {
  useEffect(() => {
    const g = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
        setGlobalHandler?: (h: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const eu = g.ErrorUtils;
    if (!eu?.setGlobalHandler) return;
    const previous = eu.getGlobalHandler?.();
    eu.setGlobalHandler((error, isFatal) => {
      console.error("[GlobalError]", isFatal ? "(fatal)" : "", error);
      // Preserve the dev red-box; in production swallow non-fatal JS errors so a
      // stray async throw cannot force-close the app.
      if (__DEV__ && previous) previous(error, isFatal);
    });
    return () => {
      if (previous) eu.setGlobalHandler?.(previous);
    };
  }, []);
}

function useAuthInit() {
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError || !data.session?.user) {
        setAuth({ isLoading: false });
        return;
      }

      try {
        const { data: appUser } = await supabase
          .from("app_users")
          .select("tenant_id")
          .eq("user_id", data.session.user.id)
          .in("role", ["admin", "superadmin"])
          .single();

        if (!appUser) {
          setAuth({ isLoading: false });
          return;
        }

        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, slug, name, convex_deployment_url")
          .eq("id", appUser.tenant_id)
          .single();

        if (!tenant) {
          setAuth({ isLoading: false });
          return;
        }

        setAuth({
          userId: data.session.user.id,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          convexUrl: tenant.convex_deployment_url ?? null,
          isLoading: false,
          isAuthenticated: true,
        });
      } catch {
        setAuth({ isLoading: false });
      }
    });
  }, [setAuth]);
}

function useAuthRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const rootNavigationState = useRootNavigationState();
  const navigatorReady = rootNavigationState?.key != null;

  useEffect(() => {
    if (isLoading || !navigatorReady) return;

    if (isAuthenticated) {
      router.replace("/(main)/dashboard");
    } else {
      router.replace("/(auth)/login");
    }
  }, [isLoading, isAuthenticated, convexUrl, navigatorReady]);
}

function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const convexUrl = useAuthStore((s) => s.convexUrl);

  // Create the ringtone channel as early as possible — before login — so the
  // first order's local alert can ring even if push registration hasn't run.
  useEffect(() => {
    ensureOrdersChannel().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !convexUrl) return;

    const userId = useAuthStore.getState().userId;
    if (!userId) return;

    registerForPushNotifications().then(async (token) => {
      if (!token) return;
      try {
        await fetch(`${convexUrl}/api/mutation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "notifications:registerPushToken",
            args: {
              userId,
              token,
              platform: Platform.OS === "ios" ? "ios" : "android",
            },
            format: "json",
          }),
        });
      } catch (e) {
        console.warn("Failed to register push token:", e);
      }
    }).catch((e) => {
      console.warn("Push notification registration failed:", e);
    });
  }, [isAuthenticated, convexUrl]);
}

export default function RootLayout() {
  useGlobalErrorHandler();
  useAuthInit();
  useAuthRedirect();
  usePushNotifications();

  // Load saved printer config on app start
  useEffect(() => {
    usePrinterStore.getState().loadSaved();
  }, []);

  return (
    <ConvexAuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
    </ConvexAuthProvider>
  );
}
