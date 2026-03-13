import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProviderPickerScreen } from "./components/auth/ProviderPickerScreen";
import { useAuthGuard } from "./auth";
import { useTokenRefresh } from "./auth";

export default function App() {
  const { state, setAuthenticated, setPendingProvider } = useAuthGuard();
  const tokenRefresh = useTokenRefresh();

  // While checking keychain — show nothing (brief flash, avoids flicker)
  if (state.status === "checking") {
    return null;
  }

  // Provider not configured, or token refresh failed and re-auth needed
  if (
    state.status === "needs_picker" ||
    (tokenRefresh.checked && tokenRefresh.needsReauth)
  ) {
    const heading =
      tokenRefresh.needsReauth && tokenRefresh.provider
        ? `Re-connect ${tokenRefresh.provider} to continue`
        : undefined;

    return (
      <ErrorBoundary>
        <ProviderPickerScreen
          heading={heading}
          onAuthenticated={setAuthenticated}
          setPendingProvider={setPendingProvider}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
