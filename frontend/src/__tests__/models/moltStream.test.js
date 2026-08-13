import { beforeEach, describe, expect, it, vi } from "vitest";
import Molt from "@/models/molt";

vi.mock("@/utils/request", () => ({
  baseHeaders: () => ({ Authorization: "Bearer token" }),
}));

const encoder = new TextEncoder();

function streamFrom(parts) {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

describe("Molt stream model", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("emits onChunk once per chunk frame", async () => {
    const onChunk = vi.fn();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: streamFrom([
        'event: chunk\ndata: {"text":"hello","seq":1}\n\n',
        'event: chunk\ndata: {"text":" world","seq":2}\n\n',
        'event: done\ndata: {"chatId":"chat-1","molt_thread_id":"thread-1"}\n\n',
      ]),
    });

    await Molt.streamWorkspaceAgent({
      slug: "demo",
      agentId: "molt-agent-1",
      payload: { message: "hello", scopeKey: "user:1" },
      onChunk,
    });

    expect(onChunk.mock.calls.map(([text]) => text)).toEqual([
      "hello",
      " world",
    ]);
  });

  it("emits onDone with final chat metadata", async () => {
    const onDone = vi.fn();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: streamFrom([
        'event: done\ndata: {"chatId":"chat-1","molt_thread_id":"thread-1"}\n\n',
      ]),
    });

    await expect(
      Molt.streamWorkspaceAgent({
        slug: "demo",
        agentId: "molt-agent-1",
        payload: { message: "hello", scopeKey: "user:1" },
        onDone,
      })
    ).resolves.toEqual({
      success: true,
      chatId: "chat-1",
      molt_thread_id: "thread-1",
    });
    expect(onDone).toHaveBeenCalledWith({
      chatId: "chat-1",
      molt_thread_id: "thread-1",
    });
  });

  it("emits onError for error frames", async () => {
    const onError = vi.fn();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: streamFrom([
        'event: error\ndata: {"code":"thread_stale","message":"Molt thread not found"}\n\n',
      ]),
    });

    await expect(
      Molt.streamWorkspaceAgent({
        slug: "demo",
        agentId: "molt-agent-1",
        payload: { message: "hello", scopeKey: "user:1" },
        onError,
      })
    ).resolves.toEqual({
      success: false,
      code: "thread_stale",
      error: "Molt thread not found",
    });
    expect(onError).toHaveBeenCalledWith({
      code: "thread_stale",
      message: "Molt thread not found",
    });
  });

  it("cancels the reader when AbortController aborts", async () => {
    const cancel = vi.fn();
    const signal = new AbortController().signal;
    const body = {
      getReader: () => ({
        read: vi.fn(async () => {
          signal.dispatchEvent(new Event("abort"));
          return { done: true };
        }),
        cancel,
      }),
    };
    global.fetch.mockResolvedValueOnce({ ok: true, body });

    await Molt.streamWorkspaceAgent({
      slug: "demo",
      agentId: "molt-agent-1",
      payload: { message: "hello", scopeKey: "user:1" },
      signal,
    });

    expect(cancel).toHaveBeenCalled();
  });

  it("falls back to REST chat when streaming reader is unavailable", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, body: null })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({
          success: true,
          reply: "REST reply",
          chatId: "chat-1",
          molt_thread_id: "thread-1",
        })),
      });

    await expect(
      Molt.streamWorkspaceAgent({
        slug: "demo",
        agentId: "molt-agent-1",
        payload: { message: "hello", scopeKey: "user:1" },
      })
    ).resolves.toEqual({
      success: true,
      reply: "REST reply",
      chatId: "chat-1",
      molt_thread_id: "thread-1",
    });

    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/workspace/demo/molt-agents/molt-agent-1/chat/stream",
      "/api/workspace/demo/molt-agents/molt-agent-1/chat",
    ]);
  });

  it("buffers incomplete frames across network chunks", async () => {
    const onChunk = vi.fn();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: streamFrom([
        'event: chunk\ndata: {"text":"hel',
        'lo","seq":1}\n\n',
        'event: done\ndata: {"chatId":"chat-1","molt_thread_id":"thread-1"}\n\n',
      ]),
    });

    await Molt.streamWorkspaceAgent({
      slug: "demo",
      agentId: "molt-agent-1",
      payload: { message: "hello", scopeKey: "user:1" },
      onChunk,
    });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith("hello", { text: "hello", seq: 1 });
  });
});
