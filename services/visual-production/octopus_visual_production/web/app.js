"use strict";

const DONE_STATUSES = new Set(["succeeded", "success", "completed", "SUCCEEDED", "SUCCESS", "COMPLETED"]);
const FAILED_STATUSES = new Set(["failed", "cancelled", "canceled", "FAILED", "CANCELLED", "CANCELED"]);
const KEY_FIELDS = [
  ["key-ark", "ARK_API_KEY", "X-Ark-Key"],
  ["key-dashscope", "DASHSCOPE_API_KEY", "X-Dashscope-Key"],
  ["key-agnes", "AGNES_API_KEY", "X-Agnes-Key"],
];
const LOCAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const I18N = {
  zh: {
    brand_title: "Octopus 视觉生产台",
    eyebrow: "局域网视觉生产控制台",
    keys_heading: "API 密钥",
    keys_sub: "浏览器密钥会在每次请求时覆盖服务器默认密钥。",
    save_keys: "保存到本浏览器",
    clear_keys: "清除已保存密钥",
    tab_generate: "生成",
    tab_jobs: "我的任务",
    tab_stitch: "拼接",
    gen_heading: "生成",
    gen_sub: "创建图片或视频任务并查看完成进度。",
    free_badge: "Agnes 免费通道",
    prompt: "提示词",
    prompt_ph: "描述你想要的画面内容。",
    task: "任务",
    provider: "服务商",
    model: "模型",
    ratio: "比例",
    duration: "时长（秒）",
    advanced: "高级选项",
    size: "尺寸",
    seed: "随机种子",
    frame_rate: "帧率",
    negative_prompt: "反向提示词",
    ref_image: "参考图片 URL",
    local_upload: "本地图片（仅 Agnes 图生图）",
    local_upload_ok: "可上传本地图片用于 Agnes 图生图",
    local_upload_na: "本地图片仅支持 Agnes 图生图：请选择图片任务并使用 Agnes（「服务商」选 Agnes，或选「自动」且已配置 Agnes Key），或在「模型」选 agnes.image_flash；视频与其他模型请填公开图片 URL。",
    local_upload_too_large: "本地图片超过 8MB，已跳过。",
    ref_video: "参考视频 URL",
    ref_audio: "参考音频 URL",
    url_per_line: "每行一个 URL",
    generate_audio: "生成音频",
    watermark: "水印",
    submit_job: "提交任务",
    generating: "生成中…",
    cost_estimate: "预计花费",
    cost_free: "免费",
    cost_unknown: "价格未配置",
    cost_need_key: "需配置 Key",
    cost_note: "估算，仅供参考，实际以平台账单为准",
    session_spent: "本次会话",
    session_cap: "预算上限",
    session_reset: "重置",
    cost_confirm: "这次约",
    refresh_config: "刷新配置",
    current_job: "当前任务",
    no_job: "尚未选择任务。",
    jobs_heading: "我的任务",
    jobs_sub: "查看历史任务并打开任意任务详情。",
    refresh_jobs: "刷新任务",
    stitch_heading: "拼接",
    stitch_hint: "选择已完成的 mp4 片段，设置顺序，合成一个视频。",
    stitch_hint_noffmpeg: "服务器未安装 ffmpeg，拼接功能已禁用。",
    refresh_clips: "刷新片段",
    out_name: "输出文件名",
    stitch_run: "拼接所选",
    status_saved_keys: "已保存浏览器密钥",
    status_cleared_keys: "已清除浏览器密钥",
    status_config_loaded: "配置已加载",
    status_config_failed: "配置加载失败",
    opt_auto: "自动",
    group_video: "视频任务",
    group_image: "图片任务",
    group_other: "其他任务",
    badge_server_available: "可用",
    badge_server_none: "未配置",
    badge_server_prefix: "服务器",
    badge_server_configured: "服务器已配置",
    badge_browser_saved: "浏览器已保存",
    badge_not_configured: "未配置",
    submitting: "正在提交任务…",
    row_task: "任务",
    row_provider: "服务商",
    row_model: "模型",
    row_status: "状态",
    row_task_id: "任务 ID",
    no_result: "暂无已下载结果。",
    download: "下载",
    th_job: "任务编号",
    th_task: "任务",
    th_model: "模型",
    th_status: "状态",
    th_result: "结果",
    no_jobs: "暂无任务。",
    loading_jobs: "正在加载任务…",
    loading_clips: "正在加载片段…",
    install_ffmpeg: "请在服务器安装 ffmpeg 以启用拼接。",
    no_clips: "未找到已完成的 mp4 片段。",
    select_one_clip: "请至少选择一个 mp4 片段。",
    stitching: "正在拼接片段…",
    download_stitched: "下载合成视频",
    title_card: "中文标题",
    title_card_title: "标题",
    title_card_subtitle: "副标题（可选）",
    title_card_duration: "时长（秒）",
    title_card_bg: "背景",
    title_card_bg_blur: "模糊首帧",
    title_card_bg_solid: "纯色",
    title_card_run: "生成带标题视频",
    title_card_add: "添加中文标题",
    title_card_no_font: "服务器缺少中文字体或 Pillow，无法生成标题（设置 FONT_PATH 或 pip install Pillow）。",
    title_card_wait_stitch: "请先完成一次拼接，再为最新拼接视频添加中文标题。",
    title_card_processing: "正在生成中文标题视频…",
    poll_subtitle: "轮询中：",
    selected_subtitle: "已选择：",
    elapsed: "已用时",
    error_http: "请求失败，HTTP",
    not_applicable: "不适用",
  },
  en: {
    brand_title: "Octopus Visual Production",
    eyebrow: "LAN visual production console",
    keys_heading: "API keys",
    keys_sub: "Browser keys override server defaults for each request.",
    save_keys: "Save in this browser",
    clear_keys: "Clear saved keys",
    tab_generate: "Generate",
    tab_jobs: "My Jobs",
    tab_stitch: "Stitch",
    gen_heading: "Generate",
    gen_sub: "Create an image or video job and watch it complete.",
    free_badge: "Agnes free route",
    prompt: "Prompt",
    prompt_ph: "Describe the visual output you want.",
    task: "Task",
    provider: "Provider",
    model: "Model",
    ratio: "Ratio",
    duration: "Duration seconds",
    advanced: "Advanced options",
    size: "Size",
    seed: "Seed",
    frame_rate: "Frame rate",
    negative_prompt: "Negative prompt",
    ref_image: "Reference image URLs",
    local_upload: "Local image (Agnes img2img only)",
    local_upload_ok: "Local upload enabled for Agnes img2img",
    local_upload_na: "Local upload only works for Agnes img2img: pick an image task with Agnes (provider=Agnes, or Auto with an Agnes key set), or model=agnes.image_flash; video/other models need a public image URL.",
    local_upload_too_large: "Local image is larger than 8MB and was skipped.",
    ref_video: "Reference video URLs",
    ref_audio: "Reference audio URLs",
    url_per_line: "One URL per line",
    generate_audio: "Generate audio",
    watermark: "Watermark",
    submit_job: "Submit job",
    generating: "Generating…",
    cost_estimate: "Estimated cost",
    cost_free: "Free",
    cost_unknown: "Price not set",
    cost_need_key: "Key required",
    cost_note: "Estimate only; actual cost per provider billing",
    session_spent: "This session",
    session_cap: "Budget cap",
    session_reset: "Reset",
    cost_confirm: "This job ≈",
    refresh_config: "Refresh config",
    current_job: "Current job",
    no_job: "No job selected.",
    jobs_heading: "My Jobs",
    jobs_sub: "Review previous runs and open any job detail.",
    refresh_jobs: "Refresh jobs",
    stitch_heading: "Stitch",
    stitch_hint: "Select completed mp4 clips, set order, and create one video.",
    stitch_hint_noffmpeg: "ffmpeg is not installed on the server, so stitching is disabled.",
    refresh_clips: "Refresh clips",
    out_name: "Output file name",
    stitch_run: "Stitch selected",
    status_saved_keys: "Saved browser keys",
    status_cleared_keys: "Cleared browser keys",
    status_config_loaded: "Config loaded",
    status_config_failed: "Config failed",
    opt_auto: "auto",
    group_video: "Video tasks",
    group_image: "Image tasks",
    group_other: "Other tasks",
    badge_server_available: "available",
    badge_server_none: "none",
    badge_server_prefix: "server",
    badge_server_configured: "server key set",
    badge_browser_saved: "saved in browser",
    badge_not_configured: "not set",
    submitting: "Submitting job...",
    row_task: "Task",
    row_provider: "Provider",
    row_model: "Model",
    row_status: "Status",
    row_task_id: "Task ID",
    no_result: "No downloaded result yet.",
    download: "Download",
    th_job: "Job",
    th_task: "Task",
    th_model: "Model",
    th_status: "Status",
    th_result: "Result",
    no_jobs: "No jobs yet.",
    loading_jobs: "Loading jobs...",
    loading_clips: "Loading clips...",
    install_ffmpeg: "Install ffmpeg on the server to enable stitching.",
    no_clips: "No completed mp4 clips found.",
    select_one_clip: "Select at least one mp4 clip.",
    stitching: "Stitching clips...",
    download_stitched: "Download stitched video",
    title_card: "Chinese title",
    title_card_title: "Title",
    title_card_subtitle: "Subtitle (optional)",
    title_card_duration: "Duration (s)",
    title_card_bg: "Background",
    title_card_bg_blur: "Blurred frame",
    title_card_bg_solid: "Solid",
    title_card_run: "Make titled video",
    title_card_add: "Add Chinese title",
    title_card_no_font: "Server missing CJK font or Pillow; set FONT_PATH or pip install Pillow.",
    title_card_wait_stitch: "Create a stitched video first, then add a Chinese title to the latest stitch output.",
    title_card_processing: "Making titled video...",
    poll_subtitle: "Polling",
    selected_subtitle: "Selected",
    elapsed: "Elapsed",
    error_http: "Request failed with HTTP",
    not_applicable: "not applicable",
  },
};

