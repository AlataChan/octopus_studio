import React, { useState, useEffect } from "react";
import {
  X,
  CheckCircle,
  Warning,
  Briefcase,
  ChartLine,
  PencilSimple,
  Trash,
  Sparkle,
  User,
  ChatCircle,
  UsersThree,
  ArrowRight,
} from "@phosphor-icons/react";
import Button from "@/components/Button";
import ModalWrapper from "@/components/ModalWrapper";
import AssistantLibrary from "@/models/assistantLibrary";
import Workspace from "@/models/workspace";
import { useNavigate } from "react-router-dom";
import paths from "@/utils/paths";
import useUser from "@/hooks/useUser";
import showToast from "@/utils/toast";
import SourceBadge from "./SourceBadge";

/**
 * AI 员工详情弹窗组件
 * 显示 AI 员工的完整档案信息并提供聘用功能
 * @param {Object} assistant - AI 员工模板数据
 * @param {Function} onClose - 关闭弹窗的回调函数
 */
export default function AssistantDetail({ assistant, onClose, onUpdate }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const isAdmin = user?.role === "admin";

  // 调试：打印用户信息
  console.log("[AssistantDetail] User info:", { user, isAdmin });

  const {
    avatarUrl,
    employeeName,
    employeeTitle,
    employeeBio,
    category,
    industry,
    skills,
    platformType,
    source,
  } = assistant;

  // 获取完整的头像 URL
  const fullAvatarUrl = AssistantLibrary.getIconUrl(avatarUrl);

  // 解析 JSON 字段（后端已经解析过了，直接使用或提供默认值）
  const skillsList = Array.isArray(skills)
    ? skills
    : skills
      ? JSON.parse(skills)
      : [];

  // 已安装该助手的工作区 slug 集合
  const [installedWorkspaceSlugs, setInstalledWorkspaceSlugs] = useState(
    new Set()
  );

  // 加载用户的 Workspace 列表，并检查哪些工作区已安装该助手
  useEffect(() => {
    async function fetchWorkspacesAndCheckInstalled() {
      const workspaceList = await Workspace.all();
      setWorkspaces(workspaceList || []);

      // 检查每个工作区是否已安装该助手
      if (workspaceList && workspaceList.length > 0 && assistant?.id) {
        const installedSlugs = new Set();
        const WorkspaceAssistantModel = (
          await import("@/models/workspaceAssistant")
        ).default;

        // 并行检查所有工作区
        await Promise.all(
          workspaceList.map(async (ws) => {
            try {
              const result = await WorkspaceAssistantModel.list(ws.slug);
              if (result.success) {
                const assistants = result.data.assistants || [];
                const isInstalled = assistants.some(
                  (a) => a.templateId === assistant.id
                );
                if (isInstalled) {
                  installedSlugs.add(ws.slug);
                }
              }
            } catch (error) {
              console.error(`检查工作区 ${ws.slug} 失败:`, error);
            }
          })
        );

        setInstalledWorkspaceSlugs(installedSlugs);

        // 默认选择第一个未安装的工作区
        const firstAvailable = workspaceList.find(
          (ws) => !installedSlugs.has(ws.slug)
        );
        if (firstAvailable) {
          setSelectedWorkspace(firstAvailable.slug);
        } else if (workspaceList.length > 0) {
          setSelectedWorkspace(workspaceList[0].slug);
        }
      }
    }
    fetchWorkspacesAndCheckInstalled();
  }, [assistant?.id]);

  // 处理编辑
  const handleEdit = () => {
    navigate(paths.editAssistant(assistant.id));
  };

  // 处理删除
  const handleDelete = async () => {
    if (
      !window.confirm(`确定要删除助手"${employeeName}"吗？此操作不可撤销。`)
    ) {
      return;
    }

    setLoading(true);
    try {
      const result = await AssistantLibrary.delete(assistant.id);
      if (result.success) {
        showToast("助手已删除", "success");
        onClose();
        if (onUpdate) onUpdate(); // 刷新列表
      } else {
        showToast(result.error || "删除失败", "error");
      }
    } catch (error) {
      showToast(error.message || "删除失败", "error");
    } finally {
      setLoading(false);
    }
  };

  // 处理雇佣助手
  const handleInstall = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await AssistantLibrary.install({
        templateId: assistant.id,
        workspaceSlug: selectedWorkspace,
        instanceName: instanceName || undefined,
      });

      if (result.success) {
        setSuccess(true);
        // P0: 不再自动跳转，而是显示引导选项让用户选择
      } else {
        // 检查是否是"已安装"错误
        if (result.error && result.error.includes("already installed")) {
          setError(
            <span>
              该助手已安装。
              <a
                href={`/workspace/${selectedWorkspace}/settings/assistants`}
                className="text-sky-400 hover:text-sky-300 underline ml-1"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(
                    `/workspace/${selectedWorkspace}/settings/assistants`
                  );
                }}
              >
                前往查看
              </a>
            </span>
          );
        } else {
          setError(result.error || "安装失败");
        }
      }
    } catch (err) {
      setError(err.message || "安装失败");
    } finally {
      setLoading(false);
    }
  };

  // P0: 跳转到聊天页面
  const handleGoToChat = () => {
    navigate(paths.workspace.chat(selectedWorkspace));
  };

  // P0: 跳转到 AI 团队页面
  const handleGoToTeam = () => {
    navigate(paths.workspace.aiTeam(selectedWorkspace));
  };

  // 简化版本：只显示基本信息和聘用功能
  return (
    <ModalWrapper isOpen={true}>
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-y-auto">
        {/* 头部按钮组 */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                iconOnly
                onClick={handleEdit}
                size="sm"
                title="编辑助手"
                variant="primary"
              >
                <PencilSimple size={20} weight="bold" />
              </Button>
              <Button
                className="shadow-lg"
                iconOnly
                onClick={handleDelete}
                disabled={loading}
                size="sm"
                title="删除助手"
                variant="danger"
              >
                <Trash size={20} weight="bold" />
              </Button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-theme-bg-container hover:bg-theme-bg-container/80 transition-colors shadow-lg"
          >
            <X size={20} className="text-theme-text-secondary" />
          </button>
        </div>

        {/* 员工信息卡片 */}
        <div className="p-8">
          <div className="flex items-start gap-6 mb-6">
            {/* 头像 */}
            {fullAvatarUrl ? (
              <img
                src={fullAvatarUrl}
                alt={employeeName}
                className="w-24 h-24 rounded-2xl object-cover border-4 border-theme-accent-primary shadow-lg flex-shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-theme-accent-primary/20 border-4 border-theme-accent-primary shadow-lg flex-shrink-0 flex items-center justify-center">
                <User
                  size={48}
                  weight="fill"
                  className="text-theme-accent-primary"
                />
              </div>
            )}

            {/* 基本信息 */}
            <div className="flex-grow">
              <h3 className="text-2xl font-bold text-theme-text-primary mb-2">
                {employeeName}
              </h3>
              <p className="text-lg text-theme-accent-primary font-semibold mb-3">
                {employeeTitle}
              </p>
              <div className="flex items-center gap-4 text-sm text-theme-text-secondary">
                <div className="flex items-center gap-2">
                  <Briefcase size={16} />
                  <span>{category}</span>
                </div>
                {industry && (
                  <div className="flex items-center gap-2">
                    <ChartLine size={16} />
                    <span>{industry}</span>
                  </div>
                )}
              </div>

              {/* 平台类型标识 */}
              {platformType && platformType !== "internal" && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-theme-accent-primary/10 text-theme-accent-primary text-sm font-semibold rounded-lg">
                  <Sparkle size={16} weight="fill" />
                  <span>
                    由{" "}
                    {platformType === "dify"
                      ? "Dify"
                      : platformType === "ragflow"
                        ? "RAGFlow"
                        : platformType === "n8n"
                          ? "n8n"
                          : platformType === "coze"
                            ? "Coze"
                            : platformType === "fastgpt"
                              ? "FastGPT"
                              : platformType}{" "}
                    平台提供
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 员工简介 */}
          <div className="mb-6">
            <p className="text-theme-text-secondary leading-relaxed">
              {employeeBio}
            </p>
          </div>

          {/* 核心技能 */}
          {skillsList.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-theme-text-primary mb-3">
                核心技能
              </h4>
              <div className="flex flex-wrap gap-2">
                {skillsList.slice(0, 6).map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-theme-accent-primary/10 text-theme-accent-primary rounded-md text-sm"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 聘用表单 */}
          <form onSubmit={handleInstall} className="space-y-4">
            {/* 选择工作空间 */}
            <div>
              <label className="block text-sm font-semibold text-theme-text-primary mb-2">
                选择工作空间 *
              </label>
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="w-full px-4 py-2 bg-theme-bg-container border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-theme-accent-primary"
                required
              >
                {workspaces.map((ws) => {
                  const isInstalled = installedWorkspaceSlugs.has(ws.slug);
                  return (
                    <option
                      key={ws.slug}
                      value={ws.slug}
                      disabled={isInstalled}
                    >
                      {ws.name}
                      {isInstalled ? " (已聘用)" : ""}
                    </option>
                  );
                })}
              </select>
              {installedWorkspaceSlugs.size > 0 && (
                <p className="mt-1 text-xs text-theme-text-secondary">
                  灰色选项表示该工作空间已聘用此员工
                </p>
              )}
            </div>

            {/* 自定义名称（可选） */}
            <div>
              <label className="block text-sm font-semibold text-theme-text-primary mb-2">
                自定义名称（可选）
              </label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder={`默认使用 "${employeeName}"`}
                className="w-full px-4 py-2 bg-theme-bg-container border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:ring-2 focus:ring-theme-accent-primary"
              />
            </div>

            {/* 外部平台安全提示 */}
            {platformType && platformType !== "internal" && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <Warning
                  size={20}
                  className="text-yellow-500 flex-shrink-0 mt-0.5"
                />
                <div className="text-sm text-yellow-500">
                  <p className="font-semibold mb-1">数据安全提示</p>
                  <p className="text-yellow-500/80">
                    此助手由外部平台 (
                    {platformType === "dify"
                      ? "Dify"
                      : platformType === "ragflow"
                        ? "RAGFlow"
                        : platformType === "n8n"
                          ? "n8n"
                          : platformType}
                    ) 提供服务，对话数据将发送到该平台。
                    如需完全私有化部署，请使用内置助手。
                  </p>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <Warning size={20} className="text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-500">{error}</span>
              </div>
            )}

            {/* P0: 成功引导 - 提供立即对话和查看团队两个选项 */}
            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle
                    size={24}
                    className="text-green-500"
                    weight="fill"
                  />
                  <div>
                    <p className="text-green-500 font-semibold">录用成功！</p>
                    <p className="text-green-500/80 text-sm">
                      「{instanceName || employeeName}」已加入「
                      {workspaces.find((ws) => ws.slug === selectedWorkspace)
                        ?.name || selectedWorkspace}
                      」
                    </p>
                  </div>
                </div>
                <p className="text-theme-text-secondary text-sm mb-4">
                  接下来您可以：
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1"
                    type="button"
                    onClick={handleGoToChat}
                  >
                    <ChatCircle size={20} weight="fill" />
                    <span>立即对话</span>
                    <ArrowRight size={16} />
                  </Button>
                  <Button
                    className="flex-1 border-theme-border bg-theme-bg-container text-theme-text-primary hover:bg-theme-bg-container/80"
                    type="button"
                    onClick={handleGoToTeam}
                    variant="secondary"
                  >
                    <UsersThree size={20} weight="fill" />
                    <span>查看团队</span>
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </div>
            )}

            {/* 操作按钮 - 录用成功后隐藏 */}
            {!success && (
              <>
                {/* 桥接文案：明确显示功能名和岗位的对应关系 */}
                <div className="text-sm text-theme-text-secondary pt-2 border-t border-theme-border">
                  <span>你正在雇佣：</span>
                  <span className="font-semibold text-theme-text-primary">
                    {assistant.name}
                  </span>
                  {assistant.employeeTitle && (
                    <span className="text-theme-text-secondary">
                      （岗位：
                      <span className="text-theme-accent-primary">
                        {assistant.employeeTitle}
                      </span>
                      ）
                    </span>
                  )}
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    className="flex-1 border-theme-border bg-theme-bg-container text-theme-text-primary hover:bg-theme-bg-container/80"
                    type="button"
                    onClick={onClose}
                    variant="secondary"
                  >
                    取消
                  </Button>
                  <Button
                    className="flex-1"
                    type="submit"
                    disabled={loading || !selectedWorkspace}
                    loading={loading}
                  >
                    {loading ? "聘用中..." : "一键聘用"}
                  </Button>
                </div>
              </>
            )}
          </form>

          <SourceBadge source={source} />
        </div>
      </div>
    </ModalWrapper>
  );
}
