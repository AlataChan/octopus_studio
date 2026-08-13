/**
 * PaddleOCR Node.js 客户端
 * 连接 PaddleOCR FastAPI 服务，提供高精度 OCR 能力
 *
 * @module PaddleOCRClient
 */

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

/**
 * PaddleOCR 客户端类
 * 用于与 PaddleOCR FastAPI 服务通信
 */
class PaddleOCRClient {
  /**
   * 创建 PaddleOCR 客户端实例
   * @param {string} [baseURL='http://127.0.0.1:8866'] - 服务地址
   * @param {Object} [options={}] - 配置选项
   * @param {number} [options.timeout=60000] - 默认超时时间（毫秒）
   */
  constructor(baseURL = "http://127.0.0.1:8866", options = {}) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: options.timeout || 60000,
    });
    this.modelsReady = false;
  }

  /**
   * 检查 PaddleOCR 服务是否可用
   * @returns {Promise<{available: boolean, modelsReady: boolean, message: string}>}
   */
  async isAvailable() {
    try {
      const response = await this.client.get("/health", { timeout: 5000 });
      this.modelsReady = response.data.models_ready;
      return {
        available: response.data.status === "ok",
        modelsReady: this.modelsReady,
        message: response.data.message,
      };
    } catch (error) {
      return {
        available: false,
        modelsReady: false,
        message: `Service not reachable: ${error.message}`,
      };
    }
  }

  /**
   * ⭐ 触发模型下载（用户明确需要时调用）
   * 首次调用会下载约 400MB 模型文件
   * @param {Object} [options={}] - 选项
   * @param {number} [options.timeout=300000] - 超时时间（默认 5 分钟）
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setupModels(options = {}) {
    const timeout = options.timeout || 300000; // 5 分钟超时
    try {
      console.log("📦 Downloading PaddleOCR models (~400MB)...");
      console.log("   This may take several minutes on first run...");

      const response = await this.client.post("/setup", {}, { timeout });
      this.modelsReady = response.data.success;

      if (this.modelsReady) {
        console.log("✅ PaddleOCR models ready!");
      }

      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message;
      console.error(`❌ Failed to setup PaddleOCR models: ${errorMsg}`);
      throw new Error(`PaddleOCR setup failed: ${errorMsg}`);
    }
  }

  /**
   * 执行 OCR 识别
   * @param {string|Buffer} input - 图像路径或 Buffer
   * @param {Object} [options={}] - 选项
   * @param {number} [options.retries=2] - 重试次数
   * @param {number} [options.timeout=30000] - 超时时间（毫秒）
   * @param {boolean} [options.includeLayout=false] - 是否返回布局信息（坐标）
   * @returns {Promise<{success: boolean, text: string, lines: string[], line_count: number, duration: number, blocks?: Array}>}
   */
  async ocr(input, options = {}) {
    const retries = options.retries ?? 2;
    const timeout = options.timeout ?? 30000;

    // 检查模型是否就绪
    if (!this.modelsReady) {
      const status = await this.isAvailable();
      if (!status.available) {
        throw new Error(
          "PaddleOCR service not available. Start with: ./services/paddleocr-service/start.sh"
        );
      }
      if (!status.modelsReady) {
        throw new Error(
          "PaddleOCR models not ready. Call setupModels() first or POST /setup to download models."
        );
      }
    }

    let lastError;

    // 重试逻辑
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const formData = new FormData();

        if (typeof input === "string") {
          // 文件路径
          if (!fs.existsSync(input)) {
            throw new Error(`File not found: ${input}`);
          }
          formData.append("file", fs.createReadStream(input), {
            filename: path.basename(input),
          });
        } else if (Buffer.isBuffer(input)) {
          // Buffer
          formData.append("file", input, { filename: "image.png" });
        } else {
          throw new Error("Input must be a file path or Buffer");
        }

        const response = await this.client.post("/ocr", formData, {
          headers: formData.getHeaders(),
          timeout,
        });

        if (response.data.success) {
          return response.data;
        }

        throw new Error(response.data.error || "Unknown OCR error");
      } catch (error) {
        lastError = error;

        if (attempt < retries) {
          const waitTime = (attempt + 1) * 1000;
          console.warn(
            `⚠️ PaddleOCR attempt ${attempt + 1}/${retries + 1} failed: ${
              error.message
            }`
          );
          console.warn(`   Retrying in ${waitTime / 1000}s...`);
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    console.error(`❌ PaddleOCR failed after ${retries + 1} attempts`);
    throw lastError;
  }

  /**
   * 执行 OCR 识别并返回布局信息
   * 用于 Canvas 场景，需要知道每个文本块的位置
   * @param {string|Buffer} input - 图像路径或 Buffer
   * @param {Object} [options={}] - 选项
   * @param {number} [options.retries=2] - 重试次数
   * @param {number} [options.timeout=30000] - 超时时间（毫秒）
   * @returns {Promise<{success: boolean, text: string, blocks: Array<{text: string, confidence: number, bbox: {x: number, y: number, width: number, height: number}, polygon: Array<[number, number]>}>}>}
   */
  async ocrWithLayout(input, options = {}) {
    const retries = options.retries ?? 2;
    const timeout = options.timeout ?? 30000;

    // 检查模型是否就绪
    if (!this.modelsReady) {
      const status = await this.isAvailable();
      if (!status.available) {
        throw new Error(
          "PaddleOCR service not available. Start with: ./services/paddleocr-service/start.sh"
        );
      }
      if (!status.modelsReady) {
        throw new Error(
          "PaddleOCR models not ready. Call setupModels() first or POST /setup to download models."
        );
      }
    }

    let lastError;

    // 重试逻辑
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const formData = new FormData();

        if (typeof input === "string") {
          // 文件路径
          if (!fs.existsSync(input)) {
            throw new Error(`File not found: ${input}`);
          }
          formData.append("file", fs.createReadStream(input), {
            filename: path.basename(input),
          });
        } else if (Buffer.isBuffer(input)) {
          // Buffer
          formData.append("file", input, { filename: "image.png" });
        } else {
          throw new Error("Input must be a file path or Buffer");
        }

        // 使用 /ocr/layout 端点获取带坐标的结果
        // 如果服务端没有专门的端点，使用普通 /ocr 端点并解析结果
        const response = await this.client.post("/ocr", formData, {
          headers: formData.getHeaders(),
          timeout,
          params: { include_layout: true },
        });

        if (response.data.success) {
          // 标准化布局结果
          const blocks = this._normalizeLayoutBlocks(response.data);
          return {
            success: true,
            text: response.data.text,
            blocks,
            lineCount: response.data.line_count,
            duration: response.data.duration,
          };
        }

        throw new Error(response.data.error || "Unknown OCR error");
      } catch (error) {
        lastError = error;

        if (attempt < retries) {
          const waitTime = (attempt + 1) * 1000;
          console.warn(
            `⚠️ PaddleOCR layout attempt ${attempt + 1}/${
              retries + 1
            } failed: ${error.message}`
          );
          console.warn(`   Retrying in ${waitTime / 1000}s...`);
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    console.error(`❌ PaddleOCR layout failed after ${retries + 1} attempts`);
    throw lastError;
  }

  /**
   * 标准化布局块结果
   * PaddleOCR 返回的原始格式可能因版本而异，此方法统一格式
   * @private
   * @param {Object} data - OCR 响应数据
   * @returns {Array<{text: string, confidence: number, bbox: Object, polygon: Array}>}
   */
  _normalizeLayoutBlocks(data) {
    const blocks = [];

    // PaddleOCR 通常返回 data.result 或 data.blocks
    const rawBlocks = data.blocks || data.result || [];

    for (const block of rawBlocks) {
      // 处理不同的格式
      let text, confidence, polygon;

      if (Array.isArray(block)) {
        // 格式: [[polygon], [text, confidence]]
        polygon = block[0];
        text = block[1]?.[0] || "";
        confidence = block[1]?.[1] || 0;
      } else if (typeof block === "object") {
        // 格式: { text, confidence, box/polygon/bbox }
        text = block.text || block.words || "";
        confidence = block.confidence || block.score || 0;
        polygon = block.polygon || block.box || block.bbox || [];
      } else {
        continue;
      }

      // 将 polygon 转换为标准 bbox
      const bbox = this._polygonToBbox(polygon);

      blocks.push({
        text: String(text).trim(),
        confidence: Number(confidence),
        bbox,
        polygon: this._normalizePolygon(polygon),
      });
    }

    // 如果没有获取到 blocks，尝试从 lines 构建（降级方案）
    if (blocks.length === 0 && data.lines && Array.isArray(data.lines)) {
      // 简单处理：每行作为一个块，没有精确坐标
      data.lines.forEach((line, index) => {
        blocks.push({
          text: String(line).trim(),
          confidence: 0.9, // 默认置信度
          bbox: { x: 0, y: index * 30, width: 0, height: 30 }, // 占位坐标
          polygon: [],
        });
      });
    }

    return blocks;
  }

  /**
   * 将多边形转换为边界框
   * @private
   * @param {Array} polygon - 多边形点数组
   * @returns {{x: number, y: number, width: number, height: number}}
   */
  _polygonToBbox(polygon) {
    if (!polygon || polygon.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // 支持 [[x1,y1], [x2,y2], ...] 或 [x1, y1, x2, y2, ...] 格式
    let points = [];
    if (Array.isArray(polygon[0])) {
      points = polygon;
    } else {
      // 扁平数组转换为点对
      for (let i = 0; i < polygon.length; i += 2) {
        points.push([polygon[i], polygon[i + 1]]);
      }
    }

    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 标准化多边形格式
   * @private
   * @param {Array} polygon - 原始多边形
   * @returns {Array<[number, number]>} 标准化的点数组
   */
  _normalizePolygon(polygon) {
    if (!polygon || polygon.length === 0) {
      return [];
    }

    // 已经是 [[x, y], ...] 格式
    if (Array.isArray(polygon[0])) {
      return polygon.map((p) => [Number(p[0]), Number(p[1])]);
    }

    // 扁平数组 [x1, y1, x2, y2, ...]
    const points = [];
    for (let i = 0; i < polygon.length; i += 2) {
      points.push([Number(polygon[i]), Number(polygon[i + 1])]);
    }
    return points;
  }
}

module.exports = { PaddleOCRClient };