const TASK_LABELS = {
  zh: {
    "image.poster.draft": "图片·海报·草稿",
    "image.poster.final": "图片·海报·成品",
    "image.edit": "图片·编辑（图生图）",
    "video.text.draft": "视频·文生·草稿",
    "video.image.draft": "视频·图生·草稿",
    "video.final": "视频·成品",
    "video.multimodal": "视频·多模态",
    "video.edit": "视频·编辑",
  },
  en: {
    "image.poster.draft": "Image · poster · draft",
    "image.poster.final": "Image · poster · final",
    "image.edit": "Image · edit (img2img)",
    "video.text.draft": "Video · text→video · draft",
    "video.image.draft": "Video · image→video · draft",
    "video.final": "Video · final",
    "video.multimodal": "Video · multimodal",
    "video.edit": "Video · edit",
  },
};

const PROVIDER_LABELS = {
  zh: {
    volcengine_ark: "火山方舟",
    aliyun_dashscope: "阿里云百炼",
    agnes: "Agnes AI（免费）",
  },
  en: {
    volcengine_ark: "Volcengine Ark",
    aliyun_dashscope: "Alibaba DashScope",
    agnes: "Agnes AI (free)",
  },
};

let LANG = localStorage.getItem("octopus.lang") || "zh";

const state = {
  config: null,
  jobs: [],
  pollTimer: null,
  elapsedTimer: null,
  activeJobId: null,
  activeJob: null,
  activeJobStartedAt: null,
  submitting: false,
  currentStatusKey: null,
  currentStatusTone: "neutral",
  localImages: [],
  lastStitchOutput: null,
  estimateTimer: null,
  latestEstimate: null,
  estimateNeedsKey: false,
  sessionSpent: 0,
};

function byId(id) {
  return document.getElementById(id);
}

function t(key) {
  const dictionary = I18N[LANG] || {};
  if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
    return dictionary[key];
  }
  return I18N.en[key] ?? key;
}

function taskLabel(key) {
  const dictionary = TASK_LABELS[LANG] || {};
  if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
    return dictionary[key];
  }
  return TASK_LABELS.en[key] ?? key;
}

function providerLabel(id) {
  const dictionary = PROVIDER_LABELS[LANG] || {};
  if (Object.prototype.hasOwnProperty.call(dictionary, id)) {
    return dictionary[id];
  }
  return PROVIDER_LABELS.en[id] ?? id;
}

