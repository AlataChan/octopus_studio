import { PaperclipHorizontal } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";
import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import {
  ATTACHMENTS_PROCESSED_EVENT,
  REMOVE_ATTACHMENT_EVENT,
} from "../../DnDWrapper";
import { useTheme } from "@/hooks/useTheme";
import ParsedFilesMenu from "./ParsedFilesMenu";
import showToast from "@/utils/toast";

/**
 * This is a simple proxy component that clicks on the DnD file uploader for the user.
 * @returns
 */
export default function AttachItem() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { slug, threadSlug = null } = useParams();
  const tooltipRef = useRef(null);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [files, setFiles] = useState([]);
  const [currentTokens, setCurrentTokens] = useState(0);
  const [contextWindow, setContextWindow] = useState(Infinity);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFiles = () => {
    if (!slug) return;
    if (isEmbedding) return;
    setIsLoading(true);
    Workspace.getParsedFiles(slug, threadSlug)
      .then(({ files, contextWindow, currentContextTokenCount }) => {
        setFiles(files);
        setShowTooltip(files.length > 0);
        setContextWindow(contextWindow);
        setCurrentTokens(currentContextTokenCount);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  /**
   * Handles the removal of an attachment from the parsed files
   * and triggers a re-fetch of the parsed files.
   * This function handles when the user clicks the X on an Attachment via the AttachmentManager
   * so we need to sync the state in the ParsedFilesMenu picker here.
   */
  async function handleRemoveAttachment(e) {
    const { document } = e.detail;
    await Workspace.deleteParsedFiles(slug, [document.id]);
    fetchFiles();
  }

  /**
   * Handles the click event for the attach item button.
   * Uses the dropzone's open function for reliable file dialog opening.
   * @param {MouseEvent} e - The click event.
   * @returns {void}
   */
  function handleClick(e) {
    e?.target?.blur();
    // 优先使用 dropzone 的 open 函数（更可靠）
    if (typeof window.__dndDropzoneOpen === "function") {
      window.__dndDropzoneOpen();
    } else if (window.__dndDropzoneOpen === null) {
      // 文档处理服务离线
      showToast("文档处理服务未启动，无法上传文件", "error");
    } else {
      // 降级方案：直接点击 input
      document?.getElementById("dnd-chat-file-uploader")?.click();
    }
    return;
  }

  useEffect(() => {
    fetchFiles();
    window.addEventListener(ATTACHMENTS_PROCESSED_EVENT, fetchFiles);
    window.addEventListener(REMOVE_ATTACHMENT_EVENT, handleRemoveAttachment);
    return () => {
      window.removeEventListener(ATTACHMENTS_PROCESSED_EVENT, fetchFiles);
      window.removeEventListener(
        REMOVE_ATTACHMENT_EVENT,
        handleRemoveAttachment
      );
    };
  }, [slug, threadSlug]);

  return (
    <>
      <button
        id="attach-item-btn"
        data-tooltip-id="tooltip-attach-item-btn"
        aria-label={t("chat_window.attach_file")}
        type="button"
        onClick={handleClick}
        onPointerEnter={fetchFiles}
        className={`border-none relative flex justify-center items-center opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200`}
      >
        <div className="relative">
          <PaperclipHorizontal
            color="var(--theme-sidebar-footer-icon-fill)"
            className="w-[22px] h-[22px] pointer-events-none text-theme-text-primary rotate-90 -scale-y-100"
          />
          {files.length > 0 && (
            <div className="absolute -top-2 right-[1%] bg-[var(--theme-accent-primary)] text-[var(--theme-button-primary-text)] text-[8px] rounded-full px-1 flex items-center justify-center font-bold">
              {files.length}
            </div>
          )}
        </div>
      </button>
      {showTooltip && (
        <Tooltip
          ref={tooltipRef}
          id="tooltip-attach-item-btn"
          place="top"
          opacity={1}
          clickable={!isEmbedding}
          delayShow={300}
          delayHide={isEmbedding ? 999999 : 800} // Prevent tooltip from hiding during embedding
          arrowColor={
            theme === "light"
              ? "var(--theme-modal-border)"
              : "var(--theme-bg-primary)"
          }
          className="z-99 !w-[400px] !bg-theme-bg-primary !px-[5px] !rounded-lg !pointer-events-auto light:border-2 light:border-theme-modal-border"
        >
          <ParsedFilesMenu
            onEmbeddingChange={setIsEmbedding}
            tooltipRef={tooltipRef}
            isLoading={isLoading}
            files={files}
            setFiles={setFiles}
            currentTokens={currentTokens}
            setCurrentTokens={setCurrentTokens}
            contextWindow={contextWindow}
          />
        </Tooltip>
      )}
    </>
  );
}
