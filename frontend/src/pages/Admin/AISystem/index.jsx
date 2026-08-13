import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import AISystem from "@/models/aiSystem";
import showToast from "@/utils/toast";
import SystemOverview from "./SystemOverview";
import LLMStrategySettings from "./LLMStrategySettings";
import ToolStatsPanel from "./ToolStatsPanel";
import CacheStatsPanel from "./CacheStatsPanel";
import MemoryStatsPanel from "./MemoryStatsPanel";
import { useTranslation } from "react-i18next";

/**
 * Admin AI System 页面
 * 用于监控和配置 AI 系统（Provider、缓存、工具统计等）
 */
export default function AdminAISystem() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchStatus();
  }, [refreshKey]);

  const fetchStatus = async () => {
    setLoading(true);
    const result = await AISystem.getStatus();
    if (result.success) {
      setStatus(result.data);
    } else {
      showToast(`${t("ai-system.fetch-error")}: ${result.error}`, "error");
    }
    setLoading(false);
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleSettingsUpdate = async (settings) => {
    const result = await AISystem.updateSettings(settings);
    if (result.success) {
      showToast(t("ai-system.settings-updated"), "success");
      handleRefresh();
    } else {
      showToast(`${t("ai-system.update-failed")}: ${result.error}`, "error");
    }
    return result.success;
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          {/* Header */}
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                {t("ai-system.title")}
              </p>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="px-3 py-1 text-xs rounded-lg bg-theme-bg-primary text-theme-text-secondary hover:bg-theme-bg-tertiary transition-colors disabled:opacity-50"
              >
                {loading ? t("ai-system.loading") : t("ai-system.refresh")}
              </button>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              {t("ai-system.description")}
            </p>
          </div>

          {loading && !status ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-theme-text-secondary">
                {t("ai-system.loading")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 mt-6">
              {/* System Overview */}
              <SystemOverview status={status} />

              {/* LLM Strategy Settings */}
              <LLMStrategySettings
                status={status}
                onUpdate={handleSettingsUpdate}
              />

              {/* Cache Stats */}
              <CacheStatsPanel status={status} onRefresh={handleRefresh} />

              {/* Tool Stats */}
              <ToolStatsPanel status={status} />

              {/* Memory Stats */}
              <MemoryStatsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