function modelLabel(modelId, model) {
  return model && model.quality ? `${modelId} · ${model.quality}` : modelId;
}

function composeJobSubtitle(key, jobId) {
  return LANG === "zh" ? `${t(key)}${jobId}` : `${t(key)} ${jobId}`;
}

function applyI18n() {
  document.documentElement.lang = LANG === "zh" ? "zh-Hans" : "en";
  document.title = t("brand_title");
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  const toggle = byId("lang-toggle");
  if (toggle) {
    toggle.textContent = LANG === "zh" ? "EN" : "中文";
  }
  if (state.config) {
    populateTasks(state.config);
    populateProviders(state.config);
    populateModels(state.config);
    renderKeyBadges(state.config);
    configureStitchAvailability(state.config);
    updateFreeBadge();
    updateTaskAwareFields();
    updateLocalUploadAvailability();
    renderSessionBar();
    renderCostEstimate();
  }
  if (state.currentStatusKey) {
    setStatus(t(state.currentStatusKey), state.currentStatusTone);
  }
  if (state.submitting) {
    setSubmitInFlight(true);
  }
  if (state.activeJob) {
    renderJobDetail(state.activeJob);
  } else if (!state.activeJobId) {
    byId("current-job-subtitle").textContent = t("no_job");
  }
  if (byId("panel-jobs").classList.contains("is-active")) {
    renderJobsTable(state.jobs);
  }
  if (byId("panel-stitch").classList.contains("is-active")) {
    renderStitchList(completedMp4Jobs(state.jobs));
  }
}

