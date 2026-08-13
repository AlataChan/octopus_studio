import { useEffect, useRef, useState } from "react";
import { Tooltip } from "react-tooltip";
import { At } from "@phosphor-icons/react";
import { useIsAgentSessionActive } from "@/utils/chat/agent";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import WorkspaceAssistant from "@/models/workspaceAssistant";

export default function AvailableAgentsButton({ showing, setShowAgents }) {
  const { t } = useTranslation();
  const agentSessionActive = useIsAgentSessionActive();
  if (agentSessionActive) return null;
  return (
    <div
      id="agent-list-btn"
      data-tooltip-id="tooltip-agent-list-btn"
      data-tooltip-content={t("chat_window.agents")}
      aria-label={t("chat_window.agents")}
      onClick={() => setShowAgents(!showing)}
      className={`flex justify-center items-center cursor-pointer ${
        showing ? "!opacity-100" : ""
      }`}
    >
      <At
        color="var(--theme-sidebar-footer-icon-fill)"
        className={`w-[22px] h-[22px] pointer-events-none text-theme-text-primary opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60`}
      />
      <Tooltip
        id="tooltip-agent-list-btn"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </div>
  );
}

function AbilityTag({ translationKey }) {
  const { t } = useTranslation();
  return (
    <div className="px-2 bg-theme-action-menu-item-hover text-theme-text-secondary text-xs w-fit rounded-sm">
      <p>{t(translationKey)}</p>
    </div>
  );
}

