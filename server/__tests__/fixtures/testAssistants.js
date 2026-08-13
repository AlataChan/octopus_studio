const KNOWLEDGE_MODE_TEST_ASSISTANTS = {
  workspace: {
    name: "测试助手 - Workspace 模式",
    description: "这是一个测试助手，使用 workspace 知识模式",
    category: "测试",
    knowledgeModeTemplate: "workspace",
  },
  none: {
    name: "测试助手 - None 模式",
    description: "这是一个测试助手，使用 none 知识模式（仅对话+工具）",
    category: "测试",
    knowledgeModeTemplate: "none",
  },
  invalid: {
    name: "测试助手 - 无效模式",
    description: "这应该失败",
    category: "测试",
    knowledgeModeTemplate: "invalid_mode",
  },
};

module.exports = {
  KNOWLEDGE_MODE_TEST_ASSISTANTS,
};
