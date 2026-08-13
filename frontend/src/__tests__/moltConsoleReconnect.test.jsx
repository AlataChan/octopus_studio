import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import Molt from "@/models/molt";
import { ReconnectControl, reconnectMolt } from "@/pages/Admin/SgaSettings";

vi.mock("@/utils/request", () => ({
  baseHeaders: () => ({ Authorization: "Bearer token" }),
}));

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const translations = {
  "molt.console.reconnect.button": "Reconnect",
  "molt.console.reconnect.loading": "Reconnecting...",
  "molt.console.reconnect.success": "Molt reconnected.",
  "molt.console.reconnect.failed": "Unable to reconnect Molt.",
};

function t(key) {
  return translations[key] || key;
}

describe("Molt console reconnect", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test("Molt.reconnect posts to the reconnect endpoint", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({ success: true, state: "CONNECTED" })),
    });

    await expect(Molt.reconnect()).resolves.toEqual({
      success: true,
      state: "CONNECTED",
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/molt/reconnect", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });
  });

  test("Reconnect button renders in the console control", () => {
    const markup = renderToStaticMarkup(
      <ReconnectControl
        isLoading={false}
        result={null}
        onReconnect={() => {}}
        t={t}
      />
    );

    expect(markup).toContain("Reconnect");
  });

  test("click helper calls Molt.reconnect", async () => {
    const molt = {
      reconnect: vi.fn(async () => ({ success: true, state: "CONNECTED" })),
    };

    await expect(reconnectMolt({ molt })).resolves.toEqual({
      success: true,
      state: "CONNECTED",
    });
    expect(molt.reconnect).toHaveBeenCalledTimes(1);
  });

  test("loading state disables duplicate reconnect", () => {
    const markup = renderToStaticMarkup(
      <ReconnectControl isLoading result={null} onReconnect={() => {}} t={t} />
    );

    expect(markup).toContain("Reconnecting...");
    expect(markup).toContain('disabled=""');
  });

  test("success and failure statuses render inline", () => {
    const success = renderToStaticMarkup(
      <ReconnectControl
        isLoading={false}
        result={{ success: true }}
        onReconnect={() => {}}
        t={t}
      />
    );
    expect(success).toContain("Molt reconnected.");

    const failure = renderToStaticMarkup(
      <ReconnectControl
        isLoading={false}
        result={{ success: false, error: "Unauthorized" }}
        onReconnect={() => {}}
        t={t}
      />
    );
    expect(failure).toContain("Unable to reconnect Molt.");
    expect(failure).toContain("Unauthorized");
  });

  test("defines required reconnect translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.console.reconnect.button",
      "molt.console.reconnect.loading",
      "molt.console.reconnect.success",
      "molt.console.reconnect.failed",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
