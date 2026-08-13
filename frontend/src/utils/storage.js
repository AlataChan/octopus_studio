const CURRENT_PREFIX = "alata_";
const LEGACY_PREFIX = "anythingllm_";
const CURRENT_DASH_PREFIX = "alata-";
const LEGACY_DASH_PREFIX = "anythingllm-";

export function legacyStorageKey(key) {
  if (typeof key !== "string") return null;
  if (key.startsWith(CURRENT_PREFIX)) {
    return `${LEGACY_PREFIX}${key.slice(CURRENT_PREFIX.length)}`;
  }
  if (key.startsWith(CURRENT_DASH_PREFIX)) {
    return `${LEGACY_DASH_PREFIX}${key.slice(CURRENT_DASH_PREFIX.length)}`;
  }
  return null;
}

export function getLocalStorageItem(key) {
  const legacyKey = legacyStorageKey(key);
  return (
    window.localStorage.getItem(key) ??
    (legacyKey ? window.localStorage.getItem(legacyKey) : null)
  );
}

export function setLocalStorageItem(key, value) {
  window.localStorage.setItem(key, value);
}

export function removeLocalStorageItem(key) {
  window.localStorage.removeItem(key);
  const legacyKey = legacyStorageKey(key);
  if (legacyKey) window.localStorage.removeItem(legacyKey);
}
