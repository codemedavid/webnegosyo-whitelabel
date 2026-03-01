import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ConvexAuthProvider } from "../lib/convex-provider";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";

function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        // Restore auth state
        const { data: appUser } = await supabase
          .from("app_users")
          .select("tenant_id")
          .eq("user_id", data.session.user.id)
          .in("role", ["admin", "superadmin"])
          .single();

        if (appUser) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("id, slug, name, convex_deployment_url")
            .eq("id", appUser.tenant_id)
            .single();

          if (tenant?.convex_deployment_url) {
            setAuth({
              userId: data.session.user.id,
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              tenantName: tenant.name,
              convexUrl: tenant.convex_deployment_url,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }
        }
      }
      setAuth({ isLoading: false });
    });
  }, [setAuth]);

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/(main)/dashboard");
      } else {
        router.replace("/(auth)/login");
      }
    }
  }, [isLoading, isAuthenticated]);

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
