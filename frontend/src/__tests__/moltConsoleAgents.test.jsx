import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AgentsSection } from "@/pages/Admin/SgaSettings";

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const translations = {
  "molt.console.agents.title": "Molt Agents",
  "molt.console.agents.empty": "No Molt agents found.",
  "molt.console.agents.empty_hint": "Complete Matrix setup in Molt first.",
  "molt.console.agents.loading": "Loading Molt agents...",
  "molt.console.agents.fetch_error": "Unable to load Molt agents.",
};

function t(key) {
  return translations[key] || key;
}

describe("Molt console agents section", () => {
  test("console page loads Molt agents with the other Molt console data", () => {
    const page = source("src/pages/Admin/SgaSettings/index.jsx");

    expect(page).toContain("Molt.agents()");
    expect(page).toContain("agents:");
  });

  test("renders loading state", () => {
    const markup = renderToStaticMarkup(
      <AgentsSection
        agents={[]}
        connectionState="CONNECTED"
        error={null}
        isLoading
        t={t}
      />
    );

    expect(markup).toContain("Loading Molt agents...");
  });

  test("renders empty state with setup guidance", () => {
    const markup = renderToStaticMarkup(
      <AgentsSection
        agents={[]}
        connectionState="CONNECTED"
        error={null}
        isLoading={false}
        t={t}
      />
    );

    expect(markup).toContain("No Molt agents found.");
    expect(markup).toContain("Complete Matrix setup in Molt first.");
  });

  test("renders agent identity, status, and capabilities", () => {
    const markup = renderToStaticMarkup(
      <AgentsSection
        agents={[
          {
            id: "molt-matrix",
            name: "Matrix Coordinator",
            status: "online",
            capabilities: ["planning", "research"],
          },
        ]}
        connectionState="CONNECTED"
        error={null}
        isLoading={false}
        t={t}
      />
    );

    expect(markup).toContain("molt-matrix");
    expect(markup).toContain("Matrix Coordinator");
    expect(markup).toContain("online");
    expect(markup).toContain("planning");
    expect(markup).toContain("research");
  });

  test("renders failed fetch state without throwing", () => {
    const markup = renderToStaticMarkup(
      <AgentsSection
        agents={[]}
        connectionState="OFFLINE"
        error="Molt unavailable"
        isLoading={false}
        t={t}
      />
    );

    expect(markup).toContain("Unable to load Molt agents.");
    expect(markup).toContain("Molt unavailable");
  });

  test("renders connection state badge in the agents section header", () => {
    const markup = renderToStaticMarkup(
      <AgentsSection
        agents={[]}
        connectionState="CONNECTED"
        error={null}
        isLoading={false}
        t={t}
      />
    );

    expect(markup).toContain("CONNECTED");
    expect(markup).toContain("rounded-full");
  });

  test("defines required zh and en translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.console.agents.title",
      "molt.console.agents.empty",
      "molt.console.agents.empty_hint",
      "molt.console.agents.loading",
      "molt.console.agents.fetch_error",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
