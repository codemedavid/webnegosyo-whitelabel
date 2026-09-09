import { ErrorState } from "../components/ErrorState";
import { MascotLoader } from "../components/MascotLoader";
import { useAuthStore } from "../stores/auth-store";

/**
 * The first screen after the native splash: shown while the session, tenant
 * and outlet resolve in the root layout, which then redirects.
 *
 * When that lookup cannot reach the server the stored session is kept and the
 * merchant is offered a retry here — never the login screen, which would read
 * as "you were signed out" (lib/session-bootstrap.ts).
 */
export default function IndexScreen() {
  const bootstrapError = useAuthStore((s) => s.bootstrapError);
  const setAuth = useAuthStore((s) => s.setAuth);

  if (bootstrapError === null) return <MascotLoader fullScreen />;

  const retry = () =>
    setAuth({
      bootstrapError: null,
      isLoading: true,
      bootstrapAttempt: useAuthStore.getState().bootstrapAttempt + 1,
    });

  return <ErrorState message={bootstrapError} onRetry={retry} />;
}
