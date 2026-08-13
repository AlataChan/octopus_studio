import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AttachmentManager from "@/components/WorkspaceChat/ChatContainer/PromptInput/Attachments";
import handleChat from "@/utils/chat";
import {
  MAX_VIDEO_ATTACHMENT_BYTES,
  isChatAttachmentFile,
  validateChatAttachmentFile,
  videoUnderstandingErrorMessage,
} from "@/utils/chat/videoAttachments";

function fileLike(name, type, size = 1024) {
  return { name, type, size };
}

describe("video chat attachments", () => {
  it("accepts supported video mime types as chat attachments", () => {
    expect(isChatAttachmentFile(fileLike("clip.mp4", "video/mp4"))).toBe(true);
    expect(isChatAttachmentFile(fileLike("clip.mov", "video/quicktime"))).toBe(
      true
    );
    expect(isChatAttachmentFile(fileLike("clip.webm", "video/webm"))).toBe(
      true
    );
  });

  it("rejects oversized video attachments before upload", () => {
    const result = validateChatAttachmentFile(
      fileLike("huge.mp4", "video/mp4", MAX_VIDEO_ATTACHMENT_BYTES + 1)
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("100MB");
  });

  it("renders video attachments with a placeholder chip instead of an image preview", () => {
    const markup = renderToStaticMarkup(
      <AttachmentManager
        attachments={[
          {
            uid: "video-1",
            file: fileLike("demo.mp4", "video/mp4"),
            status: "success",
            error: null,
            document: null,
            type: "attachment",
            contentString: "data:video/mp4;base64,AAAA",
          },
        ]}
      />
    );

    expect(markup).toContain("Video attached!");
    expect(markup).not.toContain("<img");
  });

  it("maps missing video backend errors to a readable prompt", () => {
    expect(
      videoUnderstandingErrorMessage({ code: "NO_VIDEO_PROVIDER" })
    ).toContain("enable Video Understanding");
    expect(
      videoUnderstandingErrorMessage({
        message: "Video understanding is disabled.",
      })
    ).toContain("configure a supported video provider");
  });

  it("renders missing video backend abort frames as readable chat errors", () => {
    const setLoadingResponse = vi.fn();
    const setChatHistory = vi.fn();
    const history = [];

    handleChat(
      {
        uuid: "abort-1",
        type: "abort",
        errorCode: "NO_VIDEO_PROVIDER",
        error: "No video understanding provider is configured.",
        textResponse: null,
        sources: [],
        close: true,
      },
      setLoadingResponse,
      setChatHistory,
      [],
      history,
      vi.fn()
    );

    expect(setChatHistory).toHaveBeenCalledWith([
      expect.objectContaining({
        error: expect.stringContaining("enable Video Understanding"),
      }),
    ]);
    expect(history[0].error).toContain("configure a supported video provider");
  });
});
