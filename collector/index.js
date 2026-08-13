// Electron bundles Node 18 (no global File); bundled undici@7 needs it at load time. No-op on Node >=20 / Docker.
if (typeof globalThis.File === "undefined") {
  globalThis.File = require("node:buffer").File;
}

process.env.NODE_ENV === "development"
  ? require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` })
  : require("dotenv").config();

require("./utils/logger")();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const { ACCEPTED_MIMES } = require("./utils/constants");
const { reqBody } = require("./utils/http");
const { processSingleFile } = require("./processSingleFile");
const { processLink, getLinkText } = require("./processLink");
const { wipeCollectorStorage } = require("./utils/files");
const extensions = require("./extensions");
const { processRawText } = require("./processRawText");
const { verifyPayloadIntegrity } = require("./middleware/verifyIntegrity");
const { httpLogger } = require("./middleware/httpLogger");
const {
  assertProductionCorsConfig,
  getCorsConfig,
} = require("./utils/corsConfig");
const { formatListenAddress, resolveServiceHost } = require("./utils/bindHost");
const { getCollectorRequestBodyLimit } = require("./utils/requestLimits");
const app = express();
const requestBodyLimit = getCollectorRequestBodyLimit();

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
app.use(cors(getCorsConfig()));
app.use(
  bodyParser.text({ limit: requestBodyLimit }),
  bodyParser.json({ limit: requestBodyLimit }),
  bodyParser.urlencoded({
    limit: requestBodyLimit,
    extended: true,
  })
);

app.post(
  "/process",
  [verifyPayloadIntegrity],
  async function (request, response) {
    const { filename, options = {}, metadata = {} } = reqBody(request);
    try {
      const targetFilename = path
        .normalize(filename)
        .replace(/^(\.\.(\/|\\|$))+/, "");
      const {
        success,
        reason,
        documents = [],
      } = await processSingleFile(targetFilename, options, metadata);
      response
        .status(200)
        .json({ filename: targetFilename, success, reason, documents });
    } catch (e) {
      console.error(e);
      response.status(200).json({
        filename: filename,
        success: false,
        reason: "A processing error occurred.",
        documents: [],
      });
    }
    return;
  }
);

app.post(
  "/parse",
  [verifyPayloadIntegrity],
  async function (request, response) {
    const { filename, options = {} } = reqBody(request);
    try {
      const targetFilename = path
        .normalize(filename)
        .replace(/^(\.\.(\/|\\|$))+/, "");
      const {
        success,
        reason,
        documents = [],
      } = await processSingleFile(targetFilename, {
        ...options,
        parseOnly: true,
      });
      response
        .status(200)
        .json({ filename: targetFilename, success, reason, documents });
    } catch (e) {
      console.error(e);
      response.status(200).json({
        filename: filename,
        success: false,
        reason: "A processing error occurred.",
        documents: [],
      });
    }
    return;
  }
);

app.post(
  "/process-link",
  [verifyPayloadIntegrity],
  async function (request, response) {
    const { link, scraperHeaders = {}, metadata = {} } = reqBody(request);
    try {
      const {
        success,
        reason,
        documents = [],
      } = await processLink(link, scraperHeaders, metadata);
      response.status(200).json({ url: link, success, reason, documents });
    } catch (e) {
      console.error(e);
      response.status(200).json({
        url: link,
        success: false,
        reason: "A processing error occurred.",
        documents: [],
      });
    }
    return;
  }
);

app.post(
  "/util/get-link",
  [verifyPayloadIntegrity],
  async function (request, response) {
    const { link, captureAs = "text" } = reqBody(request);
    try {
      const { success, content = null } = await getLinkText(link, captureAs);
      response.status(200).json({ url: link, success, content });
    } catch (e) {
      console.error(e);
      response.status(200).json({
        url: link,
        success: false,
        content: null,
      });
    }
    return;
  }
);

app.post(
  "/process-raw-text",
  [verifyPayloadIntegrity],
  async function (request, response) {
    const { textContent, metadata } = reqBody(request);
    try {
      const {
        success,
        reason,
        documents = [],
      } = await processRawText(textContent, metadata);
      response
        .status(200)
        .json({ filename: metadata.title, success, reason, documents });
    } catch (e) {
      console.error(e);
      response.status(200).json({
        filename: metadata?.title || "Unknown-doc.txt",
        success: false,
        reason: "A processing error occurred.",
        documents: [],
      });
    }
    return;
  }
);

extensions(app);

app.get("/accepts", function (_, response) {
  response.status(200).json(ACCEPTED_MIMES);
});

// ==================== OCR API ====================

/**
 * 获取 OCR 引擎状态
 * GET /ocr/status
 */
app.get("/ocr/status", async function (_, response) {
  try {
    const { SmartOCRRouter } = require("./utils/OCRLoader/smartOCRRouter");
    const router = new SmartOCRRouter();
    const status = await router.getEngineStatus();
    const metrics = router.getPerformanceMetrics();

    response.status(200).json({
      success: true,
      engines: status,
      metrics: {
        totalRequests: metrics.totalRequests,
        successRate: metrics.successRate,
        avgDurationSec: metrics.avgDurationSec,
        cacheHitRate: metrics.cacheHitRate,
      },
    });
  } catch (e) {
    console.error("[OCR Status Error]", e);
    response.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

/**
 * 触发 PaddleOCR 模型下载
 * POST /ocr/paddle/setup
 */
app.post("/ocr/paddle/setup", async function (_, response) {
  try {
    const { PaddleOCRClient } = require("./utils/OCRLoader/paddleOCRClient");
    const client = new PaddleOCRClient();

    // 检查服务是否可用
    const status = await client.isAvailable();
    if (!status.available) {
      return response.status(503).json({
        success: false,
        error:
          "PaddleOCR 服务未启动。请先运行: cd services/paddleocr-service && ./start.sh",
      });
    }

    if (status.modelsReady) {
      return response.status(200).json({
        success: true,
        message: "模型已就绪，无需重新下载",
      });
    }

    // 触发模型下载
    const result = await client.setupModels();
    response.status(200).json({
      success: true,
      message: "PaddleOCR 模型下载完成！",
      data: result,
    });
  } catch (e) {
    console.error("[PaddleOCR Setup Error]", e);
    response.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

/**
 * 获取 OCR 性能指标
 * GET /ocr/metrics
 */
app.get("/ocr/metrics", async function (_, response) {
  try {
    const { SmartOCRRouter } = require("./utils/OCRLoader/smartOCRRouter");
    const router = new SmartOCRRouter();
    const metrics = router.getPerformanceMetrics();
    const cacheStats = router.getCacheStats();

    response.status(200).json({
      success: true,
      metrics,
      cache: cacheStats,
    });
  } catch (e) {
    console.error("[OCR Metrics Error]", e);
    response.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

/**
 * 清空 OCR 缓存
 * POST /ocr/cache/clear
 */
app.post("/ocr/cache/clear", async function (_, response) {
  try {
    const { SmartOCRRouter } = require("./utils/OCRLoader/smartOCRRouter");
    const router = new SmartOCRRouter();
    router.clearCache();

    response.status(200).json({
      success: true,
      message: "OCR 缓存已清空",
    });
  } catch (e) {
    console.error("[OCR Cache Clear Error]", e);
    response.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

app.all("*", function (_, response) {
  response.sendStatus(200);
});

const PORT = Number(process.env.COLLECTOR_PORT || 8888);
const HOST = resolveServiceHost(process.env, "COLLECTOR_HOST");

const collectorServer = HOST
  ? app.listen(PORT, HOST, async () => {
    await wipeCollectorStorage();
    console.log(
      `Document processor app listening on ${formatListenAddress(HOST, PORT)}`
    );
  })
  : app.listen(PORT, async () => {
    await wipeCollectorStorage();
    console.log(
      `Document processor app listening on ${formatListenAddress(HOST, PORT)}`
    );
  });

collectorServer
  .on("error", function (err) {
    //  JSDoc: f        Collector             
    /**
     *              
     * @param {Error} err        
     */
    console.error("[Collector] Server error:", err);
    process.once("SIGUSR2", function () {
      process.kill(process.pid, "SIGUSR2");
    });
    process.on("SIGINT", function () {
      process.kill(process.pid, "SIGINT");
    });
  });
