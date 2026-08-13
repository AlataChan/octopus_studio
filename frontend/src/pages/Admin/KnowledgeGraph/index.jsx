import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Admin from "@/models/admin";
import SettingsPageLoadingShell from "@/components/SettingsPageLoadingShell";
import {
  Graph,
  Lightning,
  MagnifyingGlass,
  Path,
  TreeStructure,
  Warning,
  ArrowClockwise,
} from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";

export default function KnowledgeGraphSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    const result = await Admin.getKnowledgeGraphSettings();
    if (result.error) {
      showToast(result.error, "error");
    } else {
      setSettings(result.settings);
      setStatus(result.status);
    }
    setLoading(false);
  }

  async function handleToggle(key, value) {
    setSaving(true);
    const result = await Admin.updateKnowledgeGraphSettings({
      [key]: value,
    });

    if (result.success) {
      setSettings((prev) => ({ ...prev, [key]: value }));
      showToast(t("knowledge-graph.toast.updated"), "success");
    } else {
      showToast(
        result.error || t("knowledge-graph.toast.update-failed"),
        "error"
      );
    }
    setSaving(false);
  }

  async function handleResetCircuitBreaker() {
    const result = await Admin.resetKnowledgeGraphCircuitBreaker();
    if (result.success) {
      showToast(t("knowledge-graph.toast.circuit-breaker-reset"), "success");
      fetchSettings();
    } else {
      showToast(
        result.error || t("knowledge-graph.toast.reset-failed"),
        "error"
      );
    }
  }

  if (loading) {
    return <SettingsPageLoadingShell />;
  }

  return (
    <div
      id="knowledge-graph-settings-container"
      className="w-screen h-screen overflow-hidden bg-page-texture flex md:mt-0 mt-6"
    >
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] w-full h-full flex overflow-y-auto"
      >
        <div className="flex-1 flex flex-col gap-y-6 p-4 mt-10 max-w-4xl">
          {/* Header */}
          <div className="flex items-center gap-x-3">
            <Graph
              size={32}
              className="text-theme-text-primary"
              weight="bold"
            />
            <div>
              <h1 className="text-2xl font-semibold text-theme-text-primary">
                {t("knowledge-graph.title")}
              </h1>
              <p className="text-sm text-theme-text-secondary">
                {t("knowledge-graph.description")}
              </p>
            </div>
          </div>

          {/* Circuit Breaker Status */}
          {status?.circuitBreaker?.isOpen && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-x-3">
                <Warning size={24} className="text-red-400" weight="bold" />
                <div>
                  <p className="text-theme-text-primary font-medium">
                    {t("knowledge-graph.circuit-breaker.open")}
                  </p>
                  <p className="text-sm text-red-300">
                    {t("knowledge-graph.circuit-breaker.open-description", {
                      count: status.circuitBreaker.failures,
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={handleResetCircuitBreaker}
                className="flex items-center gap-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-theme-text-primary rounded-lg transition-colors"
              >
                <ArrowClockwise size={16} />
                {t("knowledge-graph.circuit-breaker.reset")}
              </button>
            </div>
          )}

          {/* Feature Toggles */}
          <div className="bg-theme-bg-secondary rounded-xl p-6">
            <h2 className="text-lg font-medium text-theme-text-primary mb-4 flex items-center gap-x-2">
              <Lightning size={20} />
              {t("knowledge-graph.features.title")}
            </h2>
            <p className="text-sm text-theme-text-secondary mb-6">
              {t("knowledge-graph.features.description")}
            </p>

            <div className="space-y-4">
              <FeatureToggle
                icon={<MagnifyingGlass size={20} />}
                title={t("knowledge-graph.features.guided-retrieval.title")}
                description={t(
                  "knowledge-graph.features.guided-retrieval.description"
                )}
                enabled={settings?.guidedRetrievalEnabled}
                onChange={(value) =>
                  handleToggle("guidedRetrievalEnabled", value)
                }
                disabled={saving}
              />

              <FeatureToggle
                icon={<TreeStructure size={20} />}
                title={t("knowledge-graph.features.entity-extraction.title")}
                description={t(
                  "knowledge-graph.features.entity-extraction.description"
                )}
                enabled={settings?.entityExtractionEnabled}
                onChange={(value) =>
                  handleToggle("entityExtractionEnabled", value)
                }
                disabled={saving}
                warning={t(
                  "knowledge-graph.features.entity-extraction.warning"
                )}
              />

              <FeatureToggle
                icon={<Graph size={20} />}
                title={t("knowledge-graph.features.similarity-edges.title")}
                description={t(
                  "knowledge-graph.features.similarity-edges.description"
                )}
                enabled={settings?.similarityEdgesEnabled}
                onChange={(value) =>
                  handleToggle("similarityEdgesEnabled", value)
                }
                disabled={saving}
              />

              <FeatureToggle
                icon={<Path size={20} />}
                title={t("knowledge-graph.features.path-finder.title")}
                description={t(
                  "knowledge-graph.features.path-finder.description"
                )}
                enabled={settings?.pathFinderEnabled}
                onChange={(value) => handleToggle("pathFinderEnabled", value)}
                disabled={saving}
              />
            </div>
          </div>

          {/* Performance Settings */}
          <div className="bg-theme-bg-secondary rounded-xl p-6">
            <h2 className="text-lg font-medium text-theme-text-primary mb-4">
              {t("knowledge-graph.performance.title")}
            </h2>
            <p className="text-sm text-theme-text-secondary mb-6">
              {t("knowledge-graph.performance.description")}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <NumberInput
                label={t("knowledge-graph.performance.search-timeout.label")}
                description={t(
                  "knowledge-graph.performance.search-timeout.description"
                )}
                value={settings?.searchTimeoutMs}
                onChange={(value) => handleToggle("searchTimeoutMs", value)}
                min={100}
                max={10000}
                step={100}
                disabled={saving}
              />

              <NumberInput
                label={t(
                  "knowledge-graph.performance.circuit-breaker-threshold.label"
                )}
                description={t(
                  "knowledge-graph.performance.circuit-breaker-threshold.description"
                )}
                value={settings?.circuitBreakerThreshold}
                onChange={(value) =>
                  handleToggle("circuitBreakerThreshold", value)
                }
                min={1}
                max={20}
                step={1}
                disabled={saving}
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <p className="text-sm text-blue-300">
              <strong>{t("knowledge-graph.tip.prefix")}</strong>{" "}
              {t("knowledge-graph.tip.content")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureToggle({
  icon,
  title,
  description,
  enabled,
  onChange,
  disabled,
  warning,
}) {
  return (
    <div className="flex items-start justify-between gap-x-4 p-4 bg-theme-bg-primary rounded-lg">
      <div className="flex items-start gap-x-3">
        <div className="text-theme-text-secondary mt-0.5">{icon}</div>
        <div>
          <p className="text-theme-text-primary font-medium">{title}</p>
          <p className="text-sm text-theme-text-secondary mt-1">
            {description}
          </p>
          {warning && (
            <p className="text-xs text-yellow-400 mt-2 flex items-center gap-x-1">
              <Warning size={12} />
              {warning}
            </p>
          )}
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={enabled || false}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className="w-11 h-6 bg-theme-bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 peer-disabled:opacity-50"></div>
      </label>
    </div>
  );
}

function NumberInput({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleBlur() {
    let newValue = parseInt(localValue, 10);
    if (isNaN(newValue)) newValue = min;
    if (newValue < min) newValue = min;
    if (newValue > max) newValue = max;
    setLocalValue(newValue);
    if (newValue !== value) {
      onChange(newValue);
    }
  }

  return (
    <div>
      <label className="text-theme-text-primary font-medium">{label}</label>
      <p className="text-sm text-theme-text-secondary mt-1 mb-3">
        {description}
      </p>
      <input
        type="number"
        value={localValue || ""}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-modal-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
    </div>
  );
}
