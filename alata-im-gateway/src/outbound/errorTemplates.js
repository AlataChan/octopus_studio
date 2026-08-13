const ERROR_TEMPLATES = {
  NO_ROUTE: {
    zh: "暂未配置此对话的 AI 服务，请联系管理员",
    en: "No AI service configured for this conversation",
  },
  PERMISSION_DENIED: {
    zh: "您暂无权限使用此功能",
    en: "You don't have permission for this action",
  },
  COMMAND_BLOCKED: {
    zh: "此命令在当前渠道不可用",
    en: "This command is not available in this channel",
  },
  AGENT_TIMEOUT: {
    zh: "处理超时，请稍后再试",
    en: "Processing timed out, please try again later",
  },
  AGENT_ERROR: {
    zh: "处理过程中遇到问题，请稍后再试",
    en: "An error occurred, please try again later",
  },
  RATE_LIMITED: {
    zh: "消息发送过于频繁，请稍后再试",
    en: "Too many messages, please slow down",
  },
  MESSAGE_TOO_LONG: {
    zh: "消息过长，请精简后重试（最多 4000 字符）",
    en: "Message too long, please shorten and retry (max 4000 chars)",
  },
};

module.exports = { ERROR_TEMPLATES };

