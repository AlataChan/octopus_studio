export const MAX_VIDEO_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/mov",
  "video/webm",
  "video/x-matroska",
  "video/mkv",
  "video/x-msvideo",
  "video/avi",
  "video/x-flv",
  "video/flv",
  "video/3gpp",
  "video/3gpp2",
]);

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
  "flv",
  "3gp",
]);

function fileExtension(file) {
  return file?.name?.split(".")?.pop()?.toLowerCase() || "";
}

export function isSupportedVideoAttachmentFile(file) {
  const mimeType = file?.type?.toLowerCase() || "";
  if (SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) return true;
  return SUPPORTED_VIDEO_EXTENSIONS.has(fileExtension(file));
}

export function isVideoLikeFile(file) {
  const mimeType = file?.type?.toLowerCase() || "";
  return (
    mimeType.startsWith("video/") ||
    SUPPORTED_VIDEO_EXTENSIONS.has(fileExtension(file))
  );
}

export function isChatAttachmentFile(file) {
  if (file?.type?.startsWith("image/")) return true;
  return isSupportedVideoAttachmentFile(file);
}

export function validateChatAttachmentFile(file) {
  if (!isVideoLikeFile(file)) return { ok: true, reason: null };

  if (!isSupportedVideoAttachmentFile(file)) {
    return {
      ok: false,
      reason:
        "Unsupported video format. Supported formats: MP4, MOV, WEBM, MKV, AVI, FLV, and 3GP.",
    };
  }

  if (Number(file?.size || 0) > MAX_VIDEO_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: "Video attachments must be 100MB or smaller.",
    };
  }

  return { ok: true, reason: null };
}

export function videoUnderstandingErrorMessage(error = {}) {
  const code = error?.code || error?.errorCode;
  const message = String(error?.message || error?.error || error || "");
  const normalized = message.toLowerCase();

  if (
    code === "NO_VIDEO_PROVIDER" ||
    normalized.includes("video understanding is disabled") ||
    normalized.includes("no supported video provider") ||
    normalized.includes("no video understanding provider")
  ) {
    return "Video understanding is not ready. Ask an admin to enable Video Understanding and configure a supported video provider before uploading videos.";
  }

  return null;
}