function createNode(tag, attrs, children) {
  const node = document.createElement(tag);
  const values = attrs || {};
  Object.keys(values).forEach((key) => {
    const value = values[key];
    if (value === null || value === undefined || value === false) {
      return;
    }
    if (key === "text") {
      node.textContent = String(value);
    } else if (key === "className") {
      node.className = String(value);
    } else if (key === "dataset") {
      Object.keys(value).forEach((name) => {
        node.dataset[name] = String(value[name]);
      });
    } else if (key === "checked") {
      node.checked = Boolean(value);
    } else if (key === "disabled") {
      node.disabled = Boolean(value);
    } else {
      node.setAttribute(key, String(value));
    }
  });
  (children || []).forEach((child) => {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function setStatus(message, tone, key) {
  if (key) {
    state.currentStatusKey = key;
    state.currentStatusTone = tone || "neutral";
  }
  const target = byId("system-status");
  target.replaceChildren(createNode("span", { className: `status-pill ${tone || "neutral"}`, text: message }, []));
}

function showError(target, error) {
  const message = error && error.message ? error.message : String(error);
  target.replaceChildren(createNode("div", { className: "notice error", text: message }, []));
}

function isTerminalStatus(status) {
  return DONE_STATUSES.has(status) || FAILED_STATUSES.has(status);
}

function setSubmitInFlight(inFlight) {
  state.submitting = inFlight;
  const button = byId("submit-job");
  button.disabled = inFlight;
  button.textContent = inFlight ? t("generating") : t("submit_job");
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateElapsedDisplay() {
  const target = document.querySelector("[data-elapsed='current']");
  if (!target || !state.activeJobStartedAt) {
    return;
  }
  const progress = target.dataset.progress;
  const suffix = progress ? ` · ${progress}%` : "";
  target.textContent = `${t("elapsed")} ${formatElapsed(Date.now() - state.activeJobStartedAt)}${suffix}`;
}

function startElapsedClock() {
  if (state.elapsedTimer) {
    window.clearInterval(state.elapsedTimer);
  }
  updateElapsedDisplay();
  state.elapsedTimer = window.setInterval(updateElapsedDisplay, 1000);
}

function stopElapsedClock() {
  if (state.elapsedTimer) {
    window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
  }
}

function toggleLanguage() {
  LANG = LANG === "zh" ? "en" : "zh";
  localStorage.setItem("octopus.lang", LANG);
  applyI18n();
  updateElapsedDisplay();
}

function keyHeaders() {
  const headers = {};
  KEY_FIELDS.forEach(([inputId, , header]) => {
    const value = byId(inputId).value;
    if (value) {
      headers[header] = value;
    }
  });
  return headers;
}

async function requestJson(url, options) {
  const opts = options || {};
  const headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
  const response = await fetch(url, Object.assign({}, opts, { headers }));
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    const error = new Error(payload.error || `${t("error_http")} ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function postJson(url, body) {
  return requestJson(url, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, keyHeaders()),
    body: JSON.stringify(body),
  });
}

function linesToList(value) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function configBudget() {
  return (state.config && state.config.budget) || {};
}

function budgetNumber(key, fallback) {
  const value = Number(configBudget()[key]);
  return Number.isFinite(value) ? value : fallback;
}

function currentSessionCap() {
  const input = byId("session-cap");
  const value = input ? Number(input.value) : NaN;
  return Number.isFinite(value) ? value : budgetNumber("session_cap_cny", 10);
}

function initializeSessionCap(config) {
  const input = byId("session-cap");
  if (!input) {
    return;
  }
  const saved = localStorage.getItem("octopus.cap");
  const fallback = config && config.budget ? config.budget.session_cap_cny : 10;
  if (!input.value) {
    input.value = saved || String(fallback || 10);
  }
}

function renderSessionBar() {
  const value = byId("session-spent-value");
  if (!value) {
    return;
  }
  const cap = currentSessionCap();
  value.textContent = `¥${state.sessionSpent.toFixed(2)} / ¥${cap.toFixed(2)}`;
}

function estimateAmount(estimate) {
  if (!estimate || estimate.cny === null || estimate.cny === undefined) {
    return null;
  }
  const value = Number(estimate.cny);
  return Number.isFinite(value) ? value : null;
}

function renderCostEstimate() {
  const target = byId("cost-estimate-value");
  if (!target) {
    return;
  }
  const cny = estimateAmount(state.latestEstimate);
  if (state.estimateNeedsKey) {
    target.textContent = t("cost_need_key");
  } else if (cny === null) {
    target.textContent = t("cost_unknown");
  } else if (cny === 0) {
    target.textContent = t("cost_free");
  } else {
    target.textContent = `≈ ¥${cny.toFixed(2)}`;
  }
}

function buildEstimateBody() {
  const provider = byId("provider-select").value;
  const modelSelect = byId("model-select");
  const modelId = modelSelect ? modelSelect.value : "";
  const body = {
    task: byId("task-select").value,
    image_urls: linesToList(byId("image-urls").value).concat(
      agnesImg2imgSelected() ? state.localImages.map((image) => image.dataUri) : []
    ),
    video_urls: linesToList(byId("video-urls").value),
    audio_urls: linesToList(byId("audio-urls").value),
  };
  if (modelId) {
    body.model_id = modelId;
  } else if (provider) {
    body.provider = provider;
  }
  const durationInput = byId("duration");
  if (durationInput && !durationInput.disabled && durationInput.value) {
    body.duration = Number(durationInput.value);
  }
  const nInput = byId("n");
  if (nInput && nInput.value) {
    body.n = Number(nInput.value);
  }
  return body;
}

async function refreshEstimate() {
  if (!state.config || !byId("task-select").value) {
    return null;
  }
  try {
    const estimate = await postJson("/api/estimate", buildEstimateBody());
    state.latestEstimate = estimate;
    state.estimateNeedsKey = false;
    renderCostEstimate();
    return estimate;
  } catch (error) {
    state.latestEstimate = { cny: null };
    state.estimateNeedsKey = error && error.status === 400;
    renderCostEstimate();
    return null;
  }
}

function scheduleEstimate() {
  if (state.estimateTimer) {
    window.clearTimeout(state.estimateTimer);
  }
  state.estimateTimer = window.setTimeout(() => {
    state.estimateTimer = null;
    refreshEstimate();
  }, 300);
}

async function freshEstimateForSubmit(body) {
  try {
    const estimate = await postJson("/api/estimate", body);
    state.latestEstimate = estimate;
    state.estimateNeedsKey = false;
    renderCostEstimate();
    return estimate;
  } catch (error) {
    state.latestEstimate = { cny: null };
    state.estimateNeedsKey = error && error.status === 400;
    renderCostEstimate();
    return null;
  }
}

function costForGuard(estimate) {
  const value = estimateAmount(estimate);
  return value === null ? 0 : value;
}

function confirmBudgetIfNeeded(cost) {
  const threshold = budgetNumber("confirm_threshold_cny", 1);
  const cap = currentSessionCap();
  if (cost <= threshold && state.sessionSpent + cost <= cap) {
    return true;
  }
  const message = `${t("cost_confirm")} ¥${cost.toFixed(2)}，${t("session_spent")} ¥${state.sessionSpent.toFixed(2)} / ¥${cap.toFixed(2)}`;
  return window.confirm(message);
}

function storedKeyName(envKey) {
  return `octopus.${envKey}`;
}

function loadStoredKeys() {
  KEY_FIELDS.forEach(([inputId, envKey]) => {
    byId(inputId).value = localStorage.getItem(storedKeyName(envKey)) || "";
  });
}

function saveKeys() {
  KEY_FIELDS.forEach(([inputId, envKey]) => {
    const value = byId(inputId).value;
    if (value) {
      localStorage.setItem(storedKeyName(envKey), value);
    } else {
      localStorage.removeItem(storedKeyName(envKey));
    }
  });
  setStatus(t("status_saved_keys"), "ok", "status_saved_keys");
  if (state.config) {
    renderKeyBadges(state.config);
    scheduleEstimate();
  }
}

function clearKeys() {
  KEY_FIELDS.forEach(([inputId, envKey]) => {
    byId(inputId).value = "";
    localStorage.removeItem(storedKeyName(envKey));
  });
  setStatus(t("status_cleared_keys"), "neutral", "status_cleared_keys");
  if (state.config) {
    renderKeyBadges(state.config);
    scheduleEstimate();
  }
}

function browserKeyValue(provider) {
  const field = KEY_FIELDS.find(([, envKey]) => envKey === provider.env_key);
  if (!field) {
    return "";
  }
  const input = byId(field[0]);
  return input ? input.value.trim() : "";
}

function renderKeyBadges(config) {
  const badges = byId("key-badges");
  badges.replaceChildren();
  (config.providers || []).forEach((provider) => {
    let stateText = t("badge_not_configured");
    let configured = false;
    if (provider.has_key) {
      stateText = t("badge_server_configured");
      configured = true;
    } else if (browserKeyValue(provider)) {
      stateText = t("badge_browser_saved");
      configured = true;
    }
    const separator = LANG === "zh" ? "：" : ": ";
    const text = `${providerLabel(provider.id)}${separator}${stateText}`;
    badges.append(createNode("span", { className: `badge ${configured ? "ok" : "muted"}`, text }, []));
  });
}

function populateTasks(config) {
  const select = byId("task-select");
  const previous = select.value;
  const groups = { video: [], image: [], other: [] };
  (config.tasks || []).forEach((task) => {
    const head = task.split(".")[0];
    if (head === "video") {
      groups.video.push(task);
    } else if (head === "image") {
      groups.image.push(task);
    } else {
      groups.other.push(task);
    }
  });
  const children = [];
  [["video", "group_video"], ["image", "group_image"], ["other", "group_other"]].forEach(([key, labelKey]) => {
    if (!groups[key].length) {
      return;
    }
    const group = createNode("optgroup", { label: t(labelKey) }, []);
    groups[key].forEach((task) => {
      group.append(createNode("option", { value: task, text: taskLabel(task), title: task }, []));
    });
    children.push(group);
  });
  select.replaceChildren(...children);
  if (previous && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function populateProviders(config) {
  const select = byId("provider-select");
  const previous = select.value;
  const options = [createNode("option", { value: "", text: t("opt_auto") }, [])];
  (config.providers || []).forEach((provider) => {
    options.push(createNode("option", { value: provider.id, text: providerLabel(provider.id) }, []));
  });
  select.replaceChildren(...options);
  if (Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function populateModels(config) {
  const select = byId("model-select");
  if (!select) {
    return;
  }
  const previous = select.value;
  const selectedProvider = byId("provider-select").value;
  const models = config.models || [];
  const options = [createNode("option", { value: "", text: t("opt_auto") }, [])];
  if (selectedProvider) {
    models
      .filter((model) => model.provider === selectedProvider)
      .forEach((model) => {
        options.push(createNode("option", { value: model.id, text: modelLabel(model.id, model), title: model.id }, []));
      });
  } else {
    (config.providers || []).forEach((provider) => {
      const providerModels = models.filter((model) => model.provider === provider.id);
      if (!providerModels.length) {
        return;
      }
      const group = createNode("optgroup", { label: providerLabel(provider.id) }, []);
      providerModels.forEach((model) => {
        group.append(createNode("option", { value: model.id, text: modelLabel(model.id, model), title: model.id }, []));
      });
      options.push(group);
    });
  }
  select.replaceChildren(...options);
  if (previous && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function selectedModel() {
  const modelId = byId("model-select") ? byId("model-select").value : "";
  if (!modelId || !state.config) {
    return null;
  }
  return (state.config.models || []).find((model) => model.id === modelId) || null;
}

function agnesKeyAvailable() {
  const browserKey = byId("key-agnes") ? byId("key-agnes").value.trim() : "";
  if (browserKey) {
    return true;
  }
  const provider = state.config
    ? (state.config.providers || []).find((item) => item.id === "agnes")
    : null;
  return Boolean(provider && provider.has_key);
}

function agnesImg2imgSelected() {
  const model = selectedModel();
  if (model) {
    return model.adapter === "agnes_image";
  }
  const provider = byId("provider-select") ? byId("provider-select").value : "";
  const task = byId("task-select") ? byId("task-select").value : "";
  if (!task.startsWith("image.")) {
    return false;
  }
  if (provider === "agnes") {
    return true;
  }
  if (provider === "") {
    return agnesKeyAvailable();
  }
  return false;
}

function renderLocalImages() {
  const target = byId("local-image-list");
  if (!target) {
    return;
  }
  const chips = state.localImages.map((image, index) => {
    const remove = createNode("button", {
      type: "button",
      className: "chip-remove",
      text: "✕",
      title: image.name,
      "aria-label": image.name,
    }, []);
    remove.addEventListener("click", () => {
      state.localImages.splice(index, 1);
      renderLocalImages();
      scheduleEstimate();
    });
    return createNode("span", { className: "local-image-chip" }, [
      createNode("span", { text: image.name }, []),
      remove,
    ]);
  });
  target.replaceChildren(...chips);
}

function clearLocalImages() {
  state.localImages = [];
  renderLocalImages();
  scheduleEstimate();
}

function updateLocalUploadAvailability() {
  const input = byId("image-file");
  const hint = byId("local-image-hint");
  if (!input) {
    return;
  }
  const enabled = agnesImg2imgSelected();
  input.disabled = !enabled;
  input.closest("label")?.classList.toggle("not-applicable", !enabled);
  if (hint) {
    hint.textContent = enabled ? t("local_upload_ok") : t("local_upload_na");
  }
  if (!enabled) {
    input.value = "";
    if (state.localImages.length) {
      clearLocalImages();
    }
  }
}

function handleLocalImageChange(event) {
  const input = event.target;
  if (!agnesImg2imgSelected()) {
    input.value = "";
    return;
  }
  Array.from(input.files || []).forEach((file) => {
    if (file.size > LOCAL_IMAGE_MAX_BYTES) {
      showError(byId("job-detail"), new Error(t("local_upload_too_large")));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        state.localImages.push({ name: file.name || t("local_upload"), dataUri: reader.result });
        renderLocalImages();
        scheduleEstimate();
      }
    });
    reader.addEventListener("error", () => {
      showError(byId("job-detail"), new Error(file.name || t("local_upload")));
    });
    reader.readAsDataURL(file);
  });
  input.value = "";
}

function updateFreeBadge() {
  const provider = byId("provider-select").value;
  const task = byId("task-select").value;
  const show = provider === "agnes" || (provider === "" && /^(image|video)\./.test(task));
  byId("route-badge").classList.toggle("is-hidden", !show);
}

function updateTaskAwareFields() {
  const task = byId("task-select").value;
  const isImageTask = task.startsWith("image.");
  ["duration", "frame-rate", "generate-audio"].forEach((id) => {
    const input = byId(id);
    const label = input.closest("label");
    input.disabled = isImageTask;
    if (isImageTask && input.type === "checkbox") {
      input.checked = false;
    }
    if (label) {
      const labelText = label.querySelector("span");
      label.classList.toggle("not-applicable", isImageTask);
      if (labelText) {
        labelText.dataset.naLabel = isImageTask ? t("not_applicable") : "";
      }
      label.title = isImageTask ? t("not_applicable") : "";
    }
  });
}

function configureStitchAvailability(config) {
  const tab = byId("tab-stitch");
  const runButton = byId("run-stitch");
  const hint = byId("stitch-hint");
  const available = Boolean(config.ffmpeg);
  tab.disabled = !available;
  runButton.disabled = !available;
  hint.textContent = available
    ? t("stitch_hint")
    : t("stitch_hint_noffmpeg");
  updateStitchTitleCardAvailability();
}

async function loadConfig() {
  const config = await requestJson("/api/config");
  state.config = config;
  initializeSessionCap(config);
  applyI18n();
  setStatus(t("status_config_loaded"), "ok", "status_config_loaded");
  scheduleEstimate();
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-${name}`);
  });
  if (name === "jobs") {
    loadJobs();
  }
  if (name === "stitch") {
    loadStitchJobs();
  }
}

function buildGenerateBody() {
  const provider = byId("provider-select").value;
  const modelSelect = byId("model-select");
  const modelId = modelSelect ? modelSelect.value : "";
  const body = {
    task: byId("task-select").value,
    prompt: byId("prompt").value,
    ratio: byId("ratio").value,
    image_urls: linesToList(byId("image-urls").value).concat(
      agnesImg2imgSelected() ? state.localImages.map((image) => image.dataUri) : []
    ),
    video_urls: linesToList(byId("video-urls").value),
    audio_urls: linesToList(byId("audio-urls").value),
    watermark: byId("watermark").checked,
  };
  if (modelId) {
    body.model_id = modelId;
  } else if (provider) {
    body.provider = provider;
  }
  const durationInput = byId("duration");
  const duration = durationInput.value;
  if (!durationInput.disabled && duration) {
    body.duration = Number(duration);
  }
  const size = byId("size").value.trim();
  if (size) {
    body.size = size;
  }
  const seed = byId("seed").value;
  if (seed) {
    body.seed = Number(seed);
  }
  const frameRateInput = byId("frame-rate");
  const frameRate = frameRateInput.value;
  if (!frameRateInput.disabled && frameRate) {
    body.frame_rate = Number(frameRate);
  }
  const negativePrompt = byId("negative-prompt").value.trim();
  if (negativePrompt) {
    body.negative_prompt = negativePrompt;
  }
  const generateAudio = byId("generate-audio");
  if (!generateAudio.disabled && generateAudio.checked) {
    body.generate_audio = true;
  }
  return body;
}

async function submitGenerate(event) {
  event.preventDefault();
  if (state.submitting) {
    return;
  }
  const body = buildGenerateBody();
  setSubmitInFlight(true);
  const estimate = await freshEstimateForSubmit(body);
  const cost = costForGuard(estimate);
  if (!confirmBudgetIfNeeded(cost)) {
    setSubmitInFlight(false);
    return;
  }
  state.activeJobStartedAt = Date.now();
  startElapsedClock();
  const detail = byId("job-detail");
  detail.classList.remove("empty-state");
  detail.replaceChildren(
    createNode("div", { className: "notice generating-notice" }, [
      createNode("span", { className: "spinner", "aria-hidden": "true" }, []),
      createNode("span", { text: t("submitting") }, []),
    ])
  );
  try {
    const job = await postJson("/api/jobs", body);
    state.sessionSpent += cost;
    renderSessionBar();
    state.activeJobId = job.job_id;
    renderJobShell(job.job_id, job.status);
    pollJob(job.job_id);
    switchTab("generate");
  } catch (error) {
    setSubmitInFlight(false);
    stopElapsedClock();
    showError(detail, error);
  }
}

function resultInfo(resultPath, fallbackJobId) {
  const marker = "/results/";
  const index = resultPath.indexOf(marker);
  if (index >= 0) {
    return {
      jobId: resultPath.slice(0, index),
      file: resultPath.slice(index + marker.length),
      label: resultPath,
    };
  }
  return { jobId: fallbackJobId, file: resultPath, label: resultPath };
}

function mediaUrl(jobId, file) {
  return `/api/results/${encodeURIComponent(jobId)}/${file.split("/").map(encodeURIComponent).join("/")}`;
}

function renderMedia(job, container) {
  const results = job.results || [];
  if (!results.length) {
    container.append(createNode("p", { className: "muted-text", text: t("no_result") }, []));
    return;
  }
  results.forEach((resultPath) => {
    const info = resultInfo(resultPath, job.run_dir ? job.run_dir.split("/").pop() : state.activeJobId);
    const src = mediaUrl(info.jobId, info.file);
    const ext = info.file.toLowerCase().split(".").pop();
    const wrap = createNode("figure", { className: "media-card" }, []);
    if (ext === "mp4" || ext === "mov" || ext === "webm") {
      wrap.append(createNode("video", { controls: true, src }, []));
    } else {
      wrap.append(createNode("img", { src, alt: info.label }, []));
    }
    wrap.append(createNode("figcaption", { text: info.label }, []));
    wrap.append(createNode("a", { href: src, download: "", text: t("download") }, []));
    container.append(wrap);
  });
}

function titleCardAvailable() {
  return Boolean(state.config && state.config.ffmpeg && state.config.title_card);
}

function firstVideoResult(job) {
  if (!DONE_STATUSES.has(job.status)) {
    return "";
  }
  const first = (job.results || [])[0] || "";
  const ext = first.toLowerCase().split(".").pop();
  return ["mp4", "mov", "webm"].includes(ext) ? first : "";
}

function titleCardField(form, name) {
  return form.querySelector(`[data-title-card-field='${name}']`);
}

function titleCardBody(videoPath, form) {
  const title = titleCardField(form, "title").value.trim();
  const subtitle = titleCardField(form, "subtitle").value.trim();
  const duration = Number(titleCardField(form, "duration").value || "2.5");
  const bg = titleCardField(form, "bg").value || "blur";
  const body = {
    video: videoPath,
    title,
    duration,
    bg,
    out_name: "titled.mp4",
  };
  if (subtitle) {
    body.subtitle = subtitle;
  }
  return body;
}

function renderTitleCardResult(response, target) {
  const info = resultInfo(response.file, response.job_id);
  const src = mediaUrl(info.jobId, info.file);
  target.replaceChildren(
    createNode("figure", { className: "media-card" }, [
      createNode("video", { controls: true, src }, []),
      createNode("figcaption", { text: response.file }, []),
      createNode("a", { href: src, download: "", text: t("download") }, []),
    ])
  );
}

async function submitTitleCard(videoPath, form, target) {
  if (!titleCardAvailable()) {
    target.replaceChildren(createNode("div", { className: "notice error", text: t("title_card_no_font") }, []));
    return;
  }
  if (!videoPath) {
    target.replaceChildren(createNode("div", { className: "notice", text: t("title_card_wait_stitch") }, []));
    return;
  }
  target.replaceChildren(
    createNode("div", { className: "notice generating-notice" }, [
      createNode("span", { className: "spinner", "aria-hidden": "true" }, []),
      createNode("span", { text: t("title_card_processing") }, []),
    ])
  );
  try {
    const response = await postJson("/api/compose", titleCardBody(videoPath, form));
    renderTitleCardResult(response, target);
    await loadJobs();
  } catch (error) {
    showError(target, error);
  }
}

function updateStitchTitleCardAvailability() {
  const form = byId("stitch-title-card-form");
  const hint = byId("stitch-title-card-hint");
  if (!form || !hint) {
    return;
  }
  const supported = titleCardAvailable();
  const hasVideo = Boolean(state.lastStitchOutput);
  const disabled = !supported || !hasVideo;
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = disabled;
  });
  if (!state.config) {
    hint.textContent = "";
  } else if (!state.config.ffmpeg) {
    hint.textContent = t("install_ffmpeg");
  } else if (!state.config.title_card) {
    hint.textContent = t("title_card_no_font");
  } else if (!hasVideo) {
    hint.textContent = t("title_card_wait_stitch");
  } else {
    hint.textContent = `${t("selected_subtitle")}${LANG === "zh" ? "" : " "}${state.lastStitchOutput}`;
  }
}

