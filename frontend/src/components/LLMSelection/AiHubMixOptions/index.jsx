export default function AiHubMixOptions({ settings }) {
  return (
    <div className="flex flex-col gap-y-7">
      <div className="flex gap-[36px] mt-1.5 flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            Base URL
          </label>
          <input
            type="url"
            name="AiHubMixBasePath"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="https://aihubmix.com/v1"
            defaultValue={
              settings?.AiHubMixBasePath || "https://aihubmix.com/v1"
            }
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            API Key
          </label>
          <input
            type="password"
            name="AiHubMixApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="sk-***"
            defaultValue={settings?.AiHubMixApiKey ? "*".repeat(20) : ""}
            required={false}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-theme-text-secondary mt-1">
            Get a key from https://aihubmix.com/token
          </p>
        </div>
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            Chat Model Name
          </label>
          <input
            type="text"
            name="AiHubMixModelPref"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="e.g. gpt-4o-mini"
            defaultValue={settings?.AiHubMixModelPref}
            required={true}
            autoComplete="off"
          />
          <p className="text-xs text-theme-text-secondary mt-1">
            Model IDs: https://aihubmix.com/models
          </p>
        </div>
      </div>
      <div className="flex gap-[36px] flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            Token context window
          </label>
          <input
            type="number"
            name="AiHubMixTokenLimit"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="4096"
            min={1}
            onScroll={(e) => e.target.blur()}
            defaultValue={settings?.AiHubMixTokenLimit || 4096}
            required={true}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            Max Tokens
          </label>
          <input
            type="number"
            name="AiHubMixMaxTokens"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="1024"
            min={1}
            defaultValue={settings?.AiHubMixMaxTokens || 1024}
            required={true}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
