import { useEffect, useState } from "react";
import System from "@/models/system";
import { useSystemSettingsContext } from "@/components/contexts/SystemSettingsProvider";

export default function useSystemSettings() {
  const context = useSystemSettingsContext();
  const [settings, setSettings] = useState(() => System.peekKeys());
  const [loading, setLoading] = useState(() => !System.peekKeys());
  const [error, setError] = useState(null);

  useEffect(() => {
    if (context) return;
    let cancelled = false;

    System.keys()
      .then((nextSettings) => {
        if (cancelled) return;
        setSettings(nextSettings);
        setError(
          nextSettings ? null : new Error("Unable to load system settings.")
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context]);

  if (context) return context;

  return {
    settings,
    loading,
    error,
    refresh: async ({ bypassCache = false } = {}) => {
      setLoading(!settings);
      const nextSettings = await System.keys({ bypassCache });
      setSettings(nextSettings);
      setError(
        nextSettings ? null : new Error("Unable to load system settings.")
      );
      setLoading(false);
      return nextSettings;
    },
  };
}
