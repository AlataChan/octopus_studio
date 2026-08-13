import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * OCR 模块 API 封装
 */
const OCR = {
  /**
   * 获取 OCR 引擎状态
   * @returns {Promise<Object>} - 引擎状态
   */
  getStatus: async function () {
    return await fetch(`${API_BASE}/system/ocr/status`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Failed to get OCR status:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 触发 PaddleOCR 模型下载
   * @returns {Promise<Object>} - 下载结果
   */
  setupPaddleOCR: async function () {
    return await fetch(`${API_BASE}/system/ocr/paddle/setup`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Failed to setup PaddleOCR:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 获取 OCR 性能指标
   * @returns {Promise<Object>} - 性能指标
   */
  getMetrics: async function () {
    return await fetch(`${API_BASE}/system/ocr/metrics`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Failed to get OCR metrics:", e);
        return { success: false, error: e.message };
      });
  },

  /**
   * 清空 OCR 缓存
   * @returns {Promise<Object>} - 操作结果
   */
  clearCache: async function () {
    return await fetch(`${API_BASE}/system/ocr/cache/clear`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Failed to clear OCR cache:", e);
        return { success: false, error: e.message };
      });
  },
};

export default OCR;
