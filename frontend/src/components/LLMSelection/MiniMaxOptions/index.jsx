import { useState, useEffect } from "react";
import System from "@/models/system";

export default function MiniMaxOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.MiniMaxApiKey);
  const [miniMaxApiKey, setMiniMaxApiKey] = useState(settings?.MiniMaxApiKey);

  return (
    <div className="flex gap-[36px] mt-1.5">
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          API Key
        </label>
        <input
          type="password"
          name="MiniMaxApiKey"
          className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          placeholder="MiniMax API Key"
          defaultValue={settings?.MiniMaxApiKey ? "*".repeat(20) : ""}
          required={true}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => setMiniMaxApiKey(inputValue)}
        />
      </div>
      {!settings?.credentialsOnly && (
        <MiniMaxModelSelection settings={settings} apiKey={miniMaxApiKey} />
      )}
    </div>
  );
}

function MiniMaxModelSelection({ apiKey, settings }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findCustomModels() {
      if (!apiKey) {
        setModels([]);
        setLoading(true);
        return;
      }

      setLoading(true);
      const { models } = await System.customModels(
        "minimax",
        typeof apiKey === "boolean" ? null : apiKey
      );
      setModels(models || []);
      setLoading(false);
    }
    findCustomModels();
  }, [apiKey]);

  if (loading) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          Chat Model Selection
        </label>
        <select
          name="MiniMaxModelPref"
          disabled={true}
          defaultValue=""
          className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
        >
          <option value="" disabled={true}>
            -- loading available models --
          </option>
        </select>
      </div>
    );
  }

  const defaultModelPref =
    settings?.MiniMaxModelPref &&
    models.some((m) => m.id === settings.MiniMaxModelPref)
      ? settings.MiniMaxModelPref
      : models[0]?.id;

  return (
    <div className="flex flex-col w-60">
      <label className="text-theme-text-primary text-sm font-semibold block mb-3">
        Chat Model Selection
      </label>
      <select
        name="MiniMaxModelPref"
        required={true}
        defaultValue={defaultModelPref}
        className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
