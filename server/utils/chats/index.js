const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { resetMemory } = require("./commands/reset");
const { convertToPromptHistory } = require("../helpers/chat/responses");
const { SlashCommandPresets } = require("../../models/slashCommandsPresets");
const { SystemPromptVariables } = require("../../models/systemPromptVariables");
const { DEFAULT_MESSAGE_LIMIT } = require("./config");

const VALID_COMMANDS = {
  "/reset": resetMemory,
};

async function grepCommand(message, user = null) {
  const userPresets = await SlashCommandPresets.getUserPresets(user?.id);
  const availableCommands = Object.keys(VALID_COMMANDS);

  // Check if the message starts with any built-in command
  for (let i = 0; i < availableCommands.length; i++) {
    const cmd = availableCommands[i];
    const re = new RegExp(`^(${cmd})`, "i");
    if (re.test(message)) {
      return cmd;
    }
  }

  // Replace all preset commands with their corresponding prompts
  // Allows multiple commands in one message
  let updatedMessage = message;
  for (const preset of userPresets) {
    const regex = new RegExp(
      `(?:\\b\\s|^)(${preset.command})(?:\\b\\s|$)`,
      "g"
    );
    updatedMessage = updatedMessage.replace(regex, preset.prompt);
  }

  return updatedMessage;
}

/**
 * @description This function will do recursive replacement of all slash commands with their corresponding prompts.
 * @notice This function is used for API calls and is not user-scoped. THIS FUNCTION DOES NOT SUPPORT PRESET COMMANDS.
 * @returns {Promise<string>}
 */
async function grepAllSlashCommands(message) {
  const allPresets = await SlashCommandPresets.where({});

  // Replace all preset commands with their corresponding prompts
  // Allows multiple commands in one message
  let updatedMessage = message;
  for (const preset of allPresets) {
    const regex = new RegExp(
      `(?:\\b\\s|^)(${preset.command})(?:\\b\\s|$)`,
      "g"
    );
    updatedMessage = updatedMessage.replace(regex, preset.prompt);
  }

  return updatedMessage;
}

async function recentChatHistory({
  user = null,
  workspace,
  thread = null,
  messageLimit = DEFAULT_MESSAGE_LIMIT,
  apiSessionId = null,
}) {
  const rawHistory = (
    await WorkspaceChats.where(
      {
        workspaceId: workspace.id,
        user_id: user?.id || null,
        thread_id: thread?.id || null,
        api_session_id: apiSessionId || null,
        include: true,
      },
      messageLimit,
      { id: "desc" }
    )
  ).reverse();
  return { rawHistory, chatHistory: convertToPromptHistory(rawHistory) };
}

/**
 * Returns the base prompt for the chat. This method will also do variable
 * substitution on the prompt if there are any defined variables in the prompt.
 * @param {Object|null} workspace - the workspace object
 * @param {Object|null} user - the user object
 * @returns {Promise<string>} - the base prompt
 */
/**
 * 默认系统提示词
 * 设计原则：
 * 1. 优先使用提供的上下文（知识库内容），上下文与通用知识冲突时以上下文为准
 * 2. 如果没有相关上下文，使用 LLM 的通用知识回答并诚实标注来源
 * 3. 准确、诚实，不编造事实；格式与篇幅随场景校准
 */
const DEFAULT_SYSTEM_PROMPT = `你是 Octopus Studio 的智能助手。今天是 {date}。
你的使命：理解用户的真实意图，必要时澄清，复杂问题分步思考，给出清晰、可信、简洁的回答，并预判合理的下一步。

【信息与上下文】
- 若提供了上下文（知识库/文档检索结果），优先基于上下文作答，并可标注来源。
- 上下文无相关信息时，使用你的通用知识回答；若不确定，明确说明"这是基于通用知识、未经知识库证实"。
- 上下文与通用知识冲突时，以上下文为准并提示差异。

【准确与诚实】
- 不编造事实，不编造来源；引用不确定时宁可不给出处。
- 用户可能基于错误前提提问；不确定时先核实再答。用户指出你出错时，独立核查后再决定是否认同，认错坦诚、不过度道歉。
- 涉及法律/财务/医疗：只提供做决策所需的客观信息并提示自身非专业顾问，不给"应该买/卖"式自信结论。

【沟通与格式】
- 可在内部分步思考，但回答只呈现结论、依据与必要步骤，不展示内部推理过程。
- 默认用自然散文作答；解释/报告类不堆砌项目符号、编号与过度加粗，需要列举时用"包括 x、y、z"。仅当信息确为多维、或用户明确要列表时才用列表。
- 按难度校准篇幅：简单问题几句话；复杂问题先给结论摘要，用户要更深再展开。
- 不以"好问题/很棒"等奉承开头，直接作答；默认不用 emoji；一次最多问一个澄清问题。
- 代码放进代码块并标注语言，文件名/函数名用反引号，公式用 LaTeX。
- 使用与用户提问相同的语言回答。`;

async function chatPrompt(workspace, user = null) {
  const basePrompt = workspace?.openAiPrompt ?? DEFAULT_SYSTEM_PROMPT;
  return await SystemPromptVariables.expandSystemPromptVariables(
    basePrompt,
    user?.id,
    workspace?.id
  );
}

// We use this util function to deduplicate sources from similarity searching
// if the document is already pinned.
// Eg: You pin a csv, if we RAG + full-text that you will get the same data
// points both in the full-text and possibly from RAG - result in bad results
// even if the LLM was not even going to hallucinate.
function sourceIdentifier(sourceDocument) {
  if (!sourceDocument?.title || !sourceDocument?.published) return uuidv4();
  return `title:${sourceDocument.title}-timestamp:${sourceDocument.published}`;
}

module.exports = {
  sourceIdentifier,
  recentChatHistory,
  chatPrompt,
  grepCommand,
  grepAllSlashCommands,
  VALID_COMMANDS,
  DEFAULT_SYSTEM_PROMPT,
};
