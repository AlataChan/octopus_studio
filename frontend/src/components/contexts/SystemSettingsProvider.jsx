import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuthContext } from "@/AuthContext";
import System from "@/models/system";

export const SystemSettingsContext = createContext(null);

function initialSettingsState() {
  const settings = System.peekKeys();
  return {
    settings,
    loading: !settings,
    error: null,
  };
}

export function SystemSettingsProvider({ children }) {
  const authContext = useContext(AuthContext);
  const authToken = authContext?.store?.authToken || null;
  const authUserId = authContext?.store?.user?.id || null;
  const didTrackAuth = useRef(false);
  const [state, setState] = useState(initialSettingsState);

  const refresh = useCallback(async ({ bypassCache = false } = {}) => {
    setState((current) => ({
      ...current,
      loading: !current.settings,
      error: null,
    }));

    const settings = await System.keys({ bypassCache });
    setState((current) => ({
      settings: settings || current.settings || null,
      loading: false,
      error: settings ? null : new Error("Unable to load system settings."),
    }));
    return settings;
  }, []);

  useEffect(() => {
    if (System.peekKeys() && System.hasFreshSetupSettings()) {
      setState({ settings: System.peekKeys(), loading: false, error: null });
      return;
    }

    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!didTrackAuth.current) {
      didTrackAuth.current = true;
      return;
    }

    refresh({ bypassCache: true });
  }, [authToken, authUserId, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSettingsChanged = () => refresh({ bypassCache: true });
    window.addEventListener(
      System.setupSettingsChangedEvent,
      handleSettingsChanged
    );
    return () => {
      window.removeEventListener(
        System.setupSettingsChangedEvent,
        handleSettingsChanged
      );
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
    }),
    [state, refresh]
  );

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettingsContext() {
  return useContext(SystemSettingsContext);
}
