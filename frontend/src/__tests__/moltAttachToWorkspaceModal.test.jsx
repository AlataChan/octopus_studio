import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AgentsSection } from "@/pages/Admin/SgaSettings";
import AttachToWorkspaceModal, {
  attachErrorMessage,
  attachMoltAgentToWorkspace,
  loadAttachWorkspaces,
} from "@/pages/Admin/SgaSettings/AttachToWorkspaceModal";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

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
  "molt.console.agents.chat_action": "Chat",
  "molt.console.agents.attach_action": "Attach to workspace",
  "molt.console.attach.title": "Attach {{agent}} to workspace",
  "molt.console.attach.workspace_label": "Workspace",
  "molt.console.attach.display_name_label": "Display name",
  "molt.console.attach.submit": "Attach",
  "molt.console.attach.cancel": "Cancel",
  "molt.console.attach.loading": "Attaching...",
  "molt.console.attach.success_title": "Attached.",
  "molt.console.attach.success_link": "Open workspace AI Team →",
  "molt.console.attach.error_403":
    "You need workspace admin permission to attach this Molt agent.",
  "molt.console.attach.error_generic": "Unable to attach this Molt agent.",
  "molt.console.attach.no_workspaces": "No workspaces available.",
};

function t(key, values = {}) {
  return (translations[key] || key).replace("{{agent}}", values.agent || "");
}

function renderModal(props = {}) {
  return renderToStaticMarkup(
    <AttachToWorkspaceModal
      agent={{ id: "molt-matrix", name: "Matrix Coordinator" }}
      isOpen
      onClose={() => {}}
      onSuccess={() => {}}
      t={t}
      workspaces={[{ slug: "demo", name: "Demo workspace" }]}
      {...props}
    />
  );
}

describe("Molt attach to workspace modal", () => {
  test("loads workspace list through Workspace.all", async () => {
    const workspaceModel = {
      all: vi.fn(async () => [{ slug: "demo", name: "Demo workspace" }]),
    };

    await expect(loadAttachWorkspaces({ workspaceModel })).resolves.toEqual([
      { slug: "demo", name: "Demo workspace" },
    ]);
    expect(workspaceModel.all).toHaveBeenCalledTimes(1);
  });

  test("renders the workspace selector and display name field", () => {
    const markup = renderModal();

    expect(markup).toContain("Attach Matrix Coordinator to workspace");
    expect(markup).toContain("Workspace");
    expect(markup).toContain("Demo workspace");
    expect(markup).toContain("Display name");
    expect(markup).toContain('placeholder="Matrix Coordinator"');
  });

  test("selecting a workspace and submitting calls Molt.attachWorkspaceAgent", async () => {
    const molt = {
      attachWorkspaceAgent: vi.fn(async () => ({ success: true })),
    };

    await attachMoltAgentToWorkspace({
      agent: { id: "molt-matrix", name: "Matrix Coordinator" },
      displayName: "Matrix Lead",
      molt,
      slug: "demo",
    });

    expect(molt.attachWorkspaceAgent).toHaveBeenCalledWith("demo", {
      moltAgentId: "molt-matrix",
      displayName: "Matrix Lead",
    });
  });

  test("successful attach renders workspace AI Team link", () => {
    const markup = renderModal({
      attachResult: { success: true, workspaceSlug: "demo" },
    });

    expect(markup).toContain("Attached.");
    expect(markup).toContain("Open workspace AI Team");
    expect(markup).toContain("/workspace/demo/ai-team");
  });

  test("403 response renders workspace admin permission guidance", () => {
    expect(attachErrorMessage({ status: 403 }, t)).toBe(
      "You need workspace admin permission to attach this Molt agent."
    );

    const markup = renderModal({
      attachResult: { success: false, status: 403, error: "Forbidden" },
    });
    expect(markup).toContain("workspace admin permission");
  });

  test("network errors render generic error without clearing form values", async () => {
    const result = await attachMoltAgentToWorkspace({
      agent: { id: "molt-matrix", name: "Matrix Coordinator" },
      displayName: "Matrix Lead",
      molt: {
        attachWorkspaceAgent: vi.fn(async () => {
          throw new Error("Network down");
        }),
      },
      slug: "demo",
    });
    expect(result.success).toBe(false);

    const markup = renderModal({
      attachResult: result,
      displayName: "Matrix Lead",
      selectedSlug: "demo",
    });
    expect(markup).toContain("Unable to attach this Molt agent.");
    expect(markup).toContain('value="Matrix Lead"');
    expect(markup).toContain('value="demo" selected=""');
  });

  test("Cancel and close controls are wired to onClose", () => {
    const markup = renderModal();
    const modalSource = source(
      "src/pages/Admin/SgaSettings/AttachToWorkspaceModal.jsx"
    );

    expect(markup).toContain("Cancel");
    expect(markup).toContain('aria-label="Cancel"');
    expect(modalSource).toContain("onClick={onClose}");
  });

  test("console agent row renders Attach to workspace action", () => {
    const markup = renderToStaticMarkup(
      <AgentsSection
        agents={[
          {
            id: "molt-matrix",
            name: "Matrix Coordinator",
            status: "online",
            capabilities: [],
          },
        ]}
        connectionState="CONNECTED"
        error={null}
        isLoading={false}
        onAttachAgent={() => {}}
        onSelectAgent={() => {}}
        selectedAgentId={null}
        t={t}
      />
    );
    const page = source("src/pages/Admin/SgaSettings/index.jsx");

    expect(markup).toContain("Attach to workspace");
    expect(page).toContain("AttachToWorkspaceModal");
    expect(page).toContain("setAttachAgent");
  });

  test("defines required attach translation keys", () => {
    const zh = source("src/locales/zh/common.js");
    const en = source("src/locales/en/common.js");
    const keys = [
      "molt.console.agents.attach_action",
      "molt.console.attach.title",
      "molt.console.attach.workspace_label",
      "molt.console.attach.display_name_label",
      "molt.console.attach.submit",
      "molt.console.attach.cancel",
      "molt.console.attach.loading",
      "molt.console.attach.success_title",
      "molt.console.attach.success_link",
      "molt.console.attach.error_403",
      "molt.console.attach.error_generic",
      "molt.console.attach.no_workspaces",
    ];

    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});
