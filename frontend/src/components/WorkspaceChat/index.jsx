import React, { useEffect } from "react";
import LoadingChat from "./LoadingChat";
import ChatContainer from "./ChatContainer";
import paths from "@/utils/paths";
import ModalWrapper from "../ModalWrapper";
import { useParams } from "react-router-dom";
import { DnDFileUploaderProvider } from "./ChatContainer/DnDWrapper";
import { WarningCircle } from "@phosphor-icons/react";
import {
  TTSProvider,
  useWatchForAutoPlayAssistantTTSResponse,
} from "../contexts/TTSProvider";
import { ImageCanvasProvider, ImageCanvasSidebar } from "./ImageCanvas";
import { LiveCanvasSidebar } from "./LiveCanvas";

export default function WorkspaceChat({
  loading,
  workspace,
  knownHistory = [],
}) {
  useWatchForAutoPlayAssistantTTSResponse();
  const { threadSlug = null } = useParams();

  useEffect(() => setEventDelegatorForCodeSnippets(), []);

  if (loading) return <LoadingChat />;
  if (!workspace) {
    return (
      <>
        {loading === false && !workspace && (
          <ModalWrapper isOpen={true}>
            <div className="w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden">
              <div className="relative p-6 border-b rounded-t border-theme-modal-border">
                <div className="w-full flex gap-x-2 items-center">
                  <WarningCircle
                    className="text-red-500 w-6 h-6"
                    weight="fill"
                  />
                  <h3 className="text-xl font-semibold text-red-500 overflow-hidden overflow-ellipsis whitespace-nowrap">
                    Workspace not found
                  </h3>
                </div>
              </div>
              <div className="py-7 px-9 space-y-2 flex-col">
                <p className="text-theme-text-primary text-sm">
                  The workspace you're looking for is not available. It may have
                  been deleted or you may not have access to it.
                </p>
              </div>
              <div className="flex w-full justify-end items-center p-6 space-x-2 border-t border-theme-modal-border rounded-b">
                <a
                  href={paths.home()}
                  className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm"
                >
                  Return to homepage
                </a>
              </div>
            </div>
          </ModalWrapper>
        )}
        <LoadingChat />
      </>
    );
  }

  return (
    <TTSProvider>
      <ImageCanvasProvider workspace={workspace}>
        <DnDFileUploaderProvider workspace={workspace} threadSlug={threadSlug}>
          <div className="flex h-full w-full">
            <div className="flex-1 min-w-0">
              <ChatContainer
                workspace={workspace}
                knownHistory={knownHistory}
              />
            </div>
            <LiveCanvasSidebar workspace={workspace} threadSlug={threadSlug} />
            <ImageCanvasSidebar />
          </div>
        </DnDFileUploaderProvider>
      </ImageCanvasProvider>
    </TTSProvider>
  );
}

// Enables us to safely markdown and sanitize all responses without risk of injection
// but still be able to attach a handler to copy code snippets on all elements
// that are code snippets.
function copyCodeSnippet(uuid) {
  const target = document.querySelector(`[data-code="${uuid}"]`);
  if (!target) return false;
  const markdown =
    target.parentElement?.parentElement?.querySelector(
      "pre:first-of-type"
    )?.innerText;
  if (!markdown) return false;

  window.navigator.clipboard.writeText(markdown);
  target.classList.add("text-green-500");
  const originalText = target.innerHTML;
  target.innerText = "Copied!";
  target.setAttribute("disabled", true);

  setTimeout(() => {
    target.classList.remove("text-green-500");
    target.innerHTML = originalText;
    target.removeAttribute("disabled");
  }, 2500);
}

// Listens and hunts for all data-code-snippet clicks.
export function setEventDelegatorForCodeSnippets() {
  const listener = function (e) {
    const target = e.target.closest("[data-code-snippet]");
    const uuidCode = target?.dataset?.code;
    if (!uuidCode) return false;
    copyCodeSnippet(uuidCode);
  };

  document?.addEventListener("click", listener);
  return () => document?.removeEventListener("click", listener);
}