function createTitleCardForm(videoPath, resultTarget) {
  const form = createNode("form", { className: "title-card-form" }, [
    createNode("div", { className: "form-grid title-card-grid" }, [
      createNode("label", {}, [
        createNode("span", { text: t("title_card_title") }, []),
        createNode("input", { type: "text", required: true, "data-title-card-field": "title" }, []),
      ]),
      createNode("label", {}, [
        createNode("span", { text: t("title_card_subtitle") }, []),
        createNode("input", { type: "text", "data-title-card-field": "subtitle" }, []),
      ]),
      createNode("label", {}, [
        createNode("span", { text: t("title_card_duration") }, []),
        createNode("input", { type: "number", min: "0.5", step: "0.1", value: "2.5", "data-title-card-field": "duration" }, []),
      ]),
      createNode("label", {}, [
        createNode("span", { text: t("title_card_bg") }, []),
        createNode("select", { "data-title-card-field": "bg" }, [
          createNode("option", { value: "blur", text: t("title_card_bg_blur") }, []),
          createNode("option", { value: "solid", text: t("title_card_bg_solid") }, []),
        ]),
      ]),
    ]),
    createNode("div", { className: "actions" }, [
      createNode("button", { type: "submit", text: t("title_card_run") }, []),
    ]),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitTitleCard(videoPath, form, resultTarget);
  });
  return form;
}

