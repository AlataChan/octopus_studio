import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import Molt from "@/models/molt";
import {
  MatrixInitCard,
  initMoltMatrix,
  openMoltDashboard,
} from "@/pages/Admin/SgaSettings";

vi.mock("@/utils/request", () => ({
  baseHeaders: () => ({ Authorization: "Bearer token" }),
}));

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const translations = {
  "molt.console.matrix_init.title":
    "Molt is connected but Matrix is not initialized",
  "molt.console.matrix_init.subtitle":
    "Complete Matrix setup before agents can be listed.",
  "molt.console.matrix_init.dashboard_button": "Initialize in Molt dashboard",
  "molt.console.matrix_init.one_click_button": "Initialize here",
  "molt.console.matrix_init.no_admin_token_hint":
    "Configure MOLT_ADMIN_TOKEN to initialize here.",
  "molt.console.matrix_init.loading": "Initializing...",
  "molt.console.matrix_init.success": "Matrix initialized.",
  "molt.console.matrix_init.error_401":
    "Matrix init was rejected. Configure MOLT_ADMIN_TOKEN.",
  "molt.console.matrix_init.error_generic": "Matrix init failed.",
};

function t(key) {
  return translations[key] || key;
}

function card(props = {}) {
  return renderToStaticMarkup(
    <MatrixInitCard
      status={{
        matrixState: "uninitialized",
        agentCount: 0,
        dashboardUrl: "http://molt.local",
        hasAdminToken: false,
        ...props.status,
      }}
      initResult={props.initResult || null}
      isInitializing={props.isInitializing || false}
      onDashboardOpen={props.onDashboardOpen || (() => {})}
      onMatrixInit={props.onMatrixInit || (() => {})}
      t={t}
    />
  );
}

describe("Molt Matrix init guidance", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test("Molt.matrixInit posts to the Matrix init endpoint", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({ success: true })),
    });

    await expect(Molt.matrixInit()).resolves.toEqual({ success: true });

    expect(global.fetch).toHaveBeenCalledWith("/api/molt/matrix/init", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });
  });

  test("uninitialized Matrix status renders the setup card", () => {
    const markup = card();

    expect(markup).toContain("Molt is connected but Matrix is not initialized");
    expect(markup).toContain("Complete Matrix setup");
  });

  test("configured admin token enables one-click init", () => {
    const markup = card({ status: { hasAdminToken: true } });

    expect(markup).toContain("Initialize here");
    expect(markup).not.toContain('disabled=""');
  });

  test("missing admin token disables one-click init and shows hint", () => {
    const markup = card({ status: { hasAdminToken: false } });

    expect(markup).toContain("Configure MOLT_ADMIN_TOKEN");
    expect(markup).toContain('disabled=""');
  });

  test("dashboard helper opens the configured setup URL", () => {
    const opener = vi.fn();

    openMoltDashboard({ dashboardUrl: "http://molt.local", opener });

    expect(opener).toHaveBeenCalledWith(
      "http://molt.local/setup",
      "_blank",
      "noopener,noreferrer"
    );
  });

  test("one-click helper calls Molt.matrixInit", async () => {
    const molt = {
      matrixInit: vi.fn(async () => ({ success: true })),
    };

    await expect(initMoltMatrix({ molt })).resolves.toEqual({ success: true });
    expect(molt.matrixInit).toHaveBeenCalledTimes(1);
  });

  test("successful init can be followed by reconnect", async () => {
    const molt = {
      matrixInit: vi.fn(async () => ({ success: true })),
      reconnect: vi.fn(async () => ({ success: true, state: "CONNECTED" })),
    };

    const result = await initMoltMatrix({ molt, reconnectAfterInit: true });

    expect(result).toEqual({
      success: true,
      reconnect: { success: true, state: "CONNECTED" },
    });
    expect(molt.reconnect).toHaveBeenCalledTimes(1);
  });

  test("defines required Matrix init translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.console.matrix_init.title",
      "molt.console.matrix_init.subtitle",
      "molt.console.matrix_init.dashboard_button",
      "molt.console.matrix_init.one_click_button",
      "molt.console.matrix_init.no_admin_token_hint",
      "molt.console.matrix_init.loading",
      "molt.console.matrix_init.success",
      "molt.console.matrix_init.error_401",
      "molt.console.matrix_init.error_generic",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
