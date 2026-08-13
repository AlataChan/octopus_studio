/**
 * BaseImageProvider - 图像生成 Provider 基类
 *
 * 所有图像 Provider 应继承此类并实现相应方法
 */

class BaseImageProvider {
  constructor() {
    this.name = "base";
    this.displayName = "Base Provider";

    /**
     * 能力声明
     * @type {Object}
     */
    this.capabilities = {
      t2i: false, // text-to-image
      i2i: false, // image-to-image
      inpaint: false, // 图像修复
      outpaint: false, // 扩展图像
      removeBackground: false, // 背景移除
      upscale: false, // 超分辨率
    };

    /**
     * 支持的模型列表
     * @type {Array<{id: string, name: string, default?: boolean}>}
     */
    this.supportedModels = [];
  }

  /**
   * 静态方法：检查 Provider 是否可用（基于环境变量）
   * 子类必须重写此方法
   * @returns {boolean}
   */
  static isAvailable() {
    return false;
  }

  /**
   * 实例方法：健康检查
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return false;
  }

  /**
   * 获取配额信息（可选实现）
   * @returns {Promise<{remaining: number, total: number}|null>}
   */
  async getQuota() {
    return null;
  }

  /**
   * 文生图
   * @param {Object} request - 生成请求
   * @param {string} request.prompt - 提示词
   * @param {string} [request.negativePrompt] - 负面提示词
   * @param {number} [request.width=1024] - 宽度
   * @param {number} [request.height=1024] - 高度
   * @param {number} [request.seed] - 随机种子
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>}
   */
  async generate(request, options = {}) {
    throw new Error("Method not implemented: generate");
  }

  /**
   * 图生图
   * @param {Object} request - 生成请求
   * @param {Buffer|string} request.inputImage - 输入图像
   * @param {string} request.prompt - 提示词
   * @param {number} [request.strength=0.7] - 变化强度 (0-1)
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>}
   */
  async imageToImage(request, options = {}) {
    throw new Error("Method not implemented: imageToImage");
  }

  /**
   * 图像修复（Inpaint）
   * @param {Object} request - 修复请求
   * @param {Buffer|string} request.inputImage - 输入图像
   * @param {Buffer|string} request.mask - 蒙版（白色为编辑区）
   * @param {string} request.prompt - 提示词
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>}
   */
  async inpaint(request, options = {}) {
    throw new Error("Method not implemented: inpaint");
  }

  /**
   * 图像扩展（Outpaint）
   * @param {Object} request - 扩展请求
   * @param {Buffer|string} request.inputImage - 输入图像
   * @param {number} request.expandLeft - 左侧扩展像素
   * @param {number} request.expandRight - 右侧扩展像素
   * @param {number} request.expandTop - 顶部扩展像素
   * @param {number} request.expandBottom - 底部扩展像素
   * @param {string} [request.prompt] - 提示词
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>}
   */
  async outpaint(request, options = {}) {
    throw new Error("Method not implemented: outpaint");
  }

  /**
   * 背景移除
   * @param {Object} request - 请求
   * @param {Buffer|string} request.inputImage - 输入图像
   * @param {string} [request.outputFormat='png'] - 输出格式
   * @returns {Promise<Object>}
   */
  async removeBackground(request) {
    throw new Error("Method not implemented: removeBackground");
  }

  /**
   * 超分辨率
   * @param {Object} request - 请求
   * @param {Buffer|string} request.inputImage - 输入图像
   * @param {number} [request.scale=2] - 放大倍数
   * @returns {Promise<Object>}
   */
  async upscale(request) {
    throw new Error("Method not implemented: upscale");
  }

  /**
   * 日志输出
   * @param {string} text
   * @param  {...any} args
   */
  log(text, ...args) {
    console.log(`\x1b[36m[${this.name}]\x1b[0m ${text}`, ...args);
  }
}

module.exports = { BaseImageProvider };
