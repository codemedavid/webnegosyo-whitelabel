import { useEffect } from "react";
import { InteractionManager, Platform } from "react-native";
import Constants from "expo-constants";
import {
  Stack,
  router,
  useRootNavigationState,
  useSegments,
  type ErrorBoundaryProps,
} from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { QueryProvider } from "../lib/query/QueryProvider";
import { useAuthStore } from "../stores/auth-store";
import {
  MERCHANT_LANDING_HREF,
  SUPERADMIN_LANDING_HREF,
  needsTenantLookup,
  needsOutletLookup,
  type AppUserRow,
  type OutletRow,
  resolveSession,
  type TenantRow,
  TENANT_SESSION_SELECT,
} from "../lib/session-resolve";
import { usePrinterStore } from "../stores/printer-store";
import { useRegisterSettingsStore } from "../stores/register-settings-store";
import { supabase } from "../lib/supabase";
import { classifyLookup, outcomeForThrown } from "../lib/session-bootstrap";
import { fetchWithTimeout } from "../lib/fetch-timeout";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications, ensureOrdersChannel } from "../lib/notifications";
import { platformDeviceRegistration } from "../lib/platform-device-token";
import { upsertPlatformDeviceToken } from "../lib/announcements/service";
import { announcementRouteFromPushData } from "../lib/announcements/popup";
import {
  shouldRegisterPushToken,
  pushRegistrationOutletId,
  pushTokenCleanup,
  platformPushRegistration,
  platformPushCleanup,
} from "../lib/push-registration";
import { CrashFallback } from "../components/CrashFallback";
import { warnAboutScreensRuntime } from "../lib/native-runtime-parity";

/**
 * Runs at import time, before the first screen commits. Expo Go ships an
 * older `react-native-screens` natively than this app is built against, and
 * the resulting native TypeError gets blamed on the <Stack> below — so say so
 * in words first. Silent in every runtime that is not affected.
 */
warnAboutScreensRuntime(
  { appOwnership: Constants.appOwnership, isDev: __DEV__ },
  (message) => console.warn(message),
);

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
  const bootstrapAttempt = useAuthStore((s) => s.bootstrapAttempt);

  useEffect(() => {
    const signedOut = () => setAuth({ isLoading: false, bootstrapError: null });
    // The stored session stays put: the merchant is asked to try again, not
    // to sign in again (lib/session-bootstrap.ts).
    const unreachable = (message: string) => setAuth({ isLoading: false, bootstrapError: message });

    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError || !data.session?.user) {
        signedOut();
        return;
      }

      try {
        const appUserLookup = classifyLookup<AppUserRow>(
          await supabase
            .from("app_users")
            .select("tenant_id, role, is_owner, permissions, outlet_id, default_tab")
            .eq("user_id", data.session.user.id)
            .in("role", ["admin", "superadmin"])
            .single()
        );
        if (appUserLookup.kind === "unreachable") return unreachable(appUserLookup.message);
        if (appUserLookup.kind === "missing") return signedOut();
        const appUser = appUserLookup.row;

        // A superadmin owns no tenant (tenant_id is NULL), so skip the lookup —
        // querying by a null id would miss and read as a failed sign-in.
        let tenant: TenantRow | null = null;
        if (needsTenantLookup(appUser)) {
          const tenantLookup = classifyLookup<TenantRow>(
            await supabase
              .from("tenants")
              .select(TENANT_SESSION_SELECT)
              .eq("id", appUser.tenant_id)
              .single()
          );
          if (tenantLookup.kind === "unreachable") return unreachable(tenantLookup.message);
          tenant = tenantLookup.kind === "row" ? tenantLookup.row : null;
        }

        // Branch-confined accounts carry their branch onto the session; the
        // name is snapshotted onto counter sales, so it is read here once.
        let outlet: OutletRow | null = null;
        if (needsOutletLookup(appUser)) {
          const outletLookup = classifyLookup<OutletRow>(
            await supabase.from("outlets").select("id, name").eq("id", appUser.outlet_id).single()
          );
          if (outletLookup.kind === "unreachable") return unreachable(outletLookup.message);
          outlet = outletLookup.kind === "row" ? outletLookup.row : null;
        }
        const session = resolveSession(data.session.user.id, appUser, tenant, outlet);

        if (session.mode === "denied" || !session.auth) {
          signedOut();
          return;
        }

        setAuth({ ...session.auth, bootstrapError: null });
      } catch (e: unknown) {
        unreachable(outcomeForThrown(e).message);
      }
    });
  }, [setAuth, bootstrapAttempt]);
}

function useAuthRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const bootstrapError = useAuthStore((s) => s.bootstrapError);
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
    // The lookup failed, not the sign-in: app/index.tsx shows a retry.
    if (bootstrapError !== null && !isAuthenticated) return;

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
    bootstrapError,
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
  const orderBackend = useAuthStore((s) => s.orderBackend);
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
      orderBackend,
      isSuperadmin,
      impersonatedTenantId,
      // The account's branch and tenant, read fresh rather than subscribed:
      // this effect only re-runs on the deps below, and both are fixed for a
      // session (impersonation changes orderBackend/convexUrl, which are deps).
      outletId: useAuthStore.getState().outletId,
      tenantId:
        useAuthStore.getState().impersonatedTenantId ??
        useAuthStore.getState().tenantId,
    };

    // A superadmin viewing someone else's store is a spectator: never subscribe
    // them to that store's order alerts, and drop any token an earlier build
    // left behind in that deployment.
    const platformStale = platformPushCleanup(session);
    if (platformStale) {
      supabase
        .from("push_tokens")
        .delete()
        .eq("tenant_id", platformStale.tenantId)
        .eq("user_id", platformStale.userId)
        .then(undefined, () => {});
    }

    const stale = pushTokenCleanup(session);
    if (stale) {
      fetchWithTimeout(`${stale.convexUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "notifications:removePushToken",
          args: { userId: stale.userId },
          format: "json",
        }),
      }).catch(() => {});
    }

    // Platform messages (What's New posts, on-command notices) are filed in
    // ONE table for every signed-in device, whatever the store's order
    // backend — see lib/platform-device-token.ts.
    const deviceTarget = platformDeviceRegistration({
      ...session,
      isDemo: useAuthStore.getState().isDemo,
      tenantId: useAuthStore.getState().tenantId,
    });
    const wantsOrderPush = shouldRegisterPushToken(session) && !!userId;
    if (!deviceTarget && !wantsOrderPush) return;
    // A platform-backend store files the token in the shared `push_tokens`
    // table, where the orders trigger fans pushes out; everyone else keeps
    // registering with their Convex deployment.
    const platformTarget = wantsOrderPush ? platformPushRegistration(session) : null;
    if (!deviceTarget && !platformTarget && !convexUrl) return;

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
        if (deviceTarget) {
          upsertPlatformDeviceToken({ token, ...deviceTarget }).catch((e) => {
            console.warn("Failed to register platform device token:", e);
          });
        }
        if (!wantsOrderPush) return;
        if (platformTarget) {
          const { error } = await supabase.from("push_tokens").upsert(
            {
              tenant_id: platformTarget.tenantId,
              user_id: platformTarget.userId,
              token,
              platform: Platform.OS === "ios" ? "ios" : "android",
              outlet_id: platformTarget.outletId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "tenant_id,token" }
          );
          if (error) {
            console.warn("Failed to register push token:", error.message);
          }
          return;
        }
        if (!convexUrl) return;
        try {
          await fetchWithTimeout(`${convexUrl}/api/mutation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: "notifications:registerPushToken",
              args: {
                userId,
                token,
                platform: Platform.OS === "ios" ? "ios" : "android",
                // Binds this device to its branch so it is only rung for that
                // branch's orders. Omitted for an owner, who hears every one.
                outletId: pushRegistrationOutletId(session),
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
  }, [isAuthenticated, convexUrl, orderBackend, isSuperadmin, impersonatedTenantId]);
}

/**
 * Opens the screen an announcement push points at when the merchant taps it —
 * both for a tap that wakes a running app and for the tap that launched it.
 * Order pushes carry no announcementId and are left to the order screens.
 */
function useAnnouncementPushRouting() {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const route = announcementRouteFromPushData(response?.notification.request.content.data);
      if (route) router.push(route as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useGlobalErrorHandler();
  useAuthInit();
  useAuthRedirect();
  usePushNotifications();
  useAnnouncementPushRouting();

  // Load saved device settings (printer config, register prefs) on app start
  useEffect(() => {
    usePrinterStore.getState().loadSaved();
    useRegisterSettingsStore.getState().loadSaved();
  }, []);

  // The query cache sits OUTSIDE the Convex provider so the element wrapping
  // the navigation tree is exactly what it was (see lib/convex-provider.tsx).
  return (
    <QueryProvider>
      <ConvexAuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="(superadmin)" />
        </Stack>
      </ConvexAuthProvider>
    </QueryProvider>
  );
}
