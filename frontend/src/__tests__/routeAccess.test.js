import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decideRouteAccess } from "@/utils/routeAccess";

const configuredSingleUserSettings = {
  MultiUserMode: false,
  RequiresAuth: false,
  LLMProvider: "openai",
  VectorDB: "lancedb",
};

describe("decideRouteAccess", () => {
  it("redirects first-run single-user instances to onboarding", () => {
    expect(
      decideRouteAccess({
        settings: {
          MultiUserMode: false,
          RequiresAuth: false,
          LLMProvider: null,
          VectorDB: null,
        },
      })
    ).toMatchObject({
      isAuthd: true,
      shouldRedirectToOnboarding: true,
      multiUserMode: false,
    });
  });

  it("allows configured single-user instances without a password", () => {
    expect(
      decideRouteAccess({ settings: configuredSingleUserSettings })
    ).toMatchObject({
      isAuthd: true,
      shouldRedirectToOnboarding: false,
      multiUserMode: false,
    });
  });

  it("requires a local token for single-user password mode", () => {
    const settings = {
      ...configuredSingleUserSettings,
      RequiresAuth: true,
    };

    expect(
      decideRouteAccess({ settings, hasLocalAuthToken: false })
    ).toMatchObject({
      isAuthd: false,
      multiUserMode: false,
    });
    expect(
      decideRouteAccess({
        settings,
        hasLocalAuthToken: true,
        needsAuthCheck: false,
      })
    ).toMatchObject({
      isAuthd: true,
      multiUserMode: false,
    });
  });

  it("blocks on stale multi-user tokens until validation succeeds", () => {
    const settings = {
      MultiUserMode: true,
      RequiresAuth: true,
    };

    expect(
      decideRouteAccess({
        settings,
        hasLocalUser: true,
        hasLocalAuthToken: true,
        needsAuthCheck: true,
        sessionValid: null,
      })
    ).toMatchObject({
      isAuthd: null,
      multiUserMode: true,
      requiresSessionCheck: true,
    });
    expect(
      decideRouteAccess({
        settings,
        hasLocalUser: true,
        hasLocalAuthToken: true,
        needsAuthCheck: true,
        sessionValid: true,
      })
    ).toMatchObject({
      isAuthd: true,
      multiUserMode: true,
    });
  });

  it("denies expired or invalid multi-user tokens after validation fails", () => {
    expect(
      decideRouteAccess({
        settings: {
          MultiUserMode: true,
          RequiresAuth: true,
        },
        hasLocalUser: true,
        hasLocalAuthToken: true,
        needsAuthCheck: true,
        sessionValid: false,
      })
    ).toMatchObject({
      isAuthd: false,
      multiUserMode: true,
    });
  });

  it("denies multi-user sessions after logout or account switch clears local auth", () => {
    expect(
      decideRouteAccess({
        settings: {
          MultiUserMode: true,
          RequiresAuth: true,
        },
        hasLocalUser: false,
        hasLocalAuthToken: false,
      })
    ).toMatchObject({
      isAuthd: false,
      multiUserMode: true,
    });
  });

  it("fails closed while settings are unknown or failed after invalidation", () => {
    expect(decideRouteAccess({ settingsLoading: true })).toMatchObject({
      isAuthd: null,
      shouldRedirectToOnboarding: false,
    });
    expect(
      decideRouteAccess({ settingsError: new Error("boom") })
    ).toMatchObject({
      isAuthd: false,
      settingsUnavailable: true,
    });
  });
});

describe("PrivateRoute settings lookup", () => {
  it("uses the settings context instead of fetching setup keys on every mount", () => {
    const source = readFileSync(
      resolve("src/components/PrivateRoute/index.jsx"),
      "utf8"
    );

    expect(source).toContain("useSystemSettings()");
    expect(source).not.toContain("System.keys(");
  });
});
