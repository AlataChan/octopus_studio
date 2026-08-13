import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isMobile } from "react-device-detect";
import {
  ArrowLeft,
  DownloadSimple,
  GithubLogo,
  Plus,
} from "@phosphor-icons/react";

import Sidebar from "@/components/Sidebar";
import Button from "@/components/Button";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import Workspace from "@/models/workspace";
import SkillHub from "@/models/skillHub";

export default function SkillCreatePage() {
  const navigate = useNavigate();
  const [githubUrl, setGithubUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);

  useEffect(() => {
    const load = async () => {
      const ws = await Workspace.all();
      setWorkspaces(ws || []);
      if ((ws || []).length > 0) setWorkspaceId(ws[0].id);
    };
    load();
  }, []);

  const handleCreate = async () => {
    if (!githubUrl.trim()) return showToast("请输入 GitHub URL", "warning");
    setCreating(true);
    setCreated(null);
    try {
      const res = await SkillHub.createFromUrl({ githubUrl: githubUrl.trim() });
      if (!res?.success) throw new Error(res?.error || "创建失败");
      setCreated(res);
      showToast("创建成功", "success");
    } catch (error) {
      showToast(error.message || "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleInstallCreated = async () => {
    if (!created?.skillId) return;
    if (!workspaceId) return showToast("请先选择 Workspace", "warning");
    const res = await SkillHub.install({
      skillId: created.skillId,
      workspaceId,
    });
    if (!res?.success) return showToast(res?.error || "安装失败", "error");
    showToast("已安装", "success");
    navigate(paths.skillHubSkill(res.skillId || created.skillId));
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      {!isMobile && <Sidebar />}
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="transition-all duration-500 relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        <div className="sticky top-0 z-10 bg-theme-bg-secondary border-b-2 border-theme-border px-4 md:px-8 py-6 pr-16 md:pr-24">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate(paths.skillHub())}
              className="p-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all"
              title="返回"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
              创建 Skill
            </h1>
          </div>
          <p className="text-theme-text-secondary text-sm md:text-base">
            从 GitHub URL 导入生成 `skill.md`（需要开启
            `SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED=allow_all`）
          </p>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
            <h2 className="text-lg font-bold text-theme-text-primary mb-4">
              从 GitHub 导入
            </h2>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex items-center gap-2 flex-1">
                <GithubLogo size={20} className="text-theme-text-secondary" />
                <input
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full px-3 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={creating}
                loading={creating}
              >
                {!creating && <Plus size={18} weight="bold" />}
                {creating ? "创建中..." : "创建"}
              </Button>
            </div>

            {created?.success && (
              <div className="mt-4 p-4 rounded-lg bg-theme-bg-container border border-theme-border space-y-2">
                <div className="text-sm text-theme-text-secondary">
                  Skill ID:{" "}
                  <span className="text-theme-text-primary font-mono">
                    {created.skillId}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="sidebar"
                    onClick={() =>
                      navigate(paths.skillHubSkill(created.skillId))
                    }
                  >
                    查看详情
                  </Button>
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <span className="text-xs text-theme-text-secondary whitespace-nowrap">
                      Workspace
                    </span>
                    <select
                      value={workspaceId || ""}
                      onChange={(e) => setWorkspaceId(Number(e.target.value))}
                      className="flex-grow bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                    >
                      {(workspaces || []).map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button onClick={handleInstallCreated} size="sm">
                    <DownloadSimple size={18} weight="bold" />
                    安装到 Workspace
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
