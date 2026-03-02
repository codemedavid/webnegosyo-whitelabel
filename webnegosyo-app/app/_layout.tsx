import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, router, useRootNavigationState } from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import { supabase } from "../lib/supabase";
import { registerForPushNotifications } from "../lib/notifications";

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
    });
  }, [isAuthenticated, convexUrl]);
}

export default function RootLayout() {
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
