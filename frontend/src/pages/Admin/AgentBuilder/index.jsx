import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Tooltip } from "react-tooltip";

import BlockList, { BLOCK_TYPES, BLOCK_INFO } from "./BlockList";
import AddBlockMenu from "./AddBlockMenu";
import showToast from "@/utils/toast";
import AgentFlows from "@/models/agentFlows";
import SkillHub from "@/models/skillHub";
import { useTheme } from "@/hooks/useTheme";
import HeaderMenu from "./HeaderMenu";
import paths from "@/utils/paths";
import PublishEntityModal from "@/components/CommunityHub/PublishEntityModal";
import ModalWrapper from "@/components/ModalWrapper";
import { X } from "@phosphor-icons/react";

const DEFAULT_BLOCKS = [
  {
    id: "flow_info",
    type: BLOCK_TYPES.FLOW_INFO,
    config: {
      name: "",
      description: "",
    },
    isExpanded: true,
  },
  {
    id: "start",
    type: BLOCK_TYPES.START,
    config: {
      variables: [{ name: "", value: "" }],
    },
    isExpanded: true,
  },
  {
    id: "finish",
    type: BLOCK_TYPES.FINISH,
    config: {},
    isExpanded: false,
  },
];

export default function AgentBuilder() {
  const { flowId } = useParams();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("");
  const [_, setAgentDescription] = useState("");
  const [currentFlowUuid, setCurrentFlowUuid] = useState(null);
  const [active, setActive] = useState(true);
  const [blocks, setBlocks] = useState(DEFAULT_BLOCKS);
  const [selectedBlock, setSelectedBlock] = useState("start");
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [availableFlows, setAvailableFlows] = useState([]);
  const [selectedFlowForDetails, setSelectedFlowForDetails] = useState(null);
  const nameRef = useRef(null);
  const descriptionRef = useRef(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showSaveAsSkillModal, setShowSaveAsSkillModal] = useState(false);
  const [savingAsSkill, setSavingAsSkill] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [availableSkills, setAvailableSkills] = useState([]);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [slashCommand, setSlashCommand] = useState("");

  useEffect(() => {
    loadAvailableFlows();
  }, []);

  useEffect(() => {
    if (flowId) {
      loadFlow(flowId);
    }
  }, [flowId]);

  useEffect(() => {
    const flowInfoBlock = blocks.find(
      (block) => block.type === BLOCK_TYPES.FLOW_INFO
    );
    setAgentName(flowInfoBlock?.config?.name || "");
  }, [blocks]);

  const loadAvailableFlows = async () => {
    try {
      const { success, error, flows } = await AgentFlows.listFlows();
      if (!success) throw new Error(error);
      setAvailableFlows(flows);
    } catch (error) {
      console.error(error);
      showToast("加载可用流程失败", "error", { clear: true });
    }
  };

  const loadFlow = async (uuid) => {
    try {
      const { success, error, flow } = await AgentFlows.getFlow(uuid);
      if (!success) throw new Error(error);

      // Convert steps to blocks with IDs, ensuring finish block is at the end
      const flowBlocks = [
        {
          id: "flow_info",
          type: BLOCK_TYPES.FLOW_INFO,
          config: {
            name: flow.config.name,
            description: flow.config.description,
          },
          isExpanded: true,
        },
        ...flow.config.steps.map((step, index) => ({
          id: index === 0 ? "start" : `block_${index}`,
          type: step.type,
          config: step.config,
          isExpanded: true,
        })),
      ];

      // Add finish block if not present
      if (flowBlocks[flowBlocks.length - 1]?.type !== BLOCK_TYPES.FINISH) {
        flowBlocks.push({
          id: "finish",
          type: BLOCK_TYPES.FINISH,
          config: {},
          isExpanded: false,
        });
      }

      setAgentName(flow.config.name);
      setAgentDescription(flow.config.description);
      setActive(flow.config.active ?? true);
      setCurrentFlowUuid(flow.uuid);
      setBlocks(flowBlocks);
      setShowLoadMenu(false);
    } catch (error) {
      console.error(error);
      showToast("加载流程失败", "error", { clear: true });
    }
  };

  const addBlock = (type) => {
    const newBlock = {
      id: `block_${blocks.length}`,
      type,
      config: { ...BLOCK_INFO[type].defaultConfig },
      isExpanded: true,
    };
    // Insert the new block before the finish block
    const newBlocks = [...blocks];
    newBlocks.splice(newBlocks.length - 1, 0, newBlock);
    setBlocks(newBlocks);
    setShowBlockMenu(false);
  };

  const updateBlockConfig = (blockId, config) => {
    setBlocks(
      blocks.map((block) =>
        block.id === blockId
          ? { ...block, config: { ...block.config, ...config } }
          : block
      )
    );
  };

  const removeBlock = (blockId) => {
    if (blockId === "start") return;
    setBlocks(blocks.filter((block) => block.id !== blockId));
    if (selectedBlock === blockId) {
      setSelectedBlock("start");
    }
  };

  const saveFlow = async () => {
    const flowInfoBlock = blocks.find(
      (block) => block.type === BLOCK_TYPES.FLOW_INFO
    );
    const name = flowInfoBlock?.config?.name;
    const description = flowInfoBlock?.config?.description;

    if (!name?.trim() || !description?.trim()) {
      // Make sure the flow info block is expanded first
      if (!flowInfoBlock.isExpanded) {
        setBlocks(
          blocks.map((block) =>
            block.type === BLOCK_TYPES.FLOW_INFO
              ? { ...block, isExpanded: true }
              : block
          )
        );
        // Small delay to allow expansion animation to complete
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!name?.trim()) {
        nameRef.current?.focus();
      } else if (!description?.trim()) {
        descriptionRef.current?.focus();
      }
      showToast("请为流程提供名称和描述", "error", {
        clear: true,
      });
      return;
    }

    const flowConfig = {
      name,
      description,
      active,
      steps: blocks
        .filter(
          (block) =>
            block.type !== BLOCK_TYPES.FINISH &&
            block.type !== BLOCK_TYPES.FLOW_INFO
        )
        .map((block) => ({
          type: block.type,
          config: block.config,
        })),
    };

    try {
      const { success, error, flow } = await AgentFlows.saveFlow(
        name,
        flowConfig,
        currentFlowUuid
      );
      if (!success) throw new Error(error);

      setCurrentFlowUuid(flow.uuid);
      showToast("Agent 流程保存成功！", "success", { clear: true });
      await loadAvailableFlows();
    } catch (error) {
      console.error("Save error details:", error);
      showToast(`保存 Agent 流程失败。${error.message}`, "error", {
        clear: true,
      });
    }
  };

  const safeTemplateIdFromName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const openSaveAsSkillTemplate = async () => {
    if (!currentFlowUuid) {
      showToast("请先保存流程（生成 UUID）", "warning", { clear: true });
    }

    setShowSaveAsSkillModal(true);
    setLoadingSkills(true);
    try {
      const res = await SkillHub.discover({
        source: "local",
        page: 1,
        limit: 200,
      });
      if (!res?.success) throw new Error(res?.error || "加载 Skill 列表失败");
      const editable = (res.items || []).filter((s) =>
        String(s.skillId || s.id || "").startsWith("custom:")
      );
      setAvailableSkills(editable);
      if (!selectedSkillId && editable.length > 0) {
        setSelectedSkillId(String(editable[0].skillId || ""));
      }
      if (!templateId) {
        const slug = safeTemplateIdFromName(agentName) || "flow-template";
        setTemplateId(slug);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "加载 Skill 列表失败", "error", {
        clear: true,
      });
    } finally {
      setLoadingSkills(false);
    }
  };

  const saveAsSkillTemplate = async () => {
    if (!currentFlowUuid) {
      showToast("请先保存流程（生成 UUID）", "warning", { clear: true });
      return;
    }
    if (!selectedSkillId) {
      showToast("请选择一个 Skill", "warning", { clear: true });
      return;
    }

    setSavingAsSkill(true);
    try {
      const normalizedSlash = String(slashCommand || "").trim();
      const payload = {
        flowUuid: currentFlowUuid,
        templateId: String(templateId || "").trim() || undefined,
        slashCommand: normalizedSlash
          ? normalizedSlash.startsWith("/")
            ? normalizedSlash
            : `/${normalizedSlash}`
          : undefined,
      };
      const res = await SkillHub.importFlowTemplate(selectedSkillId, payload);
      if (!res?.success) throw new Error(res?.error || "保存失败");
      showToast("已保存为 Skill Flow Template", "success", { clear: true });
      setShowSaveAsSkillModal(false);
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存失败", "error", { clear: true });
    } finally {
      setSavingAsSkill(false);
    }
  };

  const toggleBlockExpansion = (blockId) => {
    setBlocks(
      blocks.map((block) =>
        block.id === blockId
          ? { ...block, isExpanded: !block.isExpanded }
          : block
      )
    );
  };

  // Get all available variables from the start block
  const getAvailableVariables = () => {
    const startBlock = blocks.find((b) => b.type === BLOCK_TYPES.START);
    return startBlock?.config?.variables?.filter((v) => v.name) || [];
  };

  const renderVariableSelect = (
    value,
    onChange,
    placeholder = "Select variable"
  ) => (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
    >
      <option value="" className="bg-theme-bg-primary">
        {placeholder}
      </option>
      {getAvailableVariables().map((v) => (
        <option key={v.name} value={v.name} className="bg-theme-bg-primary">
          {v.name}
        </option>
      ))}
    </select>
  );

  const deleteVariable = (variableName) => {
    // Clean up references in other blocks
    blocks.forEach((block) => {
      if (block.type === BLOCK_TYPES.START) return;

      let configUpdated = false;
      const newConfig = { ...block.config };

      // Check and clean responseVariable/resultVariable
      if (newConfig.responseVariable === variableName) {
        newConfig.responseVariable = "";
        configUpdated = true;
      }
      if (newConfig.resultVariable === variableName) {
        newConfig.resultVariable = "";
        configUpdated = true;
      }

      if (configUpdated) {
        updateBlockConfig(block.id, newConfig);
      }
    });
  };

  const clearFlow = () => {
    if (!!flowId) navigate(paths.agents.builder());
    setAgentName("");
    setAgentDescription("");
    setCurrentFlowUuid(null);
    setActive(true);
    setBlocks(DEFAULT_BLOCKS);
  };

  const moveBlock = (fromIndex, toIndex) => {
    const newBlocks = [...blocks];
    const [movedBlock] = newBlocks.splice(fromIndex, 1);
    newBlocks.splice(toIndex, 0, movedBlock);
    setBlocks(newBlocks);
  };

  const handlePublishFlow = () => {
    setShowPublishModal(true);
  };

  const flowInfoBlock = blocks.find(
    (block) => block.type === BLOCK_TYPES.FLOW_INFO
  );
  const flowEntity = {
    name: flowInfoBlock?.config?.name || "",
    description: flowInfoBlock?.config?.description || "",
    steps: blocks
      .filter(
        (block) =>
          block.type !== BLOCK_TYPES.FINISH &&
          block.type !== BLOCK_TYPES.FLOW_INFO
      )
      .map((block) => ({ type: block.type, config: block.config })),
  };

  return (
    <div
      style={{
        backgroundImage:
          theme === "light"
            ? "radial-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 0)"
            : "radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0)",
        backgroundSize: "15px 15px",
        backgroundPosition: "-7.5px -7.5px",
      }}
      className="w-full h-screen flex bg-page-texture"
    >
      <PublishEntityModal
        show={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        entityType="agent-flow"
        entity={flowEntity}
      />
      <ModalWrapper isOpen={showSaveAsSkillModal}>
        <div className="bg-theme-bg-primary rounded-lg shadow-lg border border-theme-border w-full max-w-2xl p-6 relative">
          <button
            onClick={() => setShowSaveAsSkillModal(false)}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-theme-action-menu-bg transition-colors duration-300"
          >
            <X className="w-5 h-5 text-theme-text-primary" />
          </button>

          <h2 className="text-lg font-semibold text-theme-text-primary mb-2">
            保存为 Skill Flow Template
          </h2>
          <p className="text-sm text-theme-text-secondary mb-6">
            将当前 Agent Flow 导出到某个 Skill 的 <code>flowTemplates</code>
            （仅支持 custom:* Skills）。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-text-primary mb-2">
                目标 Skill
              </label>
              {loadingSkills ? (
                <div className="text-sm text-theme-text-secondary">
                  加载中...
                </div>
              ) : availableSkills.length === 0 ? (
                <div className="text-sm text-theme-text-secondary">
                  未找到可写的 custom:* Skills（请先在 技能中心 创建/导入一个
                  Skill）
                </div>
              ) : (
                <select
                  value={selectedSkillId}
                  onChange={(e) => setSelectedSkillId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none"
                >
                  {availableSkills.map((s) => (
                    <option key={s.skillId} value={s.skillId}>
                      {s.name} ({s.skillId})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-theme-text-primary mb-2">
                  templateId
                </label>
                <input
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  placeholder="例如: my-flow"
                  className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-text-primary mb-2">
                  slashCommand（可选）
                </label>
                <input
                  value={slashCommand}
                  onChange={(e) => setSlashCommand(e.target.value)}
                  placeholder="例如: /my-flow"
                  className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveAsSkillModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-theme-border bg-theme-settings-input-bg text-theme-text-primary hover:bg-theme-action-menu-bg transition-all duration-300"
              >
                取消
              </button>
              <button
                disabled={
                  savingAsSkill || loadingSkills || availableSkills.length === 0
                }
                onClick={saveAsSkillTemplate}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-button hover:opacity-80 text-black light:text-theme-text-primary transition-all duration-300 disabled:opacity-50"
              >
                {savingAsSkill ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </ModalWrapper>
      <div className="relative z-[1] w-full flex flex-col">
        <HeaderMenu
          agentName={agentName}
          availableFlows={availableFlows}
          onNewFlow={clearFlow}
          onSaveFlow={saveFlow}
          onPublishFlow={handlePublishFlow}
          onSaveAsSkillTemplate={openSaveAsSkillTemplate}
        />
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-xl mx-auto mt-14">
            <BlockList
              blocks={blocks}
              updateBlockConfig={updateBlockConfig}
              removeBlock={removeBlock}
              toggleBlockExpansion={toggleBlockExpansion}
              renderVariableSelect={renderVariableSelect}
              onDeleteVariable={deleteVariable}
              moveBlock={moveBlock}
              refs={{ nameRef, descriptionRef }}
            />

            <AddBlockMenu
              blocks={blocks}
              showBlockMenu={showBlockMenu}
              setShowBlockMenu={setShowBlockMenu}
              addBlock={addBlock}
            />
          </div>
        </div>
      </div>
      <Tooltip
        id="content-summarization-tooltip"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      >
        <p className="text-sm">
          启用后，较长的网页内容将自动进行摘要以减少 token 使用量。
          <br />
          <br />
          注意：这可能会影响数据质量，并从原始内容中移除特定细节。
        </p>
      </Tooltip>
    </div>
  );
}
