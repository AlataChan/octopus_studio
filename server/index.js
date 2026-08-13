// Electron bundles Node 18 (no global File); bundled undici@7 needs it at load time. No-op on Node >=20 / Docker.
if (typeof globalThis.File === "undefined") {
  globalThis.File = require("node:buffer").File;
}

const path = require("path");

function getDotenvPath() {
  // Dev uses repo-local env files.
  if (process.env.NODE_ENV === "development") {
    return `.env.${process.env.NODE_ENV}`;
  }

  // Desktop (Electron) runs from app Resources (read-only). Persist env under STORAGE_DIR.
  if (
    process.env.ANYTHING_LLM_RUNTIME === "desktop" &&
    process.env.STORAGE_DIR
  ) {
    return path.join(process.env.STORAGE_DIR, ".env");
  }

  // Default: `.env` in current working directory.
  return ".env";
}

require("dotenv").config({ path: getDotenvPath() });

require("./utils/logger")();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { reqBody } = require("./utils/http");
const { systemEndpoints } = require("./endpoints/system");
const { workspaceEndpoints } = require("./endpoints/workspaces");
const {
  workspaceAnalysisFilesEndpoints,
} = require("./endpoints/workspaceAnalysisFiles");
const {
  workspaceScheduledTasksEndpoints,
} = require("./endpoints/workspaceScheduledTasks");
const { chatEndpoints } = require("./endpoints/chat");
const { embeddedEndpoints } = require("./endpoints/embed");
const { embedManagementEndpoints } = require("./endpoints/embedManagement");
const { getVectorDbClass } = require("./utils/helpers");
const { adminEndpoints } = require("./endpoints/admin");
const { inviteEndpoints } = require("./endpoints/invite");
const { utilEndpoints } = require("./endpoints/utils");
const { developerEndpoints } = require("./endpoints/api");
const { extensionEndpoints } = require("./endpoints/extensions");
const { bootHTTP, bootSSL } = require("./utils/boot");
const { workspaceThreadEndpoints } = require("./endpoints/workspaceThreads");
const { documentEndpoints } = require("./endpoints/document");
const { agentWebsocket } = require("./endpoints/agentWebsocket");
const { experimentalEndpoints } = require("./endpoints/experimental");
const { browserExtensionEndpoints } = require("./endpoints/browserExtension");
const { communityHubEndpoints } = require("./endpoints/communityHub");
const { skillHubEndpoints } = require("./endpoints/skillHub");
const { agentFlowEndpoints } = require("./endpoints/agentFlows");
const { mcpServersEndpoints } = require("./endpoints/mcpServers");
const { mobileEndpoints } = require("./endpoints/mobile");
const { assistantLibraryEndpoints } = require("./endpoints/assistantLibrary");
const {
  workflowConfirmationEndpoints,
} = require("./endpoints/workflowConfirmation");
const { workspaceGraphEndpoints } = require("./endpoints/workspaceGraph");
const { metricsEndpoints } = require("./endpoints/metrics");
const { workspaceAITeamEndpoints } = require("./endpoints/workspaceAITeam");
const { agentStatusEndpoints } = require("./endpoints/agentStatus");
const { aiSystemEndpoints } = require("./endpoints/aiSystem");
const { pluginEndpoints } = require("./endpoints/plugins");
const { billingEndpoints } = require("./endpoints/billing");
const { notificationEndpoints } = require("./endpoints/notifications");
const { apiKeyEndpoints } = require("./endpoints/apiKeys");
const { userBillingEndpoints } = require("./endpoints/userBilling");
const { feedbackEndpoints } = require("./endpoints/feedback");
const { memoryStatsEndpoints } = require("./endpoints/api/memoryStats");
const { workspaceImagesEndpoints } = require("./endpoints/workspaceImages");
const { visualProductionEndpoints } = require("./endpoints/visualProduction");
const { imGatewayEndpoints } = require("./endpoints/imGateway");
const { openClawEndpoints } = require("./endpoints/openClaw");
const { liveCanvasEndpoints } = require("./endpoints/liveCanvas");
const { internalApiEndpoints } = require("./endpoints/internalApi");
const { runArtifactsEndpoints } = require("./endpoints/runArtifacts");
const { workAgentEndpoints } = require("./endpoints/workAgent");
const { fdeWorkflowEndpoints } = require("./endpoints/fdeWorkflows");
const { fdeAuthoringEndpoints } = require("./endpoints/fdeAuthoring");
const { fdeRunEndpoints } = require("./endpoints/fdeRuns");
const { codingAgentEndpoints } = require("./endpoints/codingAgent");
const { officeEndpoints } = require("./endpoints/office");
const { moltEndpoints } = require("./endpoints/molt");
const { tierRoutingEndpoints } = require("./endpoints/tierRouting");
const { httpLogger } = require("./middleware/httpLogger");
const { generalLimiter } = require("./middleware/rateLimiter");
const { requestIdMiddleware } = require("./middleware/requestId");
const {
  desktopOriginProtection,
} = require("./utils/middleware/desktopOriginProtection");
const {
  assertProductionCorsConfig,
  getCorsConfig,
  logCorsConfig,
} = require("./utils/corsConfig");
const {
  errorHandler,
  setupUnhandledRejectionHandler,
  setupUncaughtExceptionHandler,
} = require("./middleware/errorHandler");
const { initScheduler } = require("./utils/scheduler");
const {
  syncEnvToSystemSettings,
  createMoltClientFromSettings,
} = require("./utils/molt/bootstrap");
const { MoltHealthMonitor } = require("./utils/molt/healthMonitor");
const { startMoltBridgeSyncJob } = require("./utils/molt/syncJob");
const { MoltOrphanScheduler } = require("./utils/molt/scheduler");
const {
  scheduleWorkAgentAssistantReseed,
} = require("./utils/workAgent/runtimeSeed");
const {
  registerOctopusKbMcpIfEnabled,
} = require("./utils/octopusKb/registerMcp");
const { getRequestBodyLimit } = require("./utils/requestLimits");

