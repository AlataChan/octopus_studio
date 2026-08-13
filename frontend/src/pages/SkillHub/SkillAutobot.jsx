import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isMobile } from "react-device-detect";
import { ArrowLeft, PaperPlaneRight, Robot } from "@phosphor-icons/react";

import Sidebar from "@/components/Sidebar";
import Button from "@/components/Button";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import Workspace from "@/models/workspace";
import SkillHub from "@/models/skillHub";

export default function SkillAutobotPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const load = async () => {
      const ws = await Workspace.all();
      setWorkspaces(ws || []);
      if ((ws || []).length > 0) setWorkspaceId(ws[0].id);
    };
    load();
  }, []);

  const send = async () => {
    const text = message.trim();
    if (!text) return;
    setMessage("");
    setHistory((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);

    try {
      const res = await SkillHub.autobot(text, { workspaceId });
      if (!res?.success) throw new Error(res?.error || "Autobot 暂不可用");
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: JSON.stringify(res, null, 2) },
      ]);
    } catch (error) {
      showToast(error.message || "发送失败", "error");
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: error.message || "Autobot error" },
      ]);
    } finally {
      setSending(false);
    }
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
            <Robot
              size={28}
              weight="fill"
              className="text-theme-accent-primary"
            />
            <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
              Skill Autobot
            </h1>
          </div>
          <p className="text-theme-text-secondary text-sm md:text-base">
            通过对话自动搜索/推荐/安装 Skills（MVP）
          </p>

          <div className="mt-4 flex items-center gap-2 min-w-[220px]">
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
        </div>

        <div className="p-4 md:p-8">
          <div className="rounded-xl border-2 border-theme-sidebar-border bg-theme-bg-secondary overflow-hidden flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {history.length === 0 && (
                <div className="text-theme-text-secondary text-sm">
                  例子：我需要一个处理发票的能力
                </div>
              )}
              {history.map((h, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${
                    h.role === "user"
                      ? "bg-theme-accent-primary/10 text-theme-text-primary ml-8"
                      : "bg-theme-bg-container text-theme-text-primary mr-8"
                  }`}
                >
                  <div className="text-xs text-theme-text-secondary mb-1">
                    {h.role}
                  </div>
                  {h.content}
                </div>
              ))}
            </div>

            <div className="border-t border-theme-border p-3 flex items-center gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sending) send();
                  }
                }}
                placeholder="描述你想要的能力..."
                className="flex-1 px-3 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
              />
              <Button onClick={send} disabled={sending} loading={sending}>
                {!sending && <PaperPlaneRight size={18} weight="fill" />}
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
