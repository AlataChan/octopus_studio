import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Admin from "@/models/admin";
import SettingsPageLoadingShell from "@/components/SettingsPageLoadingShell";
import { Robot, Lightning, Warning, Gear } from "@phosphor-icons/react";
import showToast from "@/utils/toast";

export default function WorkAgentSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    const result = await Admin.getWorkAgentSettings();
    if (result.error) {
      showToast(result.error, "error");
    } else {
      setSettings(result.data?.settings || {});
    }
    setLoading(false);
  }

  async function handleChange(key, value) {
    setSaving(true);
    const result = await Admin.updateWorkAgentSettings({
      [key]: value,
    });

    if (result.success || result.ok || !result.error) {
      setSettings((prev) => ({
        ...prev,
        [key]: { ...prev[key], value: value },
      }));
      showToast("Settings updated successfully.", "success");
    } else {
      showToast(result.error || "Failed to update settings", "error");
    }
    setSaving(false);
  }

  if (loading) {
    return <SettingsPageLoadingShell />;
  }

  return (
    <div
      id="work-agent-settings-container"
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
            <Robot
              size={32}
              className="text-theme-text-primary"
              weight="bold"
            />
            <div>
              <h1 className="text-2xl font-semibold text-theme-text-primary">
                Work Agent Settings
              </h1>
              <p className="text-sm text-theme-text-secondary">
                Configure Work Agent provider and execution environment
                settings.
              </p>
            </div>
          </div>

          {/* Feature Toggles & Settings */}
          <div className="bg-theme-bg-secondary rounded-xl p-6">
            <h2 className="text-lg font-medium text-theme-text-primary mb-4 flex items-center gap-x-2">
              <Gear size={20} />
              Configuration
            </h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-y-2 p-4 bg-theme-bg-primary rounded-lg">
                <label className="text-theme-text-primary font-medium">
                  Work Agent Provider
                </label>
                <p className="text-sm text-theme-text-secondary">
                  Select the provider for the Work Agent.
                </p>
                {settings?.ALATA_WORK_AGENT_PROVIDER?.source && (
                  <div className="text-[10px] text-theme-text-secondary uppercase">
                    Source: {settings.ALATA_WORK_AGENT_PROVIDER.source}
                  </div>
                )}
                <select
                  value={settings?.ALATA_WORK_AGENT_PROVIDER?.value || ""}
                  onChange={(e) =>
                    handleChange("ALATA_WORK_AGENT_PROVIDER", e.target.value)
                  }
                  disabled={saving}
                  className="w-full max-w-md px-3 py-2 bg-theme-bg-secondary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)] disabled:opacity-50"
                >
                  <option value="">Default</option>
                  <option value="deterministic">Deterministic</option>
                  <option value="openai">OpenAI</option>
                  <option value="generic-openai">Generic OpenAI</option>
                </select>
              </div>

              <div className="flex flex-col gap-y-2 p-4 bg-theme-bg-primary rounded-lg">
                <label className="text-theme-text-primary font-medium">
                  Code Execution Root Path
                </label>
                <p className="text-sm text-theme-text-secondary">
                  Absolute path for the code execution sandbox root. Leave empty
                  to use per-workspace defaults.
                </p>
                {settings?.ALATA_CODE_EXECUTION_ROOT?.source && (
                  <div className="text-[10px] text-theme-text-secondary uppercase">
                    Source: {settings.ALATA_CODE_EXECUTION_ROOT.source}
                  </div>
                )}
                <input
                  type="text"
                  value={settings?.ALATA_CODE_EXECUTION_ROOT?.value || ""}
                  onChange={(e) =>
                    handleChange("ALATA_CODE_EXECUTION_ROOT", e.target.value)
                  }
                  disabled={saving}
                  placeholder="e.g. /app/data/sandboxes"
                  className="w-full max-w-md px-3 py-2 bg-theme-bg-secondary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)] disabled:opacity-50"
                />
              </div>

              <FeatureToggle
                title="Enable Gstack Assistants in Talent Market"
                description="Enable gstack employees in the talent market."
                enabled={settings?.SEED_GSTACK_ASSISTANTS?.value === "true"}
                onChange={(value) =>
                  handleChange(
                    "SEED_GSTACK_ASSISTANTS",
                    value ? "true" : "false"
                  )
                }
                disabled={saving}
                warning="Requires a restart to take effect."
                source={settings?.SEED_GSTACK_ASSISTANTS?.source}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureToggle({
  title,
  description,
  enabled,
  onChange,
  disabled,
  warning,
  source,
}) {
  return (
    <div className="flex items-start justify-between gap-x-4 p-4 bg-theme-bg-primary rounded-lg">
      <div className="flex items-start gap-x-3">
        <div>
          <p className="text-theme-text-primary font-medium">{title}</p>
          <p className="text-sm text-theme-text-secondary mt-1">
            {description}
          </p>
          {source && (
            <p className="text-[10px] text-theme-text-secondary uppercase mt-1">
              Source: {source}
            </p>
          )}
          {warning && (
            <p className="text-xs text-yellow-500 mt-2 flex items-center gap-x-1">
              <Warning size={12} />
              {warning}
            </p>
          )}
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer mt-1">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={enabled || false}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className="w-11 h-6 bg-theme-bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--theme-accent-primary)] peer-disabled:opacity-50"></div>
      </label>
    </div>
  );
}