// 设置全局未捕获异常处理器（防止进程崩溃）
setupUnhandledRejectionHandler();
setupUncaughtExceptionHandler();
const app = express();
const apiRouter = express.Router();
const requestBodyLimit = getRequestBodyLimit();
const { OfficeProjection } = require("./utils/office/officeProjection");
const { createOfficeDatasources } = require("./utils/office/dataSources");
const { setOfficeProjection } = require("./utils/office/singleton");

const officeProjection = new OfficeProjection(createOfficeDatasources());
setOfficeProjection(officeProjection);
officeProjection.bootstrap().catch((error) => {
  console.error("[OfficeProjection] Bootstrap failed:", error.message);
});

// Only log HTTP requests in development mode and if the ENABLE_HTTP_LOGGER environment variable is set to true
if (
  process.env.NODE_ENV === "development" &&
  !!process.env.ENABLE_HTTP_LOGGER
) {
  app.use(
    httpLogger({
      enableTimestamps: !!process.env.ENABLE_HTTP_LOGGER_TIMESTAMPS,
    })
  );
}

// CORS 配置 - 支持通过环境变量 CORS_ALLOWED_ORIGINS 限制允许的来源
assertProductionCorsConfig();
logCorsConfig();
app.use(cors({ ...getCorsConfig(), preflightContinue: true }));
app.use("/api", desktopOriginProtection);
// Capture raw request body for webhook signature verification (Feishu/WeCom) and auditing.
app.use(
  bodyParser.text({
    limit: requestBodyLimit,
    type: ["text/*", "application/xml", "application/*+xml"],
    verify: (req, _res, buf) => {
      req.rawBody = buf?.toString?.() ?? "";
    },
  })
);
app.use(
  bodyParser.json({
    limit: requestBodyLimit,
    verify: (req, _res, buf) => {
      req.rawBody = buf?.toString?.() ?? "";
    },
  })
);
app.use(
  bodyParser.urlencoded({
    limit: requestBodyLimit,
    extended: true,
    verify: (req, _res, buf) => {
      req.rawBody = buf?.toString?.() ?? "";
    },
  })
);

