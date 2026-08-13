const {
  buildAppContentSecurityPolicy,
  decideNavigationPolicy,
  handleWindowOpenPolicy,
} = require("../main/securityPolicy.cjs");

describe("Electron security policy", () => {
  const appOrigin = "http://127.0.0.1:31234";

  test("builds a production CSP scoped to the app loopback origin without unsafe-eval", () => {
    const csp = buildAppContentSecurityPolicy({
      isDevelopment: false,
      serverHost: "127.0.0.1",
      serverPort: 31234,
    });

    expect(csp).toContain("http://127.0.0.1:31234");
    expect(csp).toContain("ws://127.0.0.1:31234");
    expect(csp).not.toContain("localhost:*");
    expect(csp).not.toContain("127.0.0.1:*");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("keeps development CSP allowances for local Vite and React tooling", () => {
    const csp = buildAppContentSecurityPolicy({
      isDevelopment: true,
      serverHost: "127.0.0.1",
      serverPort: 3001,
    });

    expect(csp).toContain("http://localhost:*");
    expect(csp).toContain("http://127.0.0.1:*");
    expect(csp).toContain("'unsafe-eval'");
  });

  test("opens only http and https links externally", () => {
    const openedUrls = [];
    const openExternal = (url) => openedUrls.push(url);

    expect(
      handleWindowOpenPolicy({
        url: "https://example.com/docs",
        openExternal,
      })
    ).toEqual({ action: "deny" });
    expect(openedUrls).toEqual(["https://example.com/docs"]);

    expect(
      handleWindowOpenPolicy({
        url: "mailto:security@example.com",
        openExternal,
      })
    ).toEqual({ action: "deny" });
    expect(openedUrls).toEqual(["https://example.com/docs"]);
  });

  test.each([
    [
      "same-origin app route",
      "http://127.0.0.1:31234/workspace/example",
      { action: "allow", openExternal: false },
    ],
    [
      "external https URL",
      "https://evil.example/phishing",
      { action: "deny", openExternal: true },
    ],
    [
      "external redirect target",
      "https://evil.example/redirected",
      { action: "deny", openExternal: true },
    ],
    [
      "local file URL",
      "file:///etc/passwd",
      { action: "deny", openExternal: false },
    ],
    [
      "same host with different port",
      "http://127.0.0.1:9999/workspace/example",
      { action: "deny", openExternal: true },
    ],
    [
      "about blank",
      "about:blank",
      { action: "deny", openExternal: false },
    ],
    [
      "data URL",
      "data:text/html,<script>alert(1)</script>",
      { action: "deny", openExternal: false },
    ],
    [
      "javascript URL",
      "javascript:alert(1)",
      { action: "deny", openExternal: false },
    ],
    [
      "malformed URL",
      "https://",
      { action: "deny", openExternal: false },
    ],
  ])("decides navigation policy for %s", (_label, url, expected) => {
    expect(() => decideNavigationPolicy({ url, appOrigin })).not.toThrow();
    expect(decideNavigationPolicy({ url, appOrigin })).toEqual(expected);
  });
});
