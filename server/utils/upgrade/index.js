/**
 * 升级系统入口
 * @module upgrade
 */

const { UpgradeManager, DATA_VERSION_KEY } = require("./UpgradeManager");

/**
 * 执行升级检查和迁移
 * 这是主入口函数，在服务启动时调用
 *
 * @returns {Promise<{upgraded: boolean, from?: string, to?: string}>}
 */
async function runUpgrade() {
  const manager = new UpgradeManager();
  return manager.run();
}

module.exports = {
  UpgradeManager,
  DATA_VERSION_KEY,
  runUpgrade,
};