// 请求追踪 ID 中间件（为每个请求生成唯一 ID，便于日志追踪）
app.use(requestIdMiddleware);

// 应用通用 API 限流保护（防止 DoS 攻击）
// 配置: 15分钟内最多 200 次请求/IP
app.use("/api", generalLimiter);

if (process.env.ENABLE_HTTPS) {
  bootSSL(app, process.env.SERVER_PORT || 3001);
} else {
  require("@mintplex-labs/express-ws").default(app); // load WebSockets in non-SSL mode.
}

app.use("/api", apiRouter);
systemEndpoints(apiRouter);
extensionEndpoints(apiRouter);
workspaceEndpoints(apiRouter);
workspaceAnalysisFilesEndpoints(apiRouter);
workspaceScheduledTasksEndpoints(apiRouter);
workspaceThreadEndpoints(apiRouter);
chatEndpoints(apiRouter);
adminEndpoints(apiRouter);
tierRoutingEndpoints(apiRouter);
inviteEndpoints(apiRouter);
embedManagementEndpoints(apiRouter);
utilEndpoints(apiRouter);
documentEndpoints(apiRouter);
agentWebsocket(apiRouter);
experimentalEndpoints(apiRouter);
developerEndpoints(app, apiRouter);
communityHubEndpoints(apiRouter);
skillHubEndpoints(apiRouter);
agentFlowEndpoints(apiRouter);
mcpServersEndpoints(apiRouter);
mobileEndpoints(apiRouter);
assistantLibraryEndpoints(apiRouter);
workflowConfirmationEndpoints(apiRouter);
workspaceGraphEndpoints(apiRouter);
metricsEndpoints(apiRouter);
workspaceAITeamEndpoints(apiRouter);
agentStatusEndpoints(apiRouter);
aiSystemEndpoints(apiRouter);
memoryStatsEndpoints(apiRouter);
pluginEndpoints(apiRouter);
billingEndpoints(apiRouter);
notificationEndpoints(apiRouter);
apiKeyEndpoints(apiRouter);
userBillingEndpoints(app, apiRouter);
feedbackEndpoints(apiRouter);
workspaceImagesEndpoints(apiRouter);
visualProductionEndpoints(apiRouter);
imGatewayEndpoints(apiRouter);
openClawEndpoints(apiRouter);
liveCanvasEndpoints(apiRouter);
officeEndpoints(apiRouter, officeProjection);
runArtifactsEndpoints(apiRouter);
workAgentEndpoints(apiRouter);
fdeWorkflowEndpoints(apiRouter);
fdeAuthoringEndpoints(apiRouter);
fdeRunEndpoints(apiRouter);
codingAgentEndpoints(apiRouter);
internalApiEndpoints(apiRouter);
moltEndpoints(apiRouter);

// Externally facing embedder endpoints
embeddedEndpoints(apiRouter);

// Externally facing browser extension endpoints
browserExtensionEndpoints(apiRouter);

app.options("*", function (_, response) {
  response.sendStatus(204);
});

