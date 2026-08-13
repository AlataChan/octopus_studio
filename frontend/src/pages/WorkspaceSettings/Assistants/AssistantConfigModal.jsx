import { useState, useEffect } from "react";
import { X, Shield, Wrench, Robot } from "@phosphor-icons/react";
import Button from "@/components/Button";
import WorkspaceAssistant, {
  PERMISSION_MODES,
} from "@/models/workspaceAssistant";

/**
 * 助手配置弹窗组件
 * 用于配置助手的权限模式、工具白名单等
 */
export default function AssistantConfigModal({
  assistant,
  workspaceSlug,
  onClose,
  onUpdate,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 解析现有配置
  const existingConfig = assistant.customConfig
    ? typeof assistant.customConfig === "string"
      ? JSON.parse(assistant.customConfig)
      : assistant.customConfig
    : {};

  // 配置状态
  const [permissionMode, setPermissionMode] = useState(
    existingConfig.permissionMode ||
      assistant.template?.defaultPermissionMode ||
      "default"
  );
  const [allowedToolsText, setAllowedToolsText] = useState(
    (existingConfig.allowedTools || []).join("\n")
  );
  const [autoApprovedToolsText, setAutoApprovedToolsText] = useState(
    (existingConfig.autoApprovedTools || []).join("\n")
  );
  const [overrideModel, setOverrideModel] = useState(
    existingConfig.overrideModel || ""
  );

  /**
   * 保存配置
   */
  const handleSave = async () => {
    setLoading(true);
    setError(null);

    const customConfig = {
      permissionMode,
      allowedTools: allowedToolsText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
      autoApprovedTools: autoApprovedToolsText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
      overrideModel: overrideModel.trim() || undefined,
    };

    const result = await WorkspaceAssistant.updateConfig(
      workspaceSlug,
      assistant.id,
      customConfig
    );

    if (result.success) {
      onUpdate();
      onClose();
    } else {
      setError(result.error || "保存配置失败");
    }

    setLoading(false);
  };

  // 获取助手显示名称
  const displayName =
    assistant.instanceName ||
    assistant.template?.employeeName ||
    assistant.template?.name ||
    "未命名助手";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
          <div className="flex items-center gap-x-3">
            <Robot
              size={24}
              className="text-theme-accent-primary"
              weight="fill"
            />
            <div>
              <h2 className="text-theme-text-primary text-lg font-semibold">
                配置助手
              </h2>
              <p className="text-white/60 text-sm">{displayName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-theme-text-primary hover:bg-white/10 rounded-lg transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-6">
          {/* 权限模式 */}
          <div>
            <label className="flex items-center gap-x-2 text-theme-text-primary font-medium mb-3">
              <Shield size={18} className="text-sky-400" />
              权限模式
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PERMISSION_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setPermissionMode(mode.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    permissionMode === mode.value
                      ? "border-theme-accent-primary bg-theme-accent-primary/10"
                      : "border-theme-border hover:border-theme-border-medium bg-theme-bg-primary"
                  }`}
                >
                  <div className="text-theme-text-primary text-sm font-medium">
                    {mode.label}
                  </div>
                  <div className="text-white/50 text-xs mt-1">
                    {mode.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 工具白名单 */}
          <div>
            <label className="flex items-center gap-x-2 text-theme-text-primary font-medium mb-2">
              <Wrench size={18} className="text-green-400" />
              允许的工具（每行一个，支持通配符 *）
            </label>
            <textarea
              value={allowedToolsText}
              onChange={(e) => setAllowedToolsText(e.target.value)}
              placeholder="留空表示允许所有工具&#10;示例：&#10;rag-search&#10;web-*&#10;read-file"
              className="w-full h-24 px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary text-sm placeholder-white/30 focus:outline-none focus:border-theme-accent-primary resize-none"
            />
          </div>

          {/* 自动批准工具 */}
          <div>
            <label className="flex items-center gap-x-2 text-theme-text-primary font-medium mb-2">
              <Shield size={18} className="text-yellow-400" />
              自动批准的工具（无需确认，每行一个）
            </label>
            <textarea
              value={autoApprovedToolsText}
              onChange={(e) => setAutoApprovedToolsText(e.target.value)}
              placeholder="这些工具将跳过确认步骤&#10;示例：&#10;write-file&#10;save-*"
              className="w-full h-24 px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary text-sm placeholder-white/30 focus:outline-none focus:border-theme-accent-primary resize-none"
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-theme-border flex items-center justify-between">
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <div className="flex items-center gap-x-3 ml-auto">
            <Button onClick={onClose} variant="muted">
              取消
            </Button>
            <Button onClick={handleSave} disabled={loading} loading={loading}>
              {loading ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
