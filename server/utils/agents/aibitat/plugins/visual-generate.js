const { visualProductionClient } = require("../../../visualProduction");

const DEFAULT_MAX_POLL_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DONE = new Set(["succeeded", "success", "completed"]);
const FAILED = new Set(["failed", "error", "canceled", "cancelled"]);
const SERVER_KEY_ERROR_PATTERN =
  /missing.*key|api[_ -]?key|credential|unauthorized|forbidden|ark|dashscope|agnes/i;

function resolveMaxPollMs() {
  const raw = Number(process.env.VISUAL_AGENT_POLL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_POLL_MS;
  return Math.min(Math.max(raw, 5_000), 600_000);
}

function resultRel(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    return entry.file || entry.result_file || entry.output_path || null;
  }
  return null;
}

function visualResultUrl(rel, jobId) {
  const value = String(rel || "");
  const marker = "/results/";
  const markerIndex = value.indexOf(marker);
  const effectiveJobId =
    markerIndex >= 0 ? value.slice(0, markerIndex) || jobId : jobId;
  const filename = markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value;

  if (!effectiveJobId || !filename) return null;

  return `/api/visual/results/${encodeURIComponent(effectiveJobId)}/${filename
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function serverKeyErrorMessage(error) {
  const status = Number(error?.response?.status);
  const message = String(error?.message || "");
  const bodyMessage = String(
    error?.response?.data?.error ||
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      ""
  );
  const combined = `${message} ${bodyMessage}`;
  const looksLikeKeyError =
    status === 401 ||
    status === 403 ||
    SERVER_KEY_ERROR_PATTERN.test(combined);

  if (!looksLikeKeyError) return null;

  return (
    "视觉生成未成功：服务端 visual provider key 未配置或无效。Agent 只能使用服务端环境变量中的 keys；" +
    "浏览器临时 key 只适用于 /visual 页面。请配置服务端 key，或在 /visual 手动生成。"
  );
}

const visualGenerate = {
  name: "visual-generate",
  startupConfig: { params: {} },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Generate an image or video from a text prompt via the visual production service. " +
            "Use task ids like image.poster.final, image.poster.draft, video.final, video.text.draft. " +
            "Only runs when the estimated cost is within budget; high-cost jobs must be confirmed by the user in the /visual page. " +
            "Requires the visual sidecar to be running.",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              task: {
                type: "string",
                description:
                  "Route id, e.g. image.poster.final or video.final",
              },
              prompt: {
                type: "string",
                description: "Text prompt describing the image/video",
              },
              provider: {
                type: "string",
                description: "auto (default) or a specific provider id",
              },
              ratio: {
                type: "string",
                description: "Aspect ratio like 16:9 or 1:1",
              },
              duration: {
                type: "number",
                description: "Video duration in seconds (video tasks only)",
              },
            },
            additionalProperties: false,
          },
          required: ["task", "prompt"],
          handler: async function ({ task, prompt, provider, ratio, duration }) {
            const maxPollMs =
              this._maxPollMs != null ? this._maxPollMs : resolveMaxPollMs();
            const intervalMs =
              this._pollIntervalMs != null
                ? this._pollIntervalMs
                : DEFAULT_POLL_INTERVAL_MS;

            try {
              const health = await visualProductionClient.isAvailable();
              if (!health.available) {
                return "视觉服务未启动（visual service not started）。请先运行 `yarn dev:visual` 再重试。";
              }

              const body = { task, prompt };
              if (provider) body.provider = provider;
              if (ratio) body.ratio = ratio;
              if (duration != null) body.duration = duration;

              const cfg = await visualProductionClient.getConfig({});
              const rawThreshold = Number(cfg?.budget?.confirm_threshold_cny);
              const threshold = Number.isFinite(rawThreshold)
                ? rawThreshold
                : 0;

              let cost = NaN;
              try {
                const estimate = await visualProductionClient.estimate(
                  body,
                  {}
                );
                // 边车 estimate 返回 CNY 字段名为 `cny`；兼容 cost_cny/cost
                cost = Number(estimate?.cny ?? estimate?.cost_cny ?? estimate?.cost);
              } catch (error) {
                const keyMessage = serverKeyErrorMessage(error);
                if (keyMessage) return keyMessage;
                return "无法估算成本（cannot estimate），已中止。请在视觉生成页（/visual）手动生成。";
              }

              if (!Number.isFinite(cost)) {
                return "无法估算成本（cost unavailable），已中止。请在视觉生成页（/visual）手动生成。";
              }

              if (cost > threshold) {
                return `预计花费约 ¥${cost}，超阈值 ¥${threshold}，agent 不自动提交。请在视觉生成页（/visual）确认后生成，或改用 draft 任务。`;
              }

              this.super.introspect(
                `${this.caller}: 提交视觉生成任务 ${task}（≈¥${cost}）…`
              );
              const submitted = await visualProductionClient.submit(body, {});
              const jobId = submitted?.job_id;
              if (!jobId) return "提交失败（no job_id）。";

              const started = Date.now();
              let job = submitted;
              do {
                job = await visualProductionClient.getJob(jobId, {});
                const status = String(job?.status || "").toLowerCase();
                if (FAILED.has(status)) {
                  return `生成失败（job ${jobId}）：${job?.error || status}`;
                }
                // 完成且结果已就绪才结束：部分 provider（如 Agnes）秒完成，
                // 但 results 落盘有短暂延迟，过早 break 会拿到空 results。
                if (DONE.has(status) && resultRel((job.results || [])[0])) break;
                if (Date.now() - started >= maxPollMs) break;
                if (intervalMs > 0) {
                  await new Promise((resolve) =>
                    setTimeout(resolve, intervalMs)
                  );
                }
              } while (Date.now() - started < maxPollMs);

              const status = String(job?.status || "").toLowerCase();
              if (!DONE.has(status)) {
                return `任务已提交（job ${jobId}），仍在处理中（processing）。请稍后在"视觉生成 → My Jobs"查看结果。`;
              }

              const rel = resultRel((job.results || [])[0]);
              if (!rel) {
                return `任务完成（job ${jobId}）但未返回结果文件。请在"视觉生成 → My Jobs"查看。`;
              }

              const url = visualResultUrl(rel, jobId);
              if (!url) {
                return `任务完成（job ${jobId}）但结果路径无效。请在"视觉生成 → My Jobs"查看。`;
              }

              return `已生成完成（job ${jobId}）。结果：${url}`;
            } catch (error) {
              this.super.handlerProps.log(
                `visual-generate error: ${error.message}`
              );
              const keyMessage = serverKeyErrorMessage(error);
              if (keyMessage) return keyMessage;
              return `视觉生成未成功：${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = { visualGenerate };