if (process.env.NODE_ENV !== "development") {
  const { MetaGenerator } = require("./utils/boot/MetaGenerator");
  const IndexPage = new MetaGenerator();

  app.use(
    express.static(path.resolve(__dirname, "public"), {
      extensions: ["js"],
      setHeaders: (res) => {
        // Disable I-framing of entire site UI
        res.removeHeader("X-Powered-By");
        res.setHeader("X-Frame-Options", "DENY");
      },
    })
  );

  app.use("/", function (_, response) {
    IndexPage.generate(response);
    return;
  });

  app.get("/robots.txt", function (_, response) {
    response.type("text/plain");
    response.send("User-agent: *\nDisallow: /").end();
  });
} else {
  // Debug route for development connections to vectorDBs
  apiRouter.post("/v/:command", async (request, response) => {
    try {
      const VectorDb = getVectorDbClass();
      const { command } = request.params;
      if (!Object.getOwnPropertyNames(VectorDb).includes(command)) {
        response.status(500).json({
          message: "invalid interface command",
          commands: Object.getOwnPropertyNames(VectorDb),
        });
        return;
      }

      try {
        const body = reqBody(request);
        const resBody = await VectorDb[command](body);
        response.status(200).json({ ...resBody });
      } catch (e) {
        // console.error(e)
        console.error(JSON.stringify(e));
        response.status(500).json({ error: e.message });
      }
      return;
    } catch (e) {
      console.error(e.message, e);
      response.sendStatus(500).end();
    }
  });
}

app.all("*", function (_, response) {
  response.sendStatus(404);
});

// 全局错误处理中间件（必须放在所有路由之后）
// 捕获所有未被 try-catch 处理的错误，返回统一格式的错误响应
app.use(errorHandler);

// In non-https mode we need to boot at the end since the server has not yet
// started and is `.listen`ing.
if (!process.env.ENABLE_HTTPS) bootHTTP(app, process.env.SERVER_PORT || 3001);

async function initializeBackgroundServices() {
  try {
    await syncEnvToSystemSettings();
    const client = await createMoltClientFromSettings();
    if (client) {
      MoltHealthMonitor.getInstance()
        .start({ client, tokenReloadOptions: client.tokenReloadOptions })
        .catch((error) =>
          console.warn("[MoltHealthMonitor] start skipped:", error.message)
        );
      startMoltBridgeSyncJob();
      MoltOrphanScheduler.start();
    }
  } catch (error) {
    console.warn("[MoltBootstrap] startup skipped:", error.message);
  } finally {
    await registerOctopusKbMcpIfEnabled();
    scheduleWorkAgentAssistantReseed();
    // 初始化定时任务调度器（知识同步等）
    initScheduler();
  }
}

initializeBackgroundServices();

// Graceful shutdown: stop managed gateway process on app exit.
// Use killProcess() for SIGKILL fallback if SIGTERM doesn't work.
// Named handlers so removeListener works (anonymous wrappers break it).
const { openClawService } = require("./utils/openClaw");
const { killProcess } = require("./utils/openClaw/processHelper");
const { shutdownWorkAgentEngines } = require("./utils/workAgent/engines");

function _cleanupGateway() {
  MoltHealthMonitor.getInstance().stop();
  MoltOrphanScheduler.stop();
  shutdownWorkAgentEngines();
  if (openClawService._gatewayProcess) {
    killProcess(openClawService._gatewayProcess);
    openClawService._gatewayProcess = null;
  }
}

// Exit promptly after cleanup. The previous "removeListener + re-raise SIGTERM"
// pattern is unreliable on modern Node: removing the last signal listener does
// not consistently restore the default disposition, so the re-raised signal can
// be swallowed and the process lingers (open HTTP keep-alive sockets keep the
// loop alive) until the desktop parent's SIGKILL fallback fires — a slow quit.
// _cleanupGateway() is synchronous, so exiting right after is safe.
function _onSigterm() {
  // try/catch so a throw inside cleanup can't prevent the exit — an exception in
  // a signal handler would otherwise leave the process alive until the desktop
  // parent's SIGKILL fallback (the slow quit).
  try {
    _cleanupGateway();
  } catch (_) {
    /* best-effort cleanup; exit regardless */
  }
  process.exit(0);
}

function _onSigint() {
  try {
    _cleanupGateway();
  } catch (_) {
    /* best-effort cleanup; exit regardless */
  }
  process.exit(0);
}

process.on("SIGTERM", _onSigterm);
process.on("SIGINT", _onSigint);
process.on("exit", _cleanupGateway);
