import { useEffect, useState } from "react";
import Admin from "@/models/admin";
import useSystemSettings from "@/hooks/useSystemSettings";
import showToast from "@/utils/toast";

const VIDEO_SETTING_FIELDS = [
  "video_understanding_enabled",
  "video_understanding_provider",
  "video_understanding_base_url",
  "video_understanding_model",
  "video_understanding_api_key",
];

const MASKED_SECRET = "*".repeat(20);

export function buildVideoUnderstandingPayload(settings) {
  return {
    video_understanding_enabled: settings.enabled ? "true" : "false",
    video_understanding_provider: settings.provider || "moonshot",
    video_understanding_base_url: settings.baseUrl || "",
    video_understanding_model: settings.model || "kimi-k2.6",
    video_understanding_api_key: settings.apiKey || "",
  };
}

export function videoSummaryPreview(summary) {
  const lines = [];
  if (summary?.transcript) lines.push(`Transcript: ${summary.transcript}`);
  const observations = Array.isArray(summary?.keyObservations)
    ? summary.keyObservations.slice(0, 2)
    : [];
  observations.forEach((observation) => lines.push(`- ${observation}`));
  return lines.join("\n") || "Connection succeeded.";
}

function normalizeSettings(raw = {}, setupSettings = {}) {
  const hasVideoKey = Boolean(raw.video_understanding_api_key);
  const hasMoonshotKey = Boolean(setupSettings?.MoonshotAiApiKey);

  return {
    enabled: raw.video_understanding_enabled === "true",
    provider: raw.video_understanding_provider || "moonshot",
    baseUrl:
      raw.video_understanding_base_url ||
      setupSettings?.MoonshotAiBaseUrl ||
      "https://api.moonshot.ai/v1",
    model: raw.video_understanding_model || "kimi-k2.6",
    apiKey:
      hasVideoKey || hasMoonshotKey
        ? raw.video_understanding_api_key || MASKED_SECRET
        : "",
  };
}

export default function VideoUnderstandingSettings({
  initialSettings = null,
  setupSettingsOverride = null,
}) {
  const { settings: systemSettings } = useSystemSettings();
  const setupSettings = setupSettingsOverride || systemSettings || {};
  const [settings, setSettings] = useState(() =>
    normalizeSettings(initialSettings || {}, setupSettings)
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (initialSettings) return;

    let cancelled = false;
    Admin.systemPreferencesByFields(VIDEO_SETTING_FIELDS).then((result) => {
      if (cancelled) return;
      setSettings(normalizeSettings(result?.settings || {}, setupSettings));
    });

    return () => {
      cancelled = true;
    };
  }, [
    initialSettings,
    setupSettings?.MoonshotAiApiKey,
    setupSettings?.MoonshotAiBaseUrl,
  ]);

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setTestResult(null);
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    const result = await Admin.updateSystemPreferences(
      buildVideoUnderstandingPayload(settings)
    );
    setSaving(false);

    if (result?.success === false || result?.error) {
      showToast(result.error || "Failed to save video settings.", "error", {
        clear: true,
      });
      return;
    }

    setHasChanges(false);
    showToast("Video Understanding settings saved.", "success", {
      clear: true,
    });
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const result = await Admin.testVideoUnderstandingConnection({
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.apiKey,
    });
    setTesting(false);
    setTestResult(result);
  }

  return (
    <form
      className="flex flex-col gap-y-3 my-4 border-t border-white border-opacity-20 light:border-black/20 pt-6 max-w-[720px]"
      onSubmit={saveSettings}
    >
      <div className="flex items-start justify-between gap-x-6">
        <div>
          <p className="text-sm leading-6 font-semibold text-theme-text-primary">
            Video Understanding
          </p>
          <p className="text-xs text-white/60">
            When enabled, videos are uploaded to the configured video provider
            before chat so they can be summarized as text.
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center mt-1">
          <input
            id="video_understanding_enabled"
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => updateSetting("enabled", event.target.checked)}
            className="peer sr-only"
          />
          <div className="pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"></div>
        </label>
      </div>

      {settings.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-y-1">
              <span className="text-xs font-semibold text-theme-text-primary">
                Provider
              </span>
              <select
                value={settings.provider}
                onChange={(event) =>
                  updateSetting("provider", event.target.value)
                }
                className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
              >
                <option value="moonshot">Moonshot</option>
              </select>
            </label>

            <label className="flex flex-col gap-y-1">
              <span className="text-xs font-semibold text-theme-text-primary">
                Model
              </span>
              <input
                type="text"
                value={settings.model}
                onChange={(event) => updateSetting("model", event.target.value)}
                className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder="kimi-k2.6"
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-y-1 md:col-span-2">
              <span className="text-xs font-semibold text-theme-text-primary">
                Base URL
              </span>
              <input
                type="url"
                value={settings.baseUrl}
                onChange={(event) =>
                  updateSetting("baseUrl", event.target.value)
                }
                className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder="https://api.moonshot.ai/v1"
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-y-1 md:col-span-2">
              <span className="text-xs font-semibold text-theme-text-primary">
                API Key
              </span>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(event) =>
                  updateSetting("apiKey", event.target.value)
                }
                className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder="Moonshot API key"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing}
              className="transition-all w-fit duration-300 border border-slate-200 px-4 py-2 rounded-lg text-theme-text-primary text-sm items-center flex gap-x-2 hover:bg-slate-200 hover:text-slate-800 focus:ring-gray-800 disabled:opacity-60"
            >
              {testing ? "Testing..." : "Test connection"}
            </button>
            {hasChanges && (
              <button
                type="submit"
                disabled={saving}
                className="transition-all w-fit duration-300 border border-slate-200 px-4 py-2 rounded-lg text-theme-text-primary text-sm items-center flex gap-x-2 hover:bg-slate-200 hover:text-slate-800 focus:ring-gray-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            )}
          </div>

          {testResult && (
            <pre
              className={`whitespace-pre-wrap rounded-lg p-3 text-xs ${
                testResult.ok
                  ? "bg-green-500/10 text-green-300"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              {testResult.ok
                ? videoSummaryPreview(testResult.summary)
                : testResult.error || "Connection test failed."}
            </pre>
          )}
        </>
      )}
    </form>
  );
}
