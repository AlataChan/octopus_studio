/**
 * 版本感知的自动升级管理器
 * 在服务启动时自动检测并执行必要的数据升级
 *
 * @module UpgradeManager
 */

const path = require("path");
const fs = require("fs");
const { SystemSettings } = require("../../models/systemSettings");

// 数据版本存储的 key
const DATA_VERSION_KEY = "data_version";

/**
 * 升级管理器类
 * 负责检测版本变化并执行相应的升级脚本
 */
class UpgradeManager {
  constructor() {
    this.migrationsDir = path.join(__dirname, "migrations");
    this.packageVersion = this._getPackageVersion();
  }

  /**
   * 获取 package.json 中的版本号
   * @returns {string} 版本号
   * @private
   */
  _getPackageVersion() {
    try {
      const packageJson = require("../../../package.json");
      return packageJson.version || "1.0.0";
    } catch (error) {
      console.warn("⚠️ 无法读取 package.json 版本，使用默认版本 1.0.0");
      return "1.0.0";
    }
  }

  /**
   * 获取当前数据版本
   * @returns {Promise<string|null>} 数据版本或 null（首次安装）
   */
  async getDataVersion() {
    const setting = await SystemSettings.get({ label: DATA_VERSION_KEY });
    return setting?.value || null;
  }

  /**
   * 设置数据版本
   * @param {string} version - 版本号
   */
  async setDataVersion(version) {
    await SystemSettings.updateSettings({ [DATA_VERSION_KEY]: version });
    console.log(`📝 数据版本已更新为: ${version}`);
  }

  /**
   * 比较版本号
   * @param {string} v1 - 版本 1
   * @param {string} v2 - 版本 2
   * @returns {number} -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  /**
   * 获取所有可用的迁移脚本
   * @returns {Array<{version: string, path: string}>} 迁移脚本列表
   */
  getMigrations() {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir);
    const migrations = files
      .filter((f) => f.endsWith(".js") && f.startsWith("v"))
      .map((f) => {
        // 文件名格式: v1.0.0.js 或 v1.0.0_description.js
        const match = f.match(/^v(\d+\.\d+\.\d+)/);
        return match
          ? { version: match[1], path: path.join(this.migrationsDir, f) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => this.compareVersions(a.version, b.version));

    return migrations;
  }

  /**
   * 执行升级检查和迁移
   * @returns {Promise<{upgraded: boolean, from?: string, to?: string}>}
   */
  async run() {
    console.log("\n🔄 正在检查系统升级...");

    const dataVersion = await this.getDataVersion();
    const codeVersion = this.packageVersion;

    console.log(`   代码版本: ${codeVersion}`);
    console.log(`   数据版本: ${dataVersion || "(首次安装)"}`);

    // 首次安装：直接设置版本，运行初始化
    if (!dataVersion) {
      console.log("📦 检测到首次安装，正在初始化数据...");
      await this._runInitialSetup();
      await this.setDataVersion(codeVersion);
      console.log("✅ 首次安装初始化完成\n");
      return { upgraded: true, from: null, to: codeVersion };
    }

    // 版本相同：无需升级
    if (this.compareVersions(dataVersion, codeVersion) === 0) {
      console.log("✅ 系统已是最新版本，无需升级\n");
      return { upgraded: false };
    }

    // 版本降级警告
    if (this.compareVersions(dataVersion, codeVersion) > 0) {
      console.warn(
        `⚠️ 警告：数据版本(${dataVersion})高于代码版本(${codeVersion})，可能是版本回退`
      );
      console.log("   跳过升级，但服务将继续启动\n");
      return { upgraded: false };
    }

    // 执行升级
    console.log(`🚀 正在从 ${dataVersion} 升级到 ${codeVersion}...`);
    await this._runMigrations(dataVersion, codeVersion);
    await this.setDataVersion(codeVersion);
    console.log(`✅ 升级完成: ${dataVersion} → ${codeVersion}\n`);

    return { upgraded: true, from: dataVersion, to: codeVersion };
  }

  /**
   * 执行首次安装初始化
   * @private
   */
  async _runInitialSetup() {
    try {
      const {
        reseedWorkAgentAssistants,
      } = require("../workAgent/runtimeSeed");
      const result = await reseedWorkAgentAssistants();
      const seedResult = result?.result || {};
      console.log(
        `   📋 已初始化默认 AI 助手模板: 新增 ${seedResult.created || 0}, 更新 ${seedResult.updated || 0}, 跳过 ${seedResult.skipped || 0}`
      );
    } catch (error) {
      console.error("   ❌ 初始化默认 AI 助手模板失败:", error.message);
      // 不抛出错误，允许服务继续启动
    }
  }

  /**
   * 执行版本迁移
   * @param {string} fromVersion - 起始版本
   * @param {string} toVersion - 目标版本
   * @private
   */
  async _runMigrations(fromVersion, toVersion) {
    const migrations = this.getMigrations();

    // 筛选需要执行的迁移（fromVersion < migration.version <= toVersion）
    const toRun = migrations.filter(
      (m) =>
        this.compareVersions(m.version, fromVersion) > 0 &&
        this.compareVersions(m.version, toVersion) <= 0
    );

    if (toRun.length === 0) {
      console.log("   📋 没有需要执行的迁移脚本");
      // 即使没有迁移脚本，也同步内置员工
      await this._syncBuiltinData();
      return;
    }

    console.log(`   📋 发现 ${toRun.length} 个迁移脚本需要执行`);

    for (const migration of toRun) {
      console.log(`   ⏳ 正在执行迁移: v${migration.version}...`);
      try {
        const migrationModule = require(migration.path);
        if (typeof migrationModule.up === "function") {
          await migrationModule.up();
          console.log(`   ✅ 迁移 v${migration.version} 完成`);
        } else {
          console.warn(`   ⚠️ 迁移 v${migration.version} 没有 up() 方法，跳过`);
        }
      } catch (error) {
        console.error(`   ❌ 迁移 v${migration.version} 失败:`, error.message);
        // 记录但不中断，让其他迁移继续
      }
    }

    // 每次升级都同步内置数据
    await this._syncBuiltinData();
  }

  /**
   * 同步内置数据（AI 员工等）
   * @private
   */
  async _syncBuiltinData() {
    try {
      const {
        reseedWorkAgentAssistants,
      } = require("../workAgent/runtimeSeed");
      const result = await reseedWorkAgentAssistants();
      const seedResult = result?.result || {};
      console.log(
        `   📋 默认 AI 助手模板同步完成: 新增 ${seedResult.created || 0}, 更新 ${seedResult.updated || 0}, 跳过 ${seedResult.skipped || 0}`
      );
    } catch (error) {
      console.error("   ❌ 同步默认 AI 助手模板失败:", error.message);
    }
  }
}

module.exports = { UpgradeManager, DATA_VERSION_KEY };
