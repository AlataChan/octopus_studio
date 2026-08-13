import { API_BASE, AUTH_TIMESTAMP, fullApiUrl } from "@/utils/constants";
import {
  baseHeaders,
  clearLocalAuthSession,
  markLocalAuthSessionValidated,
  safeJsonParse,
} from "@/utils/request";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "@/utils/storage";
import DataConnector from "./dataConnector";
import LiveDocumentSync from "./experimental/liveSync";
import AgentPlugins from "./experimental/agentPlugins";
import SystemPromptVariable from "./systemPromptVariable";

const SETUP_SETTINGS_CACHE_TTL_MS = 300_000;
const SUPPORT_EMAIL_CACHE_TTL_MS = 3_600_000;
const SUPPORT_EMAIL_EMPTY_CACHE_TTL_MS = 86_400_000;
const SETUP_SETTINGS_CHANGED_EVENT = "alata:setup-settings-changed";
let cachedSetupSettings = null;
let cachedSetupSettingsAt = 0;
let setupSettingsRequest = null;

function emitSetupSettingsChanged(reason) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  )
    return;
  window.dispatchEvent(
    new CustomEvent(SETUP_SETTINGS_CHANGED_EVENT, { detail: { reason } })
  );
}

const System = {
  setupSettingsChangedEvent: SETUP_SETTINGS_CHANGED_EVENT,
  notifySetupSettingsChanged: emitSetupSettingsChanged,
  cacheKeys: {
    footerIcons: "alata_footer_links",
    supportEmail: "alata_support_email",
    customAppName: "alata_custom_app_name",
    canViewChatHistory: "alata_can_view_chat_history",
    deploymentVersion: "alata_deployment_version",
  },
  invalidateSetupSettingsCache: function () {
    cachedSetupSettings = null;
    cachedSetupSettingsAt = 0;
    setupSettingsRequest = null;
  },
  peekKeys: function () {
    return cachedSetupSettings;
  },
  hasFreshSetupSettings: function () {
    return (
      !!cachedSetupSettings &&
      Date.now() - cachedSetupSettingsAt < SETUP_SETTINGS_CACHE_TTL_MS
    );
  },
  ping: async function () {
    return await fetch(`${API_BASE}/ping`)
      .then((res) => res.json())
      .then((res) => res?.online || false)
      .catch(() => false);
  },
  totalIndexes: async function (slug = null) {
    const url = new URL(`${fullApiUrl()}/system/system-vectors`);
    if (!!slug) url.searchParams.append("slug", encodeURIComponent(slug));
    return await fetch(url.toString(), {
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not find indexes.");
        return res.json();
      })
      .then((res) => res.vectorCount)
      .catch(() => 0);
  },
  keys: async function ({ bypassCache = false } = {}) {
    if (
      !bypassCache &&
      cachedSetupSettings &&
      Date.now() - cachedSetupSettingsAt < SETUP_SETTINGS_CACHE_TTL_MS
    ) {
      return cachedSetupSettings;
    }

    if (!bypassCache && setupSettingsRequest) {
      return setupSettingsRequest;
    }

    setupSettingsRequest = fetch(`${API_BASE}/setup-complete`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not find setup information.");
        return res.json();
      })
      .then((res) => {
        cachedSetupSettings = res.results;
        cachedSetupSettingsAt = Date.now();
        return res.results;
      })
      .catch(() => null)
      .finally(() => {
        setupSettingsRequest = null;
      });

    return await setupSettingsRequest;
  },
  localFiles: async function () {
    return await fetch(`${API_BASE}/system/local-files`, {
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not find setup information.");
        return res.json();
      })
      .then((res) => res.localFiles)
      .catch(() => null);
  },
  needsAuthCheck: function () {
    const lastAuthCheck = getLocalStorageItem(AUTH_TIMESTAMP);
    if (!lastAuthCheck) return true;
    const expiresAtMs = Number(lastAuthCheck) + 60 * 5 * 1000; // expires in 5 minutes in ms
    return Number(new Date()) > expiresAtMs;
  },

  checkAuth: async function (currentToken = null) {
    const valid = await fetch(`${API_BASE}/system/check-token`, {
      headers: baseHeaders(currentToken),
    })
      .then((res) => res.ok)
      .catch(() => false);

    if (valid) markLocalAuthSessionValidated();
    else clearLocalAuthSession();
    return valid;
  },
  requestToken: async function (body) {
    return await fetch(`${API_BASE}/request-token`, {
      method: "POST",
      body: JSON.stringify({ ...body }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not validate login.");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        return { valid: false, message: e.message };
      });
  },
  recoverAccount: async function (username, recoveryCodes) {
    return await fetch(`${API_BASE}/system/recover-account`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ username, recoveryCodes }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Error recovering account.");
        }
        return data;
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  resetPassword: async function (token, newPassword, confirmPassword) {
    return await fetch(`${API_BASE}/system/reset-password`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ token, newPassword, confirmPassword }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Error resetting password.");
        }
        return data;
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  checkDocumentProcessorOnline: async () => {
    try {
      const response = await fetch(
        `${API_BASE}/system/document-processing-status`,
        {
          headers: baseHeaders(),
        }
      );
      return response.ok;
    } catch (error) {
      // 静默失败，不在控制台显示错误
      // 文档处理服务可能未启动，这不影响其他功能
      return false;
    }
  },
  acceptedDocumentTypes: async () => {
    return await fetch(`${API_BASE}/system/accepted-document-types`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.types)
      .catch(() => null);
  },
  updateSystem: async (data) => {
    System.invalidateSetupSettingsCache();
    return await fetch(`${API_BASE}/system/update-env`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => {
        System.notifySetupSettingsChanged("system-update");
        return res;
      })
      .catch((e) => {
        console.error(e);
        return { newValues: null, error: e.message };
      });
  },
  llmProviderOverrides: async function () {
    try {
      const response = await fetch(
        `${API_BASE}/system/llm-provider-overrides`,
        {
          headers: baseHeaders(),
        }
      );
      if (!response.ok) throw new Error("Could not fetch LLM overrides.");
      const data = await response.json();
      return {
        overrides: Array.isArray(data?.overrides) ? data.overrides : [],
      };
    } catch (e) {
      console.error(e);
      return { overrides: [] };
    }
  },
  testEmbeddingConnection: async (data) => {
    return await fetch(`${API_BASE}/system/test-embedding-connection`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => ({
        success: res.success || false,
        message: res.message || res.error || null,
      }))
      .catch((e) => {
        console.error(e);
        return { success: false, message: e.message };
      });
  },
  updateSystemPassword: async (data) => {
    System.invalidateSetupSettingsCache();
    return await fetch(`${API_BASE}/system/update-password`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => {
        System.notifySetupSettingsChanged("system-password-update");
        return res;
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  setupMultiUser: async (data) => {
    System.invalidateSetupSettingsCache();
    return await fetch(`${API_BASE}/system/enable-multi-user`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => {
        System.notifySetupSettingsChanged("multi-user-enabled");
        return res;
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  isMultiUserMode: async () => {
    if (cachedSetupSettings?.hasOwnProperty("MultiUserMode")) {
      return !!cachedSetupSettings.MultiUserMode;
    }

    return await fetch(`${API_BASE}/system/multi-user-mode`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.multiUserMode)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  deleteDocument: async (name) => {
    return await fetch(`${API_BASE}/system/remove-document`, {
      method: "DELETE",
      headers: baseHeaders(),
      body: JSON.stringify({ name }),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  deleteDocuments: async (names = []) => {
    return await fetch(`${API_BASE}/system/remove-documents`, {
      method: "DELETE",
      headers: baseHeaders(),
      body: JSON.stringify({ names }),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  deleteFolder: async (name) => {
    return await fetch(`${API_BASE}/system/remove-folder`, {
      method: "DELETE",
      headers: baseHeaders(),
      body: JSON.stringify({ name }),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  uploadPfp: async function (formData) {
    return await fetch(`${API_BASE}/system/upload-pfp`, {
      method: "POST",
      body: formData,
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error uploading pfp.");
        return { success: true, error: null };
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },
  uploadLogo: async function (formData) {
    return await fetch(`${API_BASE}/system/upload-logo`, {
      method: "POST",
      body: formData,
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error uploading logo.");
        return { success: true, error: null };
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },
  fetchCustomFooterIcons: async function () {
    const cache = getLocalStorageItem(this.cacheKeys.footerIcons);
    const { data, lastFetched } = cache
      ? safeJsonParse(cache, { data: [], lastFetched: 0 })
      : { data: [], lastFetched: 0 };

    if (!!data && Date.now() - lastFetched < 3_600_000)
      return { footerData: data, error: null };

    const { footerData, error } = await fetch(
      `${API_BASE}/system/footer-data`,
      {
        method: "GET",
        cache: "no-cache",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.log(e);
        return { footerData: [], error: e.message };
      });

    if (!footerData || !!error) return { footerData: [], error: null };

    const newData = safeJsonParse(footerData, []);
    setLocalStorageItem(
      this.cacheKeys.footerIcons,
      JSON.stringify({ data: newData, lastFetched: Date.now() })
    );
    return { footerData: newData, error: null };
  },
  fetchSupportEmail: async function () {
    const cache = getLocalStorageItem(this.cacheKeys.supportEmail);
    const { email, lastFetched } = cache
      ? safeJsonParse(cache, { email: "", lastFetched: 0 })
      : { email: "", lastFetched: 0 };
    const cacheTtl = email
      ? SUPPORT_EMAIL_CACHE_TTL_MS
      : SUPPORT_EMAIL_EMPTY_CACHE_TTL_MS;

    if (lastFetched > 0 && Date.now() - lastFetched < cacheTtl)
      return { email: email, error: null };

    const { supportEmail, error } = await fetch(
      `${API_BASE}/system/support-email`,
      {
        method: "GET",
        cache: "no-cache",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.log(e);
        return { email: "", error: e.message };
      });

    if (!!error) return { email: "", error: null };
    const emailToCache = supportEmail || "";
    setLocalStorageItem(
      this.cacheKeys.supportEmail,
      JSON.stringify({ email: emailToCache, lastFetched: Date.now() })
    );
    return { email: emailToCache, error: null };
  },

  fetchCustomAppName: async function () {
    const cache = getLocalStorageItem(this.cacheKeys.customAppName);
    const { appName, lastFetched } = cache
      ? safeJsonParse(cache, { appName: "", lastFetched: 0 })
      : { appName: "", lastFetched: 0 };

    if (!!appName && Date.now() - lastFetched < 3_600_000)
      return { appName: appName, error: null };

    const { customAppName, error } = await fetch(
      `${API_BASE}/system/custom-app-name`,
      {
        method: "GET",
        cache: "no-cache",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.log(e);
        return { customAppName: "", error: e.message };
      });

    if (!customAppName || !!error) {
      removeLocalStorageItem(this.cacheKeys.customAppName);
      return { appName: "", error: null };
    }

    setLocalStorageItem(
      this.cacheKeys.customAppName,
      JSON.stringify({ appName: customAppName, lastFetched: Date.now() })
    );
    return { appName: customAppName, error: null };
  },
  fetchLogo: async function () {
    const url = new URL(`${fullApiUrl()}/system/logo`);
    url.searchParams.append(
      "theme",
      localStorage.getItem("theme") || "default"
    );

    return await fetch(url, {
      method: "GET",
      cache: "no-cache",
    })
      .then(async (res) => {
        if (res.ok && res.status !== 204) {
          const isCustomLogo = res.headers.get("X-Is-Custom-Logo") === "true";
          const blob = await res.blob();
          const logoURL = URL.createObjectURL(blob);
          return { isCustomLogo, logoURL };
        }
        throw new Error("Failed to fetch logo!");
      })
      .catch((e) => {
        console.log(e);
        return { isCustomLogo: false, logoURL: null };
      });
  },
  fetchPfp: async function (id) {
    return await fetch(`${API_BASE}/system/pfp/${id}`, {
      method: "GET",
      cache: "no-cache",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok && res.status !== 204) return res.blob();
        throw new Error("Failed to fetch pfp.");
      })
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch((e) => {
        // console.log(e);
        return null;
      });
  },
  removePfp: async function (id) {
    return await fetch(`${API_BASE}/system/remove-pfp`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok) return { success: true, error: null };
        throw new Error("Failed to remove pfp.");
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },

  isDefaultLogo: async function () {
    return await fetch(`${API_BASE}/system/is-default-logo`, {
      method: "GET",
      cache: "no-cache",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to get is default logo!");
        return res.json();
      })
      .then((res) => res?.isDefaultLogo)
      .catch((e) => {
        console.log(e);
        return null;
      });
  },
  removeCustomLogo: async function () {
    return await fetch(`${API_BASE}/system/remove-logo`, {
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok) return { success: true, error: null };
        throw new Error("Error removing logo!");
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },

  // White-label app icon (square master -> favicon/apple-touch/desktop source)
  appIconUrl: function (sizeKey = "favicon", version = "") {
    const url = new URL(`${fullApiUrl()}/system/app-icon/${sizeKey}.png`);
    if (version) url.searchParams.append("v", version);
    return url.toString();
  },
  uploadAppIcon: async function (formData) {
    return await fetch(`${API_BASE}/system/upload-app-icon`, {
      method: "POST",
      body: formData,
      headers: baseHeaders(),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data?.message || "Error uploading app icon.");
        return { success: true, error: null, baseId: data?.baseId || null };
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message, baseId: null };
      });
  },
  fetchAppIcon: async function () {
    const url = new URL(`${fullApiUrl()}/system/app-icon/icon-512.png`);
    return await fetch(url, { method: "GET", cache: "no-cache" })
      .then(async (res) => {
        if (res.ok && res.status !== 204) {
          const blob = await res.blob();
          return { iconURL: URL.createObjectURL(blob) };
        }
        return { iconURL: null };
      })
      .catch((e) => {
        console.log(e);
        return { iconURL: null };
      });
  },
  isDefaultAppIcon: async function () {
    return await fetch(`${API_BASE}/system/is-default-app-icon`, {
      method: "GET",
      cache: "no-cache",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to get is default app icon!");
        return res.json();
      })
      .then((res) => res?.isDefault)
      .catch((e) => {
        console.log(e);
        return true;
      });
  },
  removeAppIcon: async function () {
    return await fetch(`${API_BASE}/system/remove-app-icon`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok) return { success: true, error: null };
        throw new Error("Error removing app icon!");
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },
  getWelcomeMessages: async function () {
    return await fetch(`${API_BASE}/system/welcome-messages`, {
      method: "GET",
      cache: "no-cache",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not fetch welcome messages.");
        return res.json();
      })
      .then((res) => res.welcomeMessages)
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  setWelcomeMessages: async function (messages) {
    return fetch(`${API_BASE}/system/set-welcome-messages`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ messages }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error setting welcome messages.");
        }
        return { success: true, ...res.json() };
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  getApiKeys: async function () {
    return fetch(`${API_BASE}/system/api-keys`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error fetching api key.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKey: null, error: e.message };
      });
  },
  /**
   * 生成新的 API Key
   * @param {Object} options - 可选配置
   * @param {string} options.name - API Key 名称
   * @param {string} options.expiresAt - 过期时间 ISO 字符串
   * @param {number} options.rateLimit - 速率限制（请求/分钟）
   * @returns {Promise<{apiKey: Object|null, error: string|null}>}
   */
  generateApiKey: async function (options = {}) {
    return fetch(`${API_BASE}/system/generate-api-key`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(options),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error generating api key.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKey: null, error: e.message };
      });
  },
  deleteApiKey: async function (apiKeyId = "") {
    return fetch(`${API_BASE}/system/api-key/${apiKeyId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  customModels: async function (
    provider,
    apiKey = null,
    basePath = null,
    timeout = null
  ) {
    const controller = new AbortController();
    if (!!timeout) {
      setTimeout(() => {
        controller.abort("Request timed out.");
      }, timeout);
    }

    return fetch(`${API_BASE}/system/custom-models`, {
      method: "POST",
      headers: baseHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        provider,
        apiKey,
        basePath,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error finding custom models.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { models: [], error: e.message };
      });
  },
  chats: async (offset = 0) => {
    return await fetch(`${API_BASE}/system/workspace-chats`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ offset }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  eventLogs: async (offset = 0) => {
    return await fetch(`${API_BASE}/system/event-logs`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ offset }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  clearEventLogs: async () => {
    return await fetch(`${API_BASE}/system/event-logs`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  deleteChat: async (chatId) => {
    return await fetch(`${API_BASE}/system/workspace-chats/${chatId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  exportChats: async (type = "csv", chatType = "workspace") => {
    const url = new URL(`${fullApiUrl()}/system/export-chats`);
    url.searchParams.append("type", encodeURIComponent(type));
    url.searchParams.append("chatType", encodeURIComponent(chatType));
    return await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok) return res.text();
        throw new Error(res.statusText);
      })
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  updateUser: async (data) => {
    return await fetch(`${API_BASE}/system/user`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  dataConnectors: DataConnector,

  getSlashCommandPresets: async function () {
    return await fetch(`${API_BASE}/system/slash-command-presets`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not fetch slash command presets.");
        return res.json();
      })
      .then((res) => res.presets)
      .catch((e) => {
        console.error(e);
        return [];
      });
  },

  createSlashCommandPreset: async function (presetData) {
    return await fetch(`${API_BASE}/system/slash-command-presets`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(presetData),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.message || "Error creating slash command preset."
          );
        return data;
      })
      .then((res) => ({ preset: res.preset, error: null }))
      .catch((e) => {
        console.error(e);
        return { preset: null, error: e.message };
      });
  },

  updateSlashCommandPreset: async function (presetId, presetData) {
    return await fetch(`${API_BASE}/system/slash-command-presets/${presetId}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(presetData),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.message || "Could not update slash command preset."
          );
        return data;
      })
      .then((res) => ({ preset: res.preset, error: null }))
      .catch((e) => {
        console.error(e);
        return { preset: null, error: e.message };
      });
  },

  deleteSlashCommandPreset: async function (presetId) {
    return await fetch(`${API_BASE}/system/slash-command-presets/${presetId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not delete slash command preset.");
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  },

  /**
   * Fetches the can view chat history state from local storage or the system settings.
   * Notice: This is an instance setting that cannot be changed via the UI and it is cached
   * in local storage for 24 hours.
   * @returns {Promise<{viewable: boolean, error: string | null}>}
   */
  fetchCanViewChatHistory: async function () {
    const cache = getLocalStorageItem(this.cacheKeys.canViewChatHistory);
    const { viewable, lastFetched } = cache
      ? safeJsonParse(cache, { viewable: false, lastFetched: 0 })
      : { viewable: false, lastFetched: 0 };

    // Since this is an instance setting that cannot be changed via the UI,
    // we can cache it in local storage for a day and if the admin changes it,
    // they should instruct the users to clear local storage.
    if (typeof viewable === "boolean" && Date.now() - lastFetched < 8.64e7)
      return { viewable, error: null };

    const res = await System.keys();
    const isViewable = res?.DisableViewChatHistory === false;

    setLocalStorageItem(
      this.cacheKeys.canViewChatHistory,
      JSON.stringify({ viewable: isViewable, lastFetched: Date.now() })
    );
    return { viewable: isViewable, error: null };
  },

  /**
   * Validates a temporary auth token and logs in the user if the token is valid.
   * @param {string} publicToken - the token to validate against
   * @returns {Promise<{valid: boolean, user: import("@prisma/client").users | null, token: string | null, message: string | null}>}
   */
  simpleSSOLogin: async function (publicToken) {
    return fetch(`${API_BASE}/request-token/sso/simple?token=${publicToken}`, {
      method: "GET",
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          if (!text.startsWith("{")) throw new Error(text);
          return JSON.parse(text);
        }
        return await res.json();
      })
      .catch((e) => {
        console.error(e);
        return { valid: false, user: null, token: null, message: e.message };
      });
  },

  /**
   * Fetches the app version from the server.
   * @returns {Promise<string | null>} The app version.
   */
  fetchAppVersion: async function () {
    const cache = getLocalStorageItem(this.cacheKeys.deploymentVersion);
    const { version, lastFetched } = cache
      ? safeJsonParse(cache, { version: null, lastFetched: 0 })
      : { version: null, lastFetched: 0 };

    if (!!version && Date.now() - lastFetched < 3_600_000) return version;
    const newVersion = await fetch(`${API_BASE}/utils/metrics`, {
      method: "GET",
      cache: "no-cache",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not fetch app version.");
        return res.json();
      })
      .then((res) => res?.appVersion)
      .catch(() => null);

    if (!newVersion) return null;
    setLocalStorageItem(
      this.cacheKeys.deploymentVersion,
      JSON.stringify({ version: newVersion, lastFetched: Date.now() })
    );
    return newVersion;
  },

  /**
   * Validates a SQL connection string.
   * @param {'postgresql'|'mysql'|'sql-server'} engine - the database engine identifier
   * @param {string} connectionString - the connection string to validate
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  validateSQLConnection: async function (engine, connectionString) {
    return fetch(`${API_BASE}/system/validate-sql-connection`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ engine, connectionString }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Failed to validate SQL connection:", e);
        return { success: false, error: e.message };
      });
  },

  experimentalFeatures: {
    liveSync: LiveDocumentSync,
    agentPlugins: AgentPlugins,
  },
  promptVariables: SystemPromptVariable,
};

export default System;