function createJobTitleCardAction(job) {
  const videoPath = firstVideoResult(job);
  if (!videoPath) {
    return null;
  }
  const formSlot = createNode("div", { className: "title-card-form-slot" }, []);
  const result = createNode("div", { className: "job-detail" }, []);
  const button = createNode("button", {
    type: "button",
    className: "secondary",
    text: t("title_card_add"),
    disabled: !titleCardAvailable(),
  }, []);
  button.addEventListener("click", () => {
    formSlot.replaceChildren(createTitleCardForm(videoPath, result));
  });
  const children = [button];
  if (!titleCardAvailable()) {
    children.push(createNode("p", { className: "muted-text", text: t("title_card_no_font") }, []));
  }
  children.push(formSlot, result);
  return createNode("section", { className: "title-card-action" }, children);
}

function renderJobShell(jobId, status) {
  const detail = byId("job-detail");
  detail.classList.remove("empty-state");
  detail.replaceChildren(
    createNode("div", { className: "job-meta" }, [
      createNode("span", { className: "badge", text: `${t("th_job")} ${jobId}` }, []),
      createNode("span", { className: "badge", text: status || "queued" }, []),
    ]),
    createProgressIndicator({ status: status || "queued" })
  );
  byId("current-job-subtitle").textContent = composeJobSubtitle("poll_subtitle", jobId);
}