export function AvailableAgents({
  showing,
  setShowing,
  sendCommand: _sendCommand, // 保留参数以兼容现有调用，但不再使用
  promptRef,
  selectedAssistantId, // 接收选中的AI员工ID
  workspaceSlug, // 接收workspace slug
}) {
  const formRef = useRef(null);
  const agentSessionActive = useIsAgentSessionActive();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  // 状态:员工的技能列表
  const [assistantSkills, setAssistantSkills] = useState(null);
  const [assistantName, setAssistantName] = useState(null);

  // 记录上一次成功匹配的 workspaceSlug，用于检测 workspace 切换
  const lastWorkspaceSlugRef = useRef(workspaceSlug);

  // 加载员工技能
  useEffect(() => {
    async function loadAssistantSkills() {
      // 如果没有选中员工或没有workspace,清空技能列表
      if (!selectedAssistantId || !workspaceSlug) {
        setAssistantSkills(null);
        setAssistantName(null);
        return;
      }

      try {
        const result = await WorkspaceAssistant.list(workspaceSlug);

        // 如果API调用失败,清空技能列表(使用默认技能)
        if (!result.success) {
          setAssistantSkills(null);
          setAssistantName(null);
          return;
        }

        const assistant = result.data.assistants.find(
          (a) => a.id === selectedAssistantId
        );

        // 如果找不到对应的员工，清空技能列表
        // 可能是跨 workspace 切换导致的暂时性不匹配，等待下次正确的调用
        if (!assistant || !assistant.template) {
          setAssistantSkills(null);
          setAssistantName(null);
          return;
        }

        // 成功找到，更新记录
        lastWorkspaceSlugRef.current = workspaceSlug;

        // defaultTools 可能是字符串或数组,需要处理
        let tools = assistant.template.defaultTools;
        if (typeof tools === "string") {
          try {
            tools = JSON.parse(tools);
          } catch (e) {
            console.error("Failed to parse defaultTools:", e);
            tools = [];
          }
        }

        setAssistantSkills(Array.isArray(tools) ? tools : []);
        setAssistantName(
          assistant.template.employeeName || assistant.template.name
        );
      } catch (error) {
        console.error("Failed to load assistant skills:", error);
        // 出错时清空技能列表,使用默认技能
        setAssistantSkills(null);
        setAssistantName(null);
      }
    }

    loadAssistantSkills();
  }, [selectedAssistantId, workspaceSlug]);

  /*
   * @checklist-item
   * If the URL has the agent param, open the agent menu for the user
   * automatically when the component mounts.
   */
  useEffect(() => {
    if (searchParams.get("action") === "set-agent-chat" && !showing)
      handleAgentClick();
  }, [promptRef.current]);

  useEffect(() => {
    function listenForOutsideClick() {
      if (!showing || !formRef.current) return false;
      document.addEventListener("click", closeIfOutside);
    }
    listenForOutsideClick();
  }, [showing, formRef.current]);

  const closeIfOutside = ({ target }) => {
    if (target.id === "agent-list-btn") return;
    const isOutside = !formRef?.current?.contains(target);
    if (!isOutside) return;
    setShowing(false);
  };

  /**
   * 点击技能按钮的处理
   * 注意：后端已实现基于 AI 员工配置的自动 Agent 模式触发
   * 所以这里不再插入 @agent 前缀，而是直接聚焦输入框让用户输入
   * 如果选中了有技能的 AI 员工，后端会自动启用 Agent 模式
   */
  const handleAgentClick = () => {
    setShowing(false);
    // 不再插入 @agent 前缀，后端会根据 AI 员工配置自动判断
    // 只是关闭菜单并聚焦输入框
    promptRef?.current?.focus();
  };

  // 技能名称映射
  const skillNameMap = {
    "web-browsing": "agent.skill.web.tag",
    "web-scraping": "agent.skill.scrape.tag",
    "rag-memory": "agent.skill.rag.tag",
    "document-summarizer": "agent.skill.view.tag",
    "save-file-to-browser": "agent.skill.save.tag",
    "create-chart": "agent.skill.generate.tag",
    "sql-agent": "SQL查询",
  };

  if (agentSessionActive) return null;
  return (
    <>
      <div hidden={!showing}>
        <div className="w-full flex justify-center absolute bottom-[130px] md:bottom-[150px] left-0 z-10 px-4">
          <div
            ref={formRef}
            className="w-[600px] p-2 bg-theme-action-menu-bg rounded-2xl shadow flex-col justify-center items-start gap-2.5 inline-flex"
          >
            <button
              onClick={handleAgentClick}
              className="border-none w-full hover:cursor-pointer hover:bg-theme-action-menu-item-hover px-2 py-2 rounded-xl flex flex-col justify-start group"
            >
              <div className="w-full flex-col text-left flex pointer-events-none">
                <div className="text-theme-text-primary text-sm">
                  <b>{t("chat_window.at_agent")}</b>
                  {assistantName
                    ? ` - ${assistantName} 可使用以下技能`
                    : t("chat_window.default_agent_description")}
                </div>
                <div className="text-theme-text-secondary text-xs mt-1">
                  {assistantName
                    ? "当前 AI 员工已配置技能，发送消息时会自动启用"
                    : "选择 AI 员工后，系统会根据配置自动使用相应技能"}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {assistantSkills && assistantSkills.length > 0 ? (
                    // 显示员工的技能
                    assistantSkills.map((skill) => (
                      <AbilityTag
                        key={skill}
                        translationKey={skillNameMap[skill] || skill}
                      />
                    ))
                  ) : (
                    // 显示默认技能
                    <>
                      <AbilityTag translationKey="agent.skill.rag.tag" />
                      <AbilityTag translationKey="agent.skill.scrape.tag" />
                      <AbilityTag translationKey="agent.skill.web.tag" />
                      <AbilityTag translationKey="agent.skill.save.tag" />
                      <AbilityTag translationKey="agent.skill.view.tag" />
                      <AbilityTag translationKey="agent.skill.generate.tag" />
                    </>
                  )}
                </div>
              </div>
            </button>
            <button
              type="button"
              disabled={true}
              className="w-full rounded-xl flex flex-col justify-start group"
            >
              <div className="w-full flex-col text-center flex pointer-events-none">
                <div className="text-theme-text-secondary text-xs italic">
                  {t("chat_window.custom_agents_coming_soon")}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function useAvailableAgents() {
  const [showAgents, setShowAgents] = useState(false);
  return { showAgents, setShowAgents };
}
