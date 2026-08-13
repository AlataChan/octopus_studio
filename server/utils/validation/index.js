/**
 * @fileoverview 验证模块入口
 * 导出所有验证 Schema 和中间件
 */

const schemas = require("./schemas");
const { validate, isValidUUID } = require("./middleware");

module.exports = {
  schemas,
  validate,
  isValidUUID,
};
