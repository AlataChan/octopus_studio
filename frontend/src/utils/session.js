import System from "@/models/system";
import { AUTH_TOKEN } from "./constants";
import { getLocalStorageItem } from "./storage";

// Checks current localstorage and validates the session based on that.
export default async function validateSessionTokenForUser() {
  const currentToken = getLocalStorageItem(AUTH_TOKEN);
  if (!currentToken) return false;

  if (!System.needsAuthCheck()) {
    return true;
  }

  return await System.checkAuth(currentToken);
}