function createProgressIndicator(job) {
  if (isTerminalStatus(job.status)) {
    return createNode("div", { className: "is-hidden" }, []);
  }
  const progress = typeof job.progress === "number" ? String(job.progress) : "";
  return createNode("div", { className: "progress-strip" }, [
    createNode("span", { className: "spinner", "aria-hidden": "true" }, []),
    createNode("span", { className: "progress-label", text: t("generating") }, []),
    createNode("span", {
      className: "elapsed",
      "data-elapsed": "current",
      "data-progress": progress,
      text: `${t("elapsed")} 00:00${progress ? ` · ${progress}%` : ""}`,
    }, []),
  ]);
}

function renderJobDetail(job) {
  state.activeJob = job;
  const detail = byId("job-detail");
  const jobId = job.run_dir ? job.run_dir.split("/").pop() : state.activeJobId;
  const rows = [
    [t("row_task"), job.task],
    [t("row_provider"), job.provider],
    [t("row_model"), job.model_id],
    [t("row_status"), job.status],
    [t("row_task_id"), job.task_id],
  ];
  const meta = createNode("dl", { className: "detail-grid" }, []);
  rows.forEach(([label, value]) => {
    meta.append(createNode("dt", { text: label }, []));
    meta.append(createNode("dd", { text: value || "-" }, []));
  });
  const media = createNode("div", { className: "media-grid" }, []);
  renderMedia(job, media);
  const children = [
    createNode("div", { className: "job-meta" }, [
      createNode("span", { className: `badge ${DONE_STATUSES.has(job.status) ? "ok" : ""}`, text: job.status || "unknown" }, []),
      createNode("span", { className: "badge", text: jobId || "-" }, []),
    ]),
    createProgressIndicator(job),
    meta,
    media,
  ];
  const titleAction = createJobTitleCardAction(job);
  if (titleAction) {
    children.push(titleAction);
  }
  detail.classList.remove("empty-state");
  detail.replaceChildren(...children);
  updateElapsedDisplay();
  byId("current-job-subtitle").textContent = jobId ? composeJobSubtitle("selected_subtitle", jobId) : t("no_job");
}

async function pollJob(jobId) {
  if (state.pollTimer) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
  try {
    const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
    renderJobDetail(job);
    if (!isTerminalStatus(job.status)) {
      state.pollTimer = window.setTimeout(() => pollJob(jobId), 3000);
    } else {
      setSubmitInFlight(false);
      stopElapsedClock();
      await loadJobs();
    }
  } catch (error) {
    setSubmitInFlight(false);
    stopElapsedClock();
    showError(byId("job-detail"), error);
  }
}

async function loadJobs() {
  const target = byId("jobs-table");
  target.replaceChildren(createNode("div", { className: "notice", text: t("loading_jobs") }, []));
  try {
    state.jobs = await requestJson("/api/jobs");
    renderJobsTable(state.jobs);
  } catch (error) {
    showError(target, error);
  }
}

function renderJobsTable(jobs) {
  const target = byId("jobs-table");
  if (!jobs.length) {
    target.replaceChildren(createNode("div", { className: "empty-state", text: t("no_jobs") }, []));
    return;
  }
  const table = createNode("table", {}, []);
  const head = createNode("thead", {}, [
    createNode("tr", {}, [t("th_job"), t("th_task"), t("th_model"), t("th_status"), t("th_result")].map((label) => createNode("th", { text: label }, []))),
  ]);
  const body = createNode("tbody", {}, []);
  jobs.forEach((job) => {
    const jobId = job.run_dir ? job.run_dir.split("/").pop() : "";
    const row = createNode("tr", { tabindex: "0" }, [
      createNode("td", { text: jobId }, []),
      createNode("td", { text: job.task || "-" }, []),
      createNode("td", { text: job.model_id || "-" }, []),
      createNode("td", {}, [createNode("span", { className: "badge", text: job.status || "-" }, [])]),
      createNode("td", { text: (job.results || []).join(", ") || "-" }, []),
    ]);
    row.addEventListener("click", () => {
      state.activeJobId = jobId;
      switchTab("generate");
      pollJob(jobId);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        row.click();
      }
    });
    body.append(row);
  });
  table.append(head, body);
  target.replaceChildren(table);
}

