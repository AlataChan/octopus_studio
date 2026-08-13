import { useNavigate } from "react-router-dom";
import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import { Wrench, Lightning, UserCircle } from "@phosphor-icons/react";

/**
 * 进阶功能区 - 简化版小卡片
 * 三个功能：创建员工技能、创建快捷命令、设置员工人设
 */
export default function ExploreFeatures() {
  const navigate = useNavigate();

  // 创建员工技能 - 跳转到 Agent Flow Builder
  const createSkill = () => navigate(paths.agents.builder());

  // 创建快捷命令 - 打开斜杠命令创建弹窗
  const createSlashCommand = async () => {
    const workspaces = await Workspace.all();
    if (workspaces.length > 0) {
      const firstWorkspace = workspaces[0];
      navigate(
        paths.workspace.chat(firstWorkspace.slug, {
          search: { action: "open-new-slash-command-modal" },
        })
      );
    }
  };

  // 设置员工人设 - 跳转到系统提示设置
  const setPersona = async () => {
    const workspaces = await Workspace.all();
    if (workspaces.length > 0) {
      const firstWorkspace = workspaces[0];
      navigate(
        paths.workspace.settings.chatSettings(firstWorkspace.slug, {
          search: { action: "focus-system-prompt" },
        })
      );
    }
  };

  const features = [
    {
      icon: Wrench,
      title: "创建员工技能",
      description: "为 AI 员工添加新的工作能力",
      onClick: createSkill,
    },
    {
      icon: Lightning,
      title: "创建快捷命令",
      description: "用 / 快速触发常用指令",
      onClick: createSlashCommand,
    },
    {
      icon: UserCircle,
      title: "设置员工人设",
      description: "定义 AI 员工的性格与回复风格",
      onClick: setPersona,
    },
  ];

  return (
    <div className="mt-2">
      <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
        {features.map((feature) => (
          <button
            key={feature.title}
            onClick={feature.onClick}
            className="group flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-theme-border transition-all duration-200 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-white/5 group-hover:bg-white/10 flex items-center justify-center flex-shrink-0 transition-colors">
              <feature.icon
                size={18}
                className="text-theme-text-secondary group-hover:text-theme-text-secondary"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-theme-home-text font-medium truncate">
                {feature.title}
              </span>
              <span className="text-xs text-theme-text-secondary truncate">
                {feature.description}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
