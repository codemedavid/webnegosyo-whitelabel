import { useEffect } from "react";
import { InteractionManager, Platform } from "react-native";
import {
  Stack,
  router,
  useRootNavigationState,
  useSegments,
  type ErrorBoundaryProps,
} from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { useAuthStore } from "../stores/auth-store";
import {
  MERCHANT_LANDING_HREF,
  SUPERADMIN_LANDING_HREF,
  needsTenantLookup,
  needsOutletLookup,
  type OutletRow,
  resolveSession,
  type TenantRow,
} from "../lib/session-resolve";
import { usePrinterStore } from "../stores/printer-store";
import { supabase } from "../lib/supabase";
import { registerForPushNotifications, ensureOrdersChannel } from "../lib/notifications";
import {
  shouldRegisterPushToken,
  pushTokenCleanup,
} from "../lib/push-registration";
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
          .select("tenant_id, role, is_owner, permissions, outlet_id")
          .eq("user_id", data.session.user.id)
          .in("role", ["admin", "superadmin"])
          .single();

        if (!appUser) {
          setAuth({ isLoading: false });
          return;
        }

        // A superadmin owns no tenant (tenant_id is NULL), so skip the lookup —
        // querying by a null id would miss and read as a failed sign-in.
        let tenant: TenantRow | null = null;
        if (needsTenantLookup(appUser)) {
          const { data: tenantRow } = await supabase
            .from("tenants")
            .select("id, slug, name, convex_deployment_url, order_backend")
            .eq("id", appUser.tenant_id)
            .single();
          tenant = (tenantRow as TenantRow | null) ?? null;
        }

        // Branch-confined accounts carry their branch onto the session; the
        // name is snapshotted onto counter sales, so it is read here once.
        let outlet: OutletRow | null = null;
        if (appUser && needsOutletLookup(appUser)) {
          const { data: outletRow } = await supabase
            .from("outlets")
            .select("id, name")
            .eq("id", appUser.outlet_id)
            .single();
          outlet = (outletRow as OutletRow | null) ?? null;
        }

        const session = resolveSession(data.session.user.id, appUser, tenant, outlet);

        if (session.mode === "denied" || !session.auth) {
          setAuth({ isLoading: false });
          return;
        }

        setAuth(session.auth);
      } catch {
        setAuth({ isLoading: false });
      }
    });
  }, [setAuth]);
}

function useAuthRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);

  const rootNavigationState = useRootNavigationState();
  const navigatorReady = rootNavigationState?.key != null;

  // Which group we are already in, so a redirect only fires when it changes
  // something. Re-dispatching router.replace("/(main)/...") while already on
  // (main) remounts the tab navigator with a fresh, state-less route while its
  // nested params are already marked consumed — react-navigation then calls
  // TabRouter.getRehydratedState(undefined) and throws
  // "Cannot read property 'stale' of undefined".
  const group = useSegments()[0];

  useEffect(() => {
    if (isLoading || !navigatorReady) return;

    if (isAuthenticated) {
      // A superadmin belongs on the platform surface — unless they have opened
      // a tenant, in which case the merchant tree is exactly where they want
      // to be and this must not yank them back out.
      const wantsPlatform = isSuperadmin && impersonatedTenantId === null;
      const wantedGroup = wantsPlatform ? "(superadmin)" : "(main)";
      if (group !== wantedGroup) {
        router.replace(
          wantsPlatform ? SUPERADMIN_LANDING_HREF : MERCHANT_LANDING_HREF
        );
      }
      return;
    }
    if (group !== "(auth)") router.replace("/(auth)/login");
  }, [
    isLoading,
    isAuthenticated,
    navigatorReady,
    group,
    isSuperadmin,
    impersonatedTenantId,
  ]);
}

function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);

  // Create the ringtone channel as early as possible — before login — so the
  // first order's local alert can ring even if push registration hasn't run.
  useEffect(() => {
    ensureOrdersChannel().catch(() => {});
  }, []);

  useEffect(() => {
    const userId = useAuthStore.getState().userId;
    const session = {
      isAuthenticated,
      userId,
      convexUrl,
      isSuperadmin,
      impersonatedTenantId,
    };

    // A superadmin viewing someone else's store is a spectator: never subscribe
    // them to that store's order alerts, and drop any token an earlier build
    // left behind in that deployment.
    const stale = pushTokenCleanup(session);
    if (stale) {
      fetch(`${stale.convexUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "notifications:removePushToken",
          args: { userId: stale.userId },
          format: "json",
        }),
      }).catch(() => {});
    }

    if (!shouldRegisterPushToken(session) || !userId || !convexUrl) return;

    // registerForPushNotifications() presents a native OS permission prompt
    // (UIAlertController on iOS). Firing it in the same tick as the
    // post-login router.replace() races the UINavigationController's
    // setViewControllers transition — on iPad this "unbalanced appearance
    // transition" silently terminates the app (no crash log, matches Apple
    // review report of app quitting on login with real credentials, since the
    // read-only demo path has no userId and never reaches this effect).
    // InteractionManager defers the prompt until the navigation transition
    // and any other queued interactions have finished.
    const task = InteractionManager.runAfterInteractions(() => {
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
    });

    return () => task.cancel();
  }, [isAuthenticated, convexUrl, isSuperadmin, impersonatedTenantId]);
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
        <Stack.Screen name="(superadmin)" />
      </Stack>
    </ConvexAuthProvider>
  );
}
