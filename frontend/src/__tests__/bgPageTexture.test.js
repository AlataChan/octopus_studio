import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = path.resolve(__dirname, "..");

// Allowlist: page files that own a full-screen root container.
// Each must have bg-page-texture.
const PAGE_ALLOWLIST = [
  "pages/GeneralSettings/EmbeddingPreference/index.jsx",
  "pages/GeneralSettings/PrivacyAndData/index.jsx",
  "pages/GeneralSettings/Settings/Interface/index.jsx",
  "pages/GeneralSettings/Settings/Branding/index.jsx",
  "pages/GeneralSettings/Settings/Chat/index.jsx",
  "pages/GeneralSettings/CommunityHub/Trending/index.jsx",
  "pages/GeneralSettings/CommunityHub/ImportItem/Steps/index.jsx",
  "pages/GeneralSettings/CommunityHub/Authentication/index.jsx",
  "pages/GeneralSettings/TranscriptionPreference/index.jsx",
  "pages/GeneralSettings/BrowserExtensionApiKey/index.jsx",
  "pages/GeneralSettings/MyBilling/index.jsx",
  "pages/GeneralSettings/Security/index.jsx",
  "pages/GeneralSettings/AudioPreference/index.jsx",
  "pages/GeneralSettings/ApiKeys/index.jsx",
  "pages/GeneralSettings/EmbeddingTextSplitterPreference/index.jsx",
  "pages/GeneralSettings/VectorDatabase/index.jsx",
  "pages/GeneralSettings/MobileConnections/index.jsx",
  "pages/GeneralSettings/ChatEmbedWidgets/index.jsx",
  "pages/GeneralSettings/LLMPreference/index.jsx",
  "pages/GeneralSettings/Chats/index.jsx",
  "pages/OpenClaw/index.jsx",
  "pages/DocumentManager/index.jsx",
  "pages/WorkspaceAITeam/index.jsx",
  "pages/OnboardingFlow/Steps/Home/index.jsx",
  "pages/OnboardingFlow/Steps/index.jsx",
  "pages/Admin/ExperimentalFeatures/Features/LiveSync/manage/index.jsx",
  "pages/Admin/ExperimentalFeatures/index.jsx",
  "pages/Admin/AISystem/index.jsx",
  "pages/Admin/Agents/index.jsx",
  "pages/Admin/Observability/index.jsx",
  "pages/Admin/KnowledgeGraph/index.jsx",
  "pages/Admin/Workspaces/index.jsx",
  "pages/Admin/SgaSettings/index.jsx",
  "pages/Admin/Users/index.jsx",
  "pages/Admin/Logging/index.jsx",
  "pages/Admin/Billing/index.jsx",
  "pages/Admin/SystemPromptVariables/index.jsx",
  "pages/Admin/Acknowledgments/index.jsx",
  "pages/Admin/ImGateway/index.jsx",
  "pages/Admin/Invitations/index.jsx",
  "pages/Admin/AgentBuilder/index.jsx",
  "pages/Docs/DocsLayout.jsx",
  "pages/SkillHub/SkillCreate.jsx",
  "pages/SkillHub/SkillAutobot.jsx",
  "pages/SkillHub/index.jsx",
  "pages/SkillHub/SkillDetail.jsx",
  "pages/Invite/index.jsx",
  "pages/AssistantLibrary/CreateAssistant/index.jsx",
  "pages/AssistantLibrary/index.jsx",
  "pages/WorkspaceGraph/index.jsx",
  "pages/WorkspaceSettings/index.jsx",
  "pages/WorkspaceChat/index.jsx",
  "pages/Main/index.jsx",
  "pages/Login/SSO/simple.jsx",
  // Special cases handled in components
  "components/Preloader.jsx",
];

// Pages whose direct children are ALL components (Sidebar, WorkspaceChatContainer, etc.)
// Stacking context for these is solved in the shared sidebar components — not the page file.
// For these files, we only check bg-page-texture, not z-[1] in the page file itself.
const COMPONENT_CHILDREN_PAGES = new Set([
  "pages/Main/index.jsx",
  "pages/WorkspaceChat/index.jsx",
]);

describe("bg-page-texture coverage", () => {
  it("every page shell in the allowlist has bg-page-texture", () => {
    for (const rel of PAGE_ALLOWLIST) {
      const content = fs.readFileSync(path.join(BASE, rel), "utf8");
      expect(content, `${rel} missing bg-page-texture`).toContain(
        "bg-page-texture"
      );
    }
  });

  it("pages with inline content divs have z-[1] stacking context; component-children pages exempt", () => {
    for (const rel of PAGE_ALLOWLIST) {
      if (COMPONENT_CHILDREN_PAGES.has(rel)) continue; // stacking context in shared components
      const content = fs.readFileSync(path.join(BASE, rel), "utf8");
      const hasZ = content.includes("z-[1]") || content.includes("z-index: 1");
      expect(
        hasZ,
        `${rel} missing z-[1] stacking context on content child`
      ).toBe(true);
    }
  });

  it("shared sidebar components have relative z-[1] for stacking context", () => {
    const sidebar = fs.readFileSync(
      path.join(BASE, "components/Sidebar/index.jsx"),
      "utf8"
    );
    const settingsSidebar = fs.readFileSync(
      path.join(BASE, "components/SettingsSidebar/index.jsx"),
      "utf8"
    );
    expect(sidebar).toContain("relative z-[1]");
    expect(settingsSidebar).toContain("relative z-[1]");
  });

  it("keeps bg-page-texture and bg-tech-pattern as neutral compatibility classes", () => {
    const css = fs.readFileSync(path.join(BASE, "index.css"), "utf8");
    expect(css).toContain(".bg-page-texture");
    expect(css).toContain(".bg-tech-pattern");
    expect(css).toMatch(/\.bg-page-texture::before,\s*\.bg-page-texture::after\s*{[\s\S]*content:\s*none/);
    expect(css).toMatch(/\.bg-tech-pattern::before,\s*\.bg-tech-pattern::after\s*{[\s\S]*content:\s*none/);
    expect(css).toContain("--bg-aurora-blue: transparent");
    expect(css).toContain("--bg-dot-color: transparent");
  });
});
