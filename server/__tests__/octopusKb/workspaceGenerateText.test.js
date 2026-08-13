"use strict";

/**
 * Unit tests for buildWorkspaceGenerateText.
 * All LLM calls are mocked — no real model invocations.
 */

jest.mock("../../utils/helpers", () => ({
  getLLMProvider: jest.fn(),
}));

const { getLLMProvider } = require("../../utils/helpers");
const {
  buildWorkspaceGenerateText,
} = require("../../utils/agents/orchestration/workspaceGenerateText");

describe("buildWorkspaceGenerateText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls getChatCompletion with system + user messages and returns textResponse", async () => {
    const mockGetChatCompletion = jest
      .fn()
      .mockResolvedValue({ textResponse: "Hello from LLM" });
    getLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });

    const workspace = {
      agentProvider: "openai",
      agentModel: "gpt-4o",
      chatProvider: "anthropic",
      chatModel: "claude-3",
    };
    const generateText = buildWorkspaceGenerateText({ workspace });

    const result = await generateText({
      system: "You are helpful",
      prompt: "Hello",
    });

    expect(getLLMProvider).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-4o",
    });
    expect(mockGetChatCompletion).toHaveBeenCalledWith(
      [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ],
      { temperature: 0 }
    );
    expect(result).toBe("Hello from LLM");
  });

  it("falls back to chatProvider/chatModel when agentProvider/agentModel are absent", async () => {
    const mockGetChatCompletion = jest
      .fn()
      .mockResolvedValue({ textResponse: "Fallback response" });
    getLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });

    const workspace = { chatProvider: "anthropic", chatModel: "claude-3" };
    const generateText = buildWorkspaceGenerateText({ workspace });

    const result = await generateText({ prompt: "No system" });

    expect(getLLMProvider).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-3",
    });
    expect(mockGetChatCompletion).toHaveBeenCalledWith(
      [{ role: "user", content: "No system" }],
      { temperature: 0 }
    );
    expect(result).toBe("Fallback response");
  });

  it("omits system message when system is not provided", async () => {
    const mockGetChatCompletion = jest
      .fn()
      .mockResolvedValue({ textResponse: "No system" });
    getLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });

    const workspace = { chatProvider: "openai", chatModel: "gpt-4" };
    const generateText = buildWorkspaceGenerateText({ workspace });

    await generateText({ prompt: "Just a prompt" });

    const [messages] = mockGetChatCompletion.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Just a prompt");
  });

  it("falls back to system default (null provider/model) when workspace has no provider fields", async () => {
    const mockGetChatCompletion = jest
      .fn()
      .mockResolvedValue({ textResponse: "Default provider response" });
    getLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });

    const workspace = {}; // no provider/model fields
    const generateText = buildWorkspaceGenerateText({ workspace });

    const result = await generateText({ prompt: "Default?" });

    expect(getLLMProvider).toHaveBeenCalledWith({
      provider: null,
      model: null,
    });
    expect(result).toBe("Default provider response");
  });

  it("returns empty string when textResponse is null", async () => {
    const mockGetChatCompletion = jest
      .fn()
      .mockResolvedValue({ textResponse: null });
    getLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });

    const workspace = { chatProvider: "openai", chatModel: "gpt-4" };
    const generateText = buildWorkspaceGenerateText({ workspace });

    const result = await generateText({ prompt: "What?" });

    expect(result).toBe("");
  });

  it("propagates errors from getChatCompletion", async () => {
    const mockGetChatCompletion = jest
      .fn()
      .mockRejectedValue(new Error("Provider error"));
    getLLMProvider.mockReturnValue({ getChatCompletion: mockGetChatCompletion });

    const workspace = { chatProvider: "openai", chatModel: "gpt-4" };
    const generateText = buildWorkspaceGenerateText({ workspace });

    await expect(generateText({ prompt: "Fail" })).rejects.toThrow(
      "Provider error"
    );
  });
});