function completedMp4Jobs(jobs) {
  const clips = [];
  jobs.forEach((job) => {
    if (!DONE_STATUSES.has(job.status)) {
      return;
    }
    (job.results || []).forEach((resultPath) => {
      if (resultPath.toLowerCase().endsWith(".mp4")) {
        clips.push({ job, resultPath });
      }
    });
  });
  return clips;
}

async function loadStitchJobs() {
  const target = byId("stitch-list");
  if (state.config && !state.config.ffmpeg) {
    target.replaceChildren(createNode("div", { className: "notice", text: t("install_ffmpeg") }, []));
    return;
  }
  target.replaceChildren(createNode("div", { className: "notice", text: t("loading_clips") }, []));
  try {
    state.jobs = await requestJson("/api/jobs");
    renderStitchList(completedMp4Jobs(state.jobs));
  } catch (error) {
    showError(target, error);
  }
}

function renderStitchList(clips) {
  const target = byId("stitch-list");
  if (!clips.length) {
    target.replaceChildren(createNode("div", { className: "empty-state", text: t("no_clips") }, []));
    return;
  }
  const list = createNode("div", { className: "clip-list" }, []);
  clips.forEach((clip, index) => {
    const row = createNode("label", { className: "clip-row" }, []);
    row.append(createNode("input", { type: "checkbox", dataset: { path: clip.resultPath } }, []));
    row.append(createNode("input", { type: "number", min: "1", value: String(index + 1), className: "order-input" }, []));
    row.append(createNode("span", { text: clip.resultPath }, []));
    list.append(row);
  });
  target.replaceChildren(list);
}

async function runStitch() {
  const result = byId("stitch-result");
  const rows = Array.from(document.querySelectorAll(".clip-row"));
  const selected = rows
    .map((row) => {
      const checkbox = row.querySelector("input[type='checkbox']");
      const order = row.querySelector(".order-input");
      return { checked: checkbox.checked, path: checkbox.dataset.path, order: Number(order.value || "0") };
    })
    .filter((item) => item.checked)
    .sort((a, b) => a.order - b.order);
  if (!selected.length) {
    result.replaceChildren(createNode("div", { className: "notice error", text: t("select_one_clip") }, []));
    return;
  }
  result.replaceChildren(createNode("div", { className: "notice", text: t("stitching") }, []));
  try {
    const response = await postJson("/api/stitch", {
      inputs: selected.map((item) => item.path),
      out_name: byId("stitch-out-name").value || "stitched.mp4",
    });
    state.lastStitchOutput = response.file;
    const info = resultInfo(response.file, response.job_id);
    const src = mediaUrl(info.jobId, info.file);
    result.replaceChildren(
      createNode("figure", { className: "media-card" }, [
        createNode("video", { controls: true, src }, []),
        createNode("figcaption", { text: response.file }, []),
        createNode("a", { href: src, download: "", text: t("download_stitched") }, []),
      ])
    );
    updateStitchTitleCardAvailability();
    await loadJobs();
  } catch (error) {
    showError(result, error);
  }
}

function on(id, evt, fn) {
  const el = byId(id);
  if (el) {
    el.addEventListener(evt, fn);
  }
}

function bindEvents() {
  on("lang-toggle", "click", toggleLanguage);
  on("keys-form", "submit", (event) => event.preventDefault());
  on("save-keys", "click", saveKeys);
  on("clear-keys", "click", clearKeys);
  on("refresh-config", "click", () => loadConfig().catch((error) => showError(byId("job-detail"), error)));
  on("refresh-jobs", "click", loadJobs);
  on("refresh-stitch", "click", loadStitchJobs);
  on("generate-form", "submit", submitGenerate);
  on("run-stitch", "click", runStitch);
  on("session-cap", "input", () => {
    const input = byId("session-cap");
    if (input) {
      localStorage.setItem("octopus.cap", input.value);
    }
    renderSessionBar();
  });
  on("session-reset", "click", () => {
    state.sessionSpent = 0;
    renderSessionBar();
  });
  on("stitch-title-card-form", "submit", (event) => {
    event.preventDefault();
    submitTitleCard(state.lastStitchOutput, event.currentTarget, byId("stitch-title-card-result"));
  });
  on("image-file", "change", handleLocalImageChange);
  KEY_FIELDS.forEach(([inputId]) => {
    on(inputId, "input", () => {
      if (state.config) {
        renderKeyBadges(state.config);
        if (inputId === "key-agnes") {
          updateLocalUploadAvailability();
        }
        scheduleEstimate();
      }
    });
  });
  on("task-select", "change", () => {
    updateFreeBadge();
    updateTaskAwareFields();
    updateLocalUploadAvailability();
    scheduleEstimate();
  });
  on("provider-select", "change", () => {
    const modelSelect = byId("model-select");
    if (modelSelect) {
      modelSelect.value = "";
    }
    if (state.config) {
      populateModels(state.config);
    }
    updateFreeBadge();
    updateLocalUploadAvailability();
    scheduleEstimate();
  });
  on("model-select", "change", () => {
    updateFreeBadge();
    updateLocalUploadAvailability();
    scheduleEstimate();
  });
  ["duration", "image-urls", "video-urls", "audio-urls"].forEach((id) => {
    on(id, "input", scheduleEstimate);
    on(id, "change", scheduleEstimate);
  });
  on("n", "input", scheduleEstimate);
  on("n", "change", scheduleEstimate);
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (!tab.disabled) {
        switchTab(tab.dataset.tab);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadStoredKeys();
  bindEvents();
  applyI18n();
  loadConfig()
    .then(loadJobs)
    .catch((error) => {
      setStatus(t("status_config_failed"), "error", "status_config_failed");
      showError(byId("job-detail"), error);
    });
});
