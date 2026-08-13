import { useRef, useState } from "react";
import { ChartBar, SpinnerGap } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import { PROMPT_INPUT_EVENT } from "../index";

/** 支持的分析文件类型 */
const ACCEPTED_FILE_TYPES = ".csv,.xlsx,.xls";

/** 具备数据分析能力的助手（包含 duckdb-agent 工具） */
const DATA_CAPABLE_ASSISTANTS = [
  "数据分析师",
  "数据挖掘分析师",
  "市场调研助手",
  // 以下为 ID 匹配
  "preset-data-analyst",
  "employee-vera-data-analyst",
  "employee-suqing-market-research",
];

/**
 * 分析数据按钮 - 点击上传 Excel/CSV 文件进行数据分析
 * @param {Object} props
 * @param {string} props.workspaceSlug - 当前 workspace 的 slug
 * @param {Object} props.selectedAssistant - 当前选中的助手信息（可选）
 */
export default function AnalysisDataButton({
  workspaceSlug,
  selectedAssistant = null,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  if (!workspaceSlug) return null;

  /**
   * 检查当前助手是否具有数据分析能力
   */
  const hasDataCapability = () => {
    if (!selectedAssistant) return true; // 没有选中助手时，默认允许

    // 检查助手名称或模板 ID 是否在数据型助手列表中
    const assistantName =
      selectedAssistant.instanceName || selectedAssistant.template?.name;
    const templateId = selectedAssistant.template?.id;

    if (DATA_CAPABLE_ASSISTANTS.includes(assistantName)) return true;
    if (DATA_CAPABLE_ASSISTANTS.includes(templateId)) return true;

    // 检查工具列表中是否包含 duckdb-agent
    const tools = selectedAssistant.template?.defaultTools || [];
    if (tools.includes("duckdb-agent")) return true;

    return false;
  };

  /**
   * 点击按钮，触发文件选择器
   */
  const handleClick = () => {
    if (uploading) return;

    // 检查当前助手是否具有数据分析能力
    if (!hasDataCapability()) {
      const assistantName =
        selectedAssistant?.instanceName ||
        selectedAssistant?.template?.name ||
        "当前助手";
      showToast(
        `${assistantName} 不具备数据分析能力，建议切换到「数据分析师」或「市场调研助手」`,
        "warning",
        { autoClose: 5000 }
      );
      // 仍然允许上传，但给出警告
    }

    fileInputRef.current?.click();
  };

  /**
   * 处理文件选择
   */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input，允许重复选择同一文件
    e.target.value = "";

    // 验证文件类型
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      showToast("仅支持 CSV、Excel 文件", "error");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await Workspace.uploadAnalysisFile(
        workspaceSlug,
        formData
      );

      if (result.success) {
        showToast(`文件 "${file.name}" 上传成功`, "success");
        // 预填输入框，包含文件路径信息，引导 Agent 使用 DuckDB 工具
        // 文件路径格式：workspace-{id}/{timestamp}-{filename}
        const fileKey = result.data?.key || "";
        // 从 fileKey 中提取 workspace_id (格式: workspace-{id}/...)
        const workspaceIdMatch = fileKey.match(/^workspace-(\d+)\//);
        const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : "1";

        // 构建更明确的提示，指导 LLM 使用 DuckDB 工具链
        const promptMessage = [
          `我刚上传了数据文件 "${file.name}"（存储路径: ${fileKey}）。`,
          ``,
          `请使用以下步骤分析这个文件：`,
          `1. 使用 duckdb-list-files 工具（workspace_id: ${workspaceId}）确认文件已上传`,
          `2. 使用 duckdb-get-file-schema 工具获取文件的列结构`,
          `3. 使用 duckdb-query 工具执行 SQL 查询分析数据`,
          ``,
          `请开始分析：`,
        ].join("\n");

        window.dispatchEvent(
          new CustomEvent(PROMPT_INPUT_EVENT, {
            detail: {
              messageContent: promptMessage,
              writeMode: "replace",
            },
          })
        );
      } else {
        showToast(result.error || "上传失败", "error");
      }
    } catch (error) {
      console.error("[AnalysisDataButton] Upload error:", error);
      showToast("上传失败，请重试", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        id="analysis-data-btn"
        type="button"
        disabled={uploading}
        aria-disabled={uploading}
        data-tooltip-id="tooltip-analysis-data-btn"
        data-tooltip-content={uploading ? "上传中..." : "上传数据文件进行分析"}
        aria-label="分析数据"
        onClick={handleClick}
        className={`flex justify-center items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200 ${uploading ? "opacity-50" : ""}`}
      >
        {uploading ? (
          <SpinnerGap
            color="var(--theme-sidebar-footer-icon-fill)"
            className="w-[22px] h-[22px] pointer-events-none animate-spin"
          />
        ) : (
          <ChartBar
            color="var(--theme-sidebar-footer-icon-fill)"
            className="w-[22px] h-[22px] pointer-events-none text-theme-text-primary opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60"
          />
        )}
      </button>
      <Tooltip
        id="tooltip-analysis-data-btn"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </>
  );
}
