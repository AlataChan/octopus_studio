import React, { useEffect, useState } from "react";
import { FullScreenLoader } from "@/components/Preloader";
import paths from "@/utils/paths";
import useQuery from "@/hooks/useQuery";
import System from "@/models/system";
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import {
  clearLocalAuthSession,
  markLocalAuthSessionValidated,
} from "@/utils/request";

export default function SimpleSSOPassthrough() {
  const query = useQuery();
  const redirectPath = query.get("redirectTo") || paths.home();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      if (!query.get("token")) throw new Error("No token provided.");

      // Clear any existing auth data
      clearLocalAuthSession();

      System.simpleSSOLogin(query.get("token"))
        .then((res) => {
          if (!res.valid) throw new Error(res.message);

          window.localStorage.setItem(AUTH_USER, JSON.stringify(res.user));
          window.localStorage.setItem(AUTH_TOKEN, res.token);
          markLocalAuthSessionValidated();
          setReady(res.valid);
        })
        .catch((e) => {
          setError(e.message);
        });
    } catch (e) {
      setError(e.message);
    }
  }, []);

  if (error)
    return (
      <div className="w-screen h-screen overflow-hidden bg-page-texture flex items-center justify-center">
        <div className="relative z-[1] flex flex-col gap-4 items-center">
          <p className="text-theme-text-primary font-mono text-lg">{error}</p>
          <p className="text-theme-text-secondary font-mono text-sm">
            Please contact the system administrator about this error.
          </p>
        </div>
      </div>
    );
  if (ready) return window.location.replace(redirectPath);

  // Loading state by default
  return <FullScreenLoader />;
}
