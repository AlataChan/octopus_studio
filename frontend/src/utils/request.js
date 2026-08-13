import {
  AUTH_SESSION_VALIDATED,
  AUTH_TIMESTAMP,
  AUTH_TOKEN,
  AUTH_USER,
} from "./constants";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "./storage";

// Sets up the base headers for all authenticated requests so that we are able to prevent
// basic spoofing since a valid token is required and that cannot be spoofed
export function userFromStorage() {
  try {
    const userString = getLocalStorageItem(AUTH_USER);
    if (!userString) return null;
    return JSON.parse(userString);
  } catch {}
  return {};
}

export function baseHeaders(providedToken = null) {
  const token = providedToken || getLocalStorageItem(AUTH_TOKEN);
  return {
    Authorization: token ? `Bearer ${token}` : null,
  };
}

export function clearLocalAuthSession() {
  removeLocalStorageItem(AUTH_TOKEN);
  removeLocalStorageItem(AUTH_USER);
  removeLocalStorageItem(AUTH_TIMESTAMP);
  removeLocalStorageItem(AUTH_SESSION_VALIDATED);
}

export function markLocalAuthSessionValidated() {
  setLocalStorageItem(AUTH_SESSION_VALIDATED, "1");
  setLocalStorageItem(AUTH_TIMESTAMP, Number(new Date()));
}

export function hasValidatedLocalAuthSession() {
  return (
    !!getLocalStorageItem(AUTH_TOKEN) &&
    getLocalStorageItem(AUTH_SESSION_VALIDATED) === "1"
  );
}

export function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch {}
  return fallback;
}
