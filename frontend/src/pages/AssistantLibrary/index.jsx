import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Button from "@/components/Button";
import { isMobile } from "react-device-detect";
import {
  MagnifyingGlass,
  Sparkle,
  FunnelSimple,
  Plus,
  UsersThree,
  ArrowRight,
} from "@phosphor-icons/react";
import AssistantLibrary from "@/models/assistantLibrary";
import AssistantCard, { AssistantCardSkeleton } from "./AssistantCard";
import AssistantDetail from "./AssistantDetail";
import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import WorkspaceAssistant from "@/models/workspaceAssistant";

/**
 * AI 员工库主页面（人才市场）
 * 提供 AI 员工的浏览、搜索和筛选功能
 */
export default function AssistantLibraryPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState([]); // 多选部门筛选（Phase D）
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssistant, setSelectedAssistant] = useState(null);

  // P1 & P2: 当前 Workspace 相关状态
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [hiredTemplateIds, setHiredTemplateIds] = useState(new Set());
  const [hiredCount, setHiredCount] = useState(0);

  const isAdmin = user?.role === "admin";

  // P1 & P2: 获取当前 Workspace 和已雇佣员工
  useEffect(() => {
    const fetchCurrentWorkspaceAndHired = async () => {
      try {
        // 从 URL 获取当前 workspace slug
        const pathParts = window.location.pathname.split("/");
        const workspaceIndex = pathParts.indexOf("workspace");
        let workspaceSlug = null;

        if (workspaceIndex !== -1 && pathParts[workspaceIndex + 1]) {
          const slug = pathParts[workspaceIndex + 1];
          if (!["settings", "graph", "ai-team"].includes(slug)) {
            workspaceSlug = slug;
          }
        }

        // 如果 URL 中没有，获取第一个 workspace
        if (!workspaceSlug) {
          const workspaces = await Workspace.all();
          if (workspaces && workspaces.length > 0) {
            workspaceSlug = workspaces[0].slug;
            setCurrentWorkspace(workspaces[0]);
          }
        } else {
          // 获取 workspace 详情
          const workspace = await Workspace.bySlug(workspaceSlug);
          setCurrentWorkspace(workspace);
        }

        // 获取该 workspace 已雇佣的员工
        if (workspaceSlug) {
          const result = await WorkspaceAssistant.list(workspaceSlug);
          if (result.success) {
            const assistants = result.data.assistants || [];
            const templateIds = new Set(assistants.map((a) => a.templateId));
            setHiredTemplateIds(templateIds);
            setHiredCount(assistants.length);
          }
        }
      } catch (error) {
        console.error("获取当前 workspace 失败:", error);
      }
    };

    fetchCurrentWorkspaceAndHired();
  }, []);

  // 加载助手模板和分类
  const fetchData = async () => {
    setLoading(true);
    try {
      // 并行加载模板和分类
      const [templatesResult, categoriesResult] = await Promise.all([
        AssistantLibrary.list(),
        AssistantLibrary.getCategories(),
      ]);

      if (templatesResult.success) {
        setTemplates(templatesResult.data.templates || []);
      }

      if (categoriesResult.success) {
        setCategories(categoriesResult.data.categories || []);
      }
    } catch (error) {
      console.error("Error loading assistant library:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 应用筛选和搜索
  const filteredTemplates = templates.filter((template) => {
    // 单选分类筛选（保留现有行为）
    if (selectedCategory && template.category !== selectedCategory) {
      return false;
    }

    // 多选部门筛选（Phase D 新增，与 selectedCategory 叠加生效）
    if (
      selectedDepartments.length > 0 &&
      !selectedDepartments.includes(template.category)
    ) {
      return false;
    }

    // 搜索筛选 - 支持多字段检索
    // 搜索范围：功能名(name)、人格名(employeeName)、岗位(employeeTitle)、描述、标签
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        // 功能名称
        template.name?.toLowerCase().includes(query) ||
        // 人格名称（如"露娜 Luna"）
        template.employeeName?.toLowerCase().includes(query) ||
        // 岗位名称（如"首席营销官 CMO"）
        template.employeeTitle?.toLowerCase().includes(query) ||
        // 描述
        template.description?.toLowerCase().includes(query) ||
        // 标签
        (template.tags &&
          template.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
    }

    return true;
  });

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      {!isMobile && <Sidebar />}
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="transition-all duration-500 relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        {/* 页面头部 */}
        <div className="sticky top-0 z-10 bg-theme-bg-secondary border-b-2 border-theme-border px-4 md:px-8 py-6 pr-16 md:pr-24">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <Sparkle
                size={32}
                weight="fill"
                className="text-theme-accent-primary"
              />
              <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
                人才市场
              </h1>
            </div>
            {isAdmin && (
              <Button
                className="mr-0 whitespace-nowrap md:mr-8"
                onClick={() => navigate(paths.createAssistant())}
              >
                <Plus size={20} weight="bold" />
                <span className="text-sm md:text-base">创建助手</span>
              </Button>
            )}
          </div>
          <p className="text-theme-text-secondary text-sm md:text-base mb-4">
            浏览并聘用经验丰富的 AI 员工，提升您的团队效率
          </p>

          {/* P2: 双向导航 - 跳转到我的团队 */}
          {currentWorkspace && hiredCount > 0 && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-theme-bg-container rounded-lg border border-theme-border">
              <UsersThree
                size={20}
                className="text-theme-accent-primary"
                weight="fill"
              />
              <span className="text-sm text-theme-text-secondary">
                「{currentWorkspace.name}」已有{" "}
                <span className="text-theme-accent-primary font-semibold">
                  {hiredCount}
                </span>{" "}
                名 AI 员工
              </span>
              <button
                onClick={() =>
                  navigate(paths.workspace.aiTeam(currentWorkspace.slug))
                }
                className="ml-auto flex items-center gap-1 text-sm text-theme-accent-primary hover:text-theme-accent-primary/80 font-medium transition-colors"
              >
                <span>查看我的团队</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* 搜索和筛选栏 */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* 搜索框 */}
            <div className="flex-grow relative">
              <MagnifyingGlass
                size={20}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-text-secondary"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索员工姓名、职位或技能..."
                className="w-full pl-10 pr-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
              />
            </div>

            {/* 分类筛选 */}
            <div className="flex items-center gap-2 min-w-[200px]">
              <FunnelSimple size={20} className="text-theme-text-secondary" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="flex-grow bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
              >
                <option value="">所有职位</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 部门多选筛选（Phase D — 复用 category 字段） */}
          {categories.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-theme-text-secondary">
                部门:
              </span>
              <button
                type="button"
                onClick={() => setSelectedDepartments([])}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedDepartments.length === 0
                    ? "bg-theme-accent-primary text-white"
                    : "bg-theme-settings-input-bg text-theme-text-secondary hover:text-theme-text-primary"
                }`}
              >
                全部
              </button>
              {categories.map((dept) => {
                const active = selectedDepartments.includes(dept);
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() =>
                      setSelectedDepartments((prev) =>
                        active
                          ? prev.filter((d) => d !== dept)
                          : [...prev, dept]
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-theme-accent-primary text-white"
                        : "bg-theme-settings-input-bg text-theme-text-secondary hover:text-theme-text-primary"
                    }`}
                  >
                    {dept}
                  </button>
                );
              })}
            </div>
          )}

          {/* 社区 tab 占位（Phase D — M2 保留位） */}
          <div className="mt-3 flex flex-col md:flex-row gap-4">
            <div className="flex-grow" />
            <div title="社区 agent 市场即将上线 (M2)" className="opacity-50">
              <button
                type="button"
                disabled
                className="flex w-full items-center gap-2 rounded-lg bg-theme-settings-input-bg px-3 py-2.5 text-sm text-theme-text-secondary md:w-auto"
              >
                <UsersThree size={18} />
                <span>社区</span>
                <span className="rounded bg-theme-bg-container px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]">
                  Coming Soon
                </span>
              </button>
            </div>
          </div>

          {/* 结果统计 */}
          <div className="mt-4 text-sm text-theme-text-secondary">
            {loading ? (
              "加载中..."
            ) : (
              <>
                找到{" "}
                <span className="text-theme-accent-primary font-medium">
                  {filteredTemplates.length}
                </span>{" "}
                位 AI 员工
                {selectedCategory && ` · 职位: ${selectedCategory}`}
                {searchQuery && ` · 搜索: "${searchQuery}"`}
              </>
            )}
          </div>
        </div>

        {/* AI 员工卡片网格 */}
        <div className="px-8 py-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[...Array(8)].map((_, index) => (
                <AssistantCardSkeleton key={index} />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Sparkle
                size={64}
                className="text-theme-text-secondary/20 mb-4"
              />
              <h3 className="text-xl font-semibold text-theme-text-primary mb-2">
                未找到匹配的 AI 员工
              </h3>
              <p className="text-theme-text-secondary">
                尝试调整搜索条件或筛选器
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredTemplates.map((template) => (
                <AssistantCard
                  key={template.id}
                  assistant={template}
                  onClick={setSelectedAssistant}
                  isHired={hiredTemplateIds.has(template.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI 员工详情弹窗 */}
      {selectedAssistant && (
        <AssistantDetail
          assistant={selectedAssistant}
          onClose={() => setSelectedAssistant(null)}
          onUpdate={() => {
            setSelectedAssistant(null);
            fetchData(); // 刷新列表
          }}
        />
      )}
    </div>
  );
}
