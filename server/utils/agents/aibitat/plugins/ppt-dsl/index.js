/**
 * PPT DSL Module
 *
 * Phase P0: PPT DSL 定义、校验与工具集
 */

const schema = require("./schema");
const validator = require("./validator");

module.exports = {
  // Schema exports
  ...schema,

  // Validator exports
  ...validator,
};
