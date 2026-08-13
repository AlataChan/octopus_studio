export function decideRouteAccess({
  settings,
  settingsLoading = false,
  settingsError = null,
  hasLocalAuthToken = false,
  hasLocalUser = false,
  needsAuthCheck = false,
  sessionValid = null,
} = {}) {
  if (settingsLoading) {
    return loadingDecision();
  }

  if (settingsError || !settings) {
    return denyDecision({ multiUserMode: false, settingsUnavailable: true });
  }

  const {
    MultiUserMode = false,
    RequiresAuth = false,
    LLMProvider = null,
    VectorDB = null,
  } = settings;

  if (!MultiUserMode && !RequiresAuth && !LLMProvider && !VectorDB) {
    return allowDecision({
      shouldRedirectToOnboarding: true,
      multiUserMode: false,
    });
  }

  if (!MultiUserMode && !RequiresAuth) {
    return allowDecision({ multiUserMode: false });
  }

  if (!MultiUserMode) {
    if (!hasLocalAuthToken) return denyDecision({ multiUserMode: false });
    return authCheckDecision({
      needsAuthCheck,
      sessionValid,
      multiUserMode: false,
    });
  }

  if (!hasLocalUser || !hasLocalAuthToken) {
    return denyDecision({ multiUserMode: true });
  }

  return authCheckDecision({
    needsAuthCheck,
    sessionValid,
    multiUserMode: true,
  });
}

function authCheckDecision({ needsAuthCheck, sessionValid, multiUserMode }) {
  if (!needsAuthCheck) return allowDecision({ multiUserMode });
  if (sessionValid === null) {
    return loadingDecision({ multiUserMode, requiresSessionCheck: true });
  }
  return sessionValid
    ? allowDecision({ multiUserMode })
    : denyDecision({ multiUserMode });
}

function loadingDecision({
  multiUserMode = false,
  requiresSessionCheck = false,
} = {}) {
  return {
    isAuthd: null,
    shouldRedirectToOnboarding: false,
    multiUserMode,
    requiresSessionCheck,
    settingsUnavailable: false,
  };
}

function allowDecision({
  shouldRedirectToOnboarding = false,
  multiUserMode = false,
} = {}) {
  return {
    isAuthd: true,
    shouldRedirectToOnboarding,
    multiUserMode,
    requiresSessionCheck: false,
    settingsUnavailable: false,
  };
}

function denyDecision({
  multiUserMode = false,
  settingsUnavailable = false,
} = {}) {
  return {
    isAuthd: false,
    shouldRedirectToOnboarding: false,
    multiUserMode,
    requiresSessionCheck: false,
    settingsUnavailable,
  };
}
