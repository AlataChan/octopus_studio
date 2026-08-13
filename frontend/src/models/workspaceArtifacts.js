import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const WorkspaceArtifacts = {
  list: async function (workspaceSlug, threadSlug) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/artifacts`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, artifacts: [] }));
  },

  createFromChat: async function (
    workspaceSlug,
    threadSlug,
    {
      chatId,
      title = null,
      type = "note",
      language = null,
      content = null,
    } = {}
  ) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/artifacts`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ chatId, title, type, language, content }),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, artifact: null }));
  },

  getVersionContent: async function (
    workspaceSlug,
    threadSlug,
    artifactId,
    versionId
  ) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/artifacts/${artifactId}/versions/${versionId}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  promote: async function (workspaceSlug, threadSlug, artifactId, versionId) {
    return fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/artifacts/${artifactId}/promote`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ versionId }),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message, artifact: null }));
  },
};

export default WorkspaceArtifacts;
