import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import {
  KMFilesSection,
  canSubmitTextUpload,
  normalizeKmStatus,
  uploadTextToMolt,
} from "@/pages/Admin/SgaSettings";

const root = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const translations = {
  "molt.console.km.section_title": "KM & Files",
  "molt.console.km.status.configured": "KM configured",
  "molt.console.km.status.not_configured": "KM not configured",
  "molt.console.km.status.disabled": "KM disabled",
  "molt.console.km.status.loading": "Loading KM status...",
  "molt.console.km.status.error": "Unable to load KM status.",
  "molt.console.km.status.no_data": "No KM data reported.",
  "molt.console.files.section_title": "Upload Text File",
  "molt.console.files.filename_label": "Filename",
  "molt.console.files.content_label": "Content",
  "molt.console.files.agent_label": "Molt agent",
  "molt.console.files.agent_placeholder": "Select a Molt agent",
  "molt.console.files.upload": "Upload",
  "molt.console.files.loading": "Uploading...",
  "molt.console.files.success": "Text file uploaded.",
  "molt.console.files.error_generic": "Unable to upload text file.",
  "molt.console.files.validation_required":
    "Filename, content, and agent are required.",
};

function t(key) {
  return translations[key] || key;
}

function renderSection(props = {}) {
  return renderToStaticMarkup(
    <KMFilesSection
      agents={[
        { id: "molt-matrix", name: "Matrix Coordinator" },
        { id: "molt-km", name: "KM Curator" },
      ]}
      kmStatus={{
        success: true,
        configured: true,
        version: "1.2.3",
        capabilities: ["graph", "files"],
      }}
      kmError={null}
      isLoading={false}
      t={t}
      {...props}
    />
  );
}

describe("Molt console KM and files section", () => {
  test("console page loads KM status with the other Molt console data", () => {
    const page = source("src/pages/Admin/SgaSettings/index.jsx");

    expect(page).toContain("Molt.kmStatus()");
    expect(page).toContain("kmStatus:");
  });

  test("normalizes and renders configured KM status with version and capabilities", () => {
    expect(
      normalizeKmStatus({
        success: true,
        configured: true,
        version: "1.2.3",
        capabilities: ["graph", "files"],
      })
    ).toMatchObject({ state: "configured" });

    const markup = renderSection();

    expect(markup).toContain("KM configured");
    expect(markup).toContain("1.2.3");
    expect(markup).toContain("graph");
    expect(markup).toContain("files");
  });

  test("renders not configured KM state with setup guidance", () => {
    const markup = renderSection({
      kmStatus: { success: true, configured: false },
    });

    expect(markup).toContain("KM not configured");
    expect(markup).toContain("No KM data reported.");
  });

  test("renders disabled KM state", () => {
    const markup = renderSection({
      kmStatus: { success: true, disabled: true },
    });

    expect(markup).toContain("KM disabled");
  });

  test("KM API failure renders friendly error", () => {
    const markup = renderSection({
      kmStatus: { success: false, error: "Molt offline" },
      kmError: "Molt offline",
    });

    expect(markup).toContain("Unable to load KM status.");
    expect(markup).toContain("Molt offline");
  });

  test("upload helper sends filename, content, and selected agent id", async () => {
    const molt = {
      uploadTextFile: vi.fn(async () => ({ success: true })),
    };

    await uploadTextToMolt({
      molt,
      filename: "brief.md",
      content: "Bridge notes",
      agentId: "molt-km",
    });

    expect(molt.uploadTextFile).toHaveBeenCalledWith({
      filename: "brief.md",
      content: "Bridge notes",
      agentId: "molt-km",
    });
  });

  test("upload success and failure render controlled status without clearing content", () => {
    const successMarkup = renderSection({
      uploadResult: { success: true },
    });
    expect(successMarkup).toContain("Text file uploaded.");

    const failedMarkup = renderSection({
      uploadResult: { success: false, error: "Upload failed" },
      filename: "brief.md",
      content: "Do not clear this text",
      selectedAgentId: "molt-km",
    });
    expect(failedMarkup).toContain("Unable to upload text file.");
    expect(failedMarkup).toContain("Upload failed");
    expect(failedMarkup).toContain("Do not clear this text");
  });

  test("missing filename, content, or agent disables upload", () => {
    expect(
      canSubmitTextUpload({
        filename: "brief.md",
        content: "Bridge notes",
        agentId: "molt-km",
      })
    ).toBe(true);
    expect(
      canSubmitTextUpload({ filename: "", content: "x", agentId: "a" })
    ).toBe(false);
    expect(
      canSubmitTextUpload({ filename: "x", content: "", agentId: "a" })
    ).toBe(false);
    expect(
      canSubmitTextUpload({ filename: "x", content: "y", agentId: "" })
    ).toBe(false);

    const markup = renderSection({
      filename: "",
      content: "",
      selectedAgentId: "",
    });
    expect(markup).toContain("Filename, content, and agent are required.");
    expect(markup).toContain('disabled=""');
  });

  test("defines required KM and files translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.console.km.section_title",
      "molt.console.km.status.configured",
      "molt.console.km.status.not_configured",
      "molt.console.km.status.disabled",
      "molt.console.km.status.loading",
      "molt.console.km.status.error",
      "molt.console.km.status.no_data",
      "molt.console.files.section_title",
      "molt.console.files.filename_label",
      "molt.console.files.content_label",
      "molt.console.files.agent_label",
      "molt.console.files.agent_placeholder",
      "molt.console.files.upload",
      "molt.console.files.loading",
      "molt.console.files.success",
      "molt.console.files.error_generic",
      "molt.console.files.validation_required",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
