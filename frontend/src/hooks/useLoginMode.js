import { useEffect, useState } from "react";
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { getLocalStorageItem } from "@/utils/storage";

export default function useLoginMode() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!window) return;
    const user = !!getLocalStorageItem(AUTH_USER);
    const token = !!getLocalStorageItem(AUTH_TOKEN);
    let _mode = null;
    if (user && token) _mode = "multi";
    if (!user && token) _mode = "single";
    setMode(_mode);
  }, [window]);

  return mode;
}
