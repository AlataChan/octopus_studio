"use strict";

// Mock getLLMProvider before requiring the module under test
const mockGetChatCompletion = jest.fn();
const mockGetLLMProvider = jest.fn().mockReturnValue({
  getChatCompletion: mockGetChatCompletion,
});

jest.mock("../../../../utils/helpers", () => ({
  getLLMProvider: mockGetLLMProvider,
}));

const {
  buildWorkspaceGenerateText,
} = require("../../../../utils/agents/orchestration/workspaceGenerateText");

const WORKSPACE = {
  agentProvider: "openai",
  agentModel: "gpt-4o",
  chatProvider: "anthropic",
  chatModel: "claude-3",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetChatCompletion.mockResolvedValue({ textResponse: "response text" });
  mockGetLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });
});

// ─── T1: non-jsonMode path (default) — no response_format ───────────────────
describe("buildWorkspaceGenerateText — non-jsonMode path", () => {
  test("jsonMode absent: calls getChatCompletion WITHOUT response_format key", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ system: "sys", prompt: "hello" });

    expect(mockGetChatCompletion).toHaveBeenCalledTimes(1);
    const [_messages, options] = mockGetChatCompletion.mock.calls[0];
    expect(options).not.toHaveProperty("response_format");
    expect(options.temperature).toBe(0);
  });

  test("jsonMode false: calls getChatCompletion WITHOUT response_format key", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ system: "sys", prompt: "hello", jsonMode: false });

    expect(mockGetChatCompletion).toHaveBeenCalledTimes(1);
    const [_messages, options] = mockGetChatCompletion.mock.calls[0];
    expect(options).not.toHaveProperty("response_format");
  });

  test("non-jsonMode returns textResponse from provider", async () => {
    mockGetChatCompletion.mockResolvedValueOnce({ textResponse: "plain text" });
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    const result = await generateText({ prompt: "hello" });
    expect(result).toBe("plain text");
  });

  test("non-jsonMode: messages built correctly with system and prompt", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ system: "my system", prompt: "my prompt" });

    const [messages] = mockGetChatCompletion.mock.calls[0];
    expect(messages).toEqual([
      { role: "system", content: "my system" },
      { role: "user", content: "my prompt" },
    ]);
  });

  test("non-jsonMode: omitted system → only user message", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ prompt: "only prompt" });

    const [messages] = mockGetChatCompletion.mock.calls[0];
    expect(messages).toEqual([{ role: "user", content: "only prompt" }]);
  });
});

// ─── T2: jsonMode:true path — response_format injected ──────────────────────
describe("buildWorkspaceGenerateText — jsonMode:true path", () => {
  test("jsonMode true: passes response_format: { type: 'json_object' } in options", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ system: "sys", prompt: "give me json", jsonMode: true });

    expect(mockGetChatCompletion).toHaveBeenCalledTimes(1);
    const [_messages, options] = mockGetChatCompletion.mock.calls[0];
    expect(options).toHaveProperty("response_format");
    expect(options.response_format).toEqual({ type: "json_object" });
  });

  test("jsonMode true: still passes temperature: 0", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ prompt: "json please", jsonMode: true });

    const [_messages, options] = mockGetChatCompletion.mock.calls[0];
    expect(options.temperature).toBe(0);
    expect(options.response_format).toEqual({ type: "json_object" });
  });

  test("jsonMode true: returns textResponse correctly", async () => {
    mockGetChatCompletion.mockResolvedValueOnce({ textResponse: '{"ok":true}' });
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    const result = await generateText({ prompt: "json", jsonMode: true });
    expect(result).toBe('{"ok":true}');
  });

  test("jsonMode true: messages still built the same (system + user)", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ system: "sys", prompt: "json prompt", jsonMode: true });

    const [messages] = mockGetChatCompletion.mock.calls[0];
    expect(messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "json prompt" },
    ]);
  });

  test("jsonMode true: provider resolved correctly from workspace", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ prompt: "json", jsonMode: true });

    expect(mockGetLLMProvider).toHaveBeenCalledWith({
      provider: WORKSPACE.agentProvider,
      model: WORKSPACE.agentModel,
    });
  });
});

// ─── T3: byte-identical non-jsonMode options ─────────────────────────────────
describe("buildWorkspaceGenerateText — options byte-identical for non-jsonMode", () => {
  test("options object is { temperature: 0 } exactly when jsonMode is absent", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ prompt: "test" });

    const [_messages, options] = mockGetChatCompletion.mock.calls[0];
    expect(options).toEqual({ temperature: 0 });
  });

  test("options object is { temperature: 0 } exactly when jsonMode is false", async () => {
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await generateText({ prompt: "test", jsonMode: false });

    const [_messages, options] = mockGetChatCompletion.mock.calls[0];
    expect(options).toEqual({ temperature: 0 });
  });
});

// ─── T4: provider error does not crash when response_format is unsupported ───
describe("buildWorkspaceGenerateText — best-effort: provider error propagates normally", () => {
  test("if provider throws, the error propagates (no swallowing)", async () => {
    mockGetChatCompletion.mockRejectedValueOnce(new Error("provider_error"));
    const generateText = buildWorkspaceGenerateText({ workspace: WORKSPACE });
    await expect(generateText({ prompt: "x", jsonMode: true })).rejects.toThrow("provider_error");
  });
});
