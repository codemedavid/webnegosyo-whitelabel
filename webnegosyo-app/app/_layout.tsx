import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";

function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const convexUrl = useAuthStore((s) => s.convexUrl);
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

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace("/(main)/dashboard");
    } else {
      router.replace("/(auth)/login");
    }
  }, [isLoading, isAuthenticated, convexUrl]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ConvexAuthProvider>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </AuthGate>
    </ConvexAuthProvider>
  );
}
