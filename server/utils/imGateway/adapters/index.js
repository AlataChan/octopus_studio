const { FeishuAdapter } = require("./FeishuAdapter");
const { WeComAdapter } = require("./WeComAdapter");

function createAdapter({ provider, account, secrets }) {
  const normalized = String(provider || "").toLowerCase();

  if (normalized === "feishu") {
    return new FeishuAdapter({ account, secrets });
  }

  if (normalized === "wecom") {
    return new WeComAdapter({ account, secrets });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

module.exports = {
  createAdapter,
};
