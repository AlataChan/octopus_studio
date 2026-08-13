import { lazy, useContext, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FullScreenLoader } from "../Preloader";
import validateSessionTokenForUser from "@/utils/session";
import paths from "@/utils/paths";
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { userFromStorage } from "@/utils/request";
import { getLocalStorageItem } from "@/utils/storage";
import System from "@/models/system";
import { KeyboardShortcutWrapper } from "@/utils/keyboardShortcuts";
import useSystemSettings from "@/hooks/useSystemSettings";
import { AuthContext } from "@/AuthContext";
import { decideRouteAccess } from "@/utils/routeAccess";

const UserMenu = lazy(() => import("../UserMenu"));

// Used only for Multi-user mode only as we permission specific pages based on auth role.
// When in single user mode we just bypass any authchecks.
function useIsAuthenticated() {
  const { settings, loading, error } = useSystemSettings();
  const authContext = useContext(AuthContext);
  const authStore = authContext?.store;
  const authVersion = `${authStore?.authToken || ""}:${authStore?.user?.id || ""}`;
  const localAuthToken = getLocalStorageItem(AUTH_TOKEN);
  const localUser = getLocalStorageItem(AUTH_USER);
  const needsAuthCheck = System.needsAuthCheck();
  const [sessionValid, setSessionValid] = useState(null);

  const state = useMemo(
    () =>
      decideRouteAccess({
        settings,
        settingsLoading: loading,
        settingsError: error,
        hasLocalAuthToken: !!localAuthToken,
        hasLocalUser: !!localUser,
        needsAuthCheck,
        sessionValid,
      }),
    [
      settings,
      loading,
      error,
      localAuthToken,
      localUser,
      needsAuthCheck,
      sessionValid,
      authVersion,
    ]
  );

  useEffect(() => {
    if (!state.requiresSessionCheck) {
      setSessionValid(null);
      return;
    }

    let cancelled = false;
    setSessionValid(null);
    validateSessionTokenForUser().then((isValid) => {
      if (!cancelled) setSessionValid(isValid);
    });

    return () => {
      cancelled = true;
    };
  }, [state.requiresSessionCheck, authVersion, localAuthToken, localUser]);

  return state;
}

// Allows only admin to access the route and if in single user mode,
// allows all users to access the route
export function AdminRoute({ Component, hideUserMenu = false }) {
  const { isAuthd, shouldRedirectToOnboarding, multiUserMode } =
    useIsAuthenticated();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return <Navigate to={paths.onboarding.home()} />;
  }

  const user = userFromStorage();
  return isAuthd && (user?.role === "admin" || !multiUserMode) ? (
    hideUserMenu ? (
      <KeyboardShortcutWrapper>
        <Component />
      </KeyboardShortcutWrapper>
    ) : (
      <KeyboardShortcutWrapper>
        <UserMenu>
          <Component />
        </UserMenu>
      </KeyboardShortcutWrapper>
    )
  ) : (
    <Navigate to={paths.home()} />
  );
}

// Allows manager and admin to access the route and if in single user mode,
// allows all users to access the route
export function ManagerRoute({ Component }) {
  const { isAuthd, shouldRedirectToOnboarding, multiUserMode } =
    useIsAuthenticated();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return <Navigate to={paths.onboarding.home()} />;
  }

  const user = userFromStorage();
  return isAuthd && (user?.role !== "default" || !multiUserMode) ? (
    <KeyboardShortcutWrapper>
      <UserMenu>
        <Component />
      </UserMenu>
    </KeyboardShortcutWrapper>
  ) : (
    <Navigate to={paths.home()} />
  );
}

export default function PrivateRoute({ Component }) {
  const { isAuthd, shouldRedirectToOnboarding } = useIsAuthenticated();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return <Navigate to="/onboarding" />;
  }

  return isAuthd ? (
    <KeyboardShortcutWrapper>
      <UserMenu>
        <Component />
      </UserMenu>
    </KeyboardShortcutWrapper>
  ) : (
    <Navigate to={paths.login(true)} />
  );
}
