const { BaseSkill } = require("../BaseSkill");
const { SkillCategory } = require("../constants");

class CodeExecutionSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:code-execution",
      name: "Code execution",
      description:
        "Read, edit, search, patch, and run approved shell commands in a workspace sandbox.",
      version: "1.0.0",
      category: SkillCategory.CODE,
      tags: ["code", "files", "shell", "grep", "patch"],
      icon: "</>",
    });
  }

  getSystemPrompt() {
    return [
      "You can work inside the workspace code sandbox using code_* tools.",
      "Read and grep before editing. Keep edits small and produce a patch summary when done.",
      "Shell commands are high risk and require approval unless the user explicitly grants full authorization.",
      "Never attempt to access files outside the sandbox root.",
    ].join("\n");
  }

  getToolBindings() {
    return [
      { toolName: "code_read", riskLevel: "safe-read", autoApproved: true },
      { toolName: "code_grep", riskLevel: "safe-read", autoApproved: true },
      { toolName: "code_patch", riskLevel: "safe-read", autoApproved: true },
      { toolName: "code_write", riskLevel: "write", autoApproved: false },
      { toolName: "code_edit", riskLevel: "write", autoApproved: false },
      { toolName: "code_shell", riskLevel: "execute", autoApproved: false },
    ];
  }
}

module.exports = { CodeExecutionSkill };
