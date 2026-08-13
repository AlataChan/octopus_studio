import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Workspace from "@/models/workspace";

const SidebarDataContext = createContext({
  workspaces: [],
  isLoading: true,
  error: null,
  refresh: async () => [],
  updateWorkspaces: () => {},
  lastUpdatedAt: null,
});

export async function loadSidebarWorkspaces() {
  const workspaces = await Workspace.all();
  return Workspace.orderWorkspaces(Array.isArray(workspaces) ? workspaces : []);
}

export function SidebarDataProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const mountedRef = useRef(false);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);

    try {
      const nextWorkspaces = await loadSidebarWorkspaces();
      if (mountedRef.current) {
        setWorkspaces(nextWorkspaces);
        setError(null);
        setLastUpdatedAt(Date.now());
      }
      return nextWorkspaces;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setWorkspaces([]);
      }
      return [];
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const updateWorkspaces = useCallback((nextWorkspaces) => {
    setWorkspaces(Workspace.orderWorkspaces(nextWorkspaces));
    setLastUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      workspaces,
      isLoading,
      error,
      refresh,
      updateWorkspaces,
      lastUpdatedAt,
    }),
    [workspaces, isLoading, error, refresh, updateWorkspaces, lastUpdatedAt]
  );

  return (
    <SidebarDataContext.Provider value={value}>
      {children}
    </SidebarDataContext.Provider>
  );
}

export function useSidebarData() {
  return useContext(SidebarDataContext);
}
