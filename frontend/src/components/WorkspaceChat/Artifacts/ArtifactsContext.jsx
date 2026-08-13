import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import WorkspaceArtifacts from "@/models/workspaceArtifacts";

export const ARTIFACT_DRAFT_CREATED_EVENT = "artifacts:draft-created";
export const ARTIFACT_SIDEBAR_OPEN_EVENT = "artifacts:open-sidebar";

const ArtifactsContext = createContext(null);

export function ArtifactsProvider({ workspace, threadSlug, children }) {
  const workspaceSlug = workspace?.slug || null;
  const enabled = !!workspaceSlug && !!threadSlug;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [artifacts, setArtifacts] = useState([]);

  const [selectedArtifactId, setSelectedArtifactId] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [selectedContent, setSelectedContent] = useState("");
  const [selectedContentLoading, setSelectedContentLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setArtifacts([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const res = await WorkspaceArtifacts.list(workspaceSlug, threadSlug);
    if (!res?.success) {
      setArtifacts([]);
      setError(res?.error || "Failed to load artifacts.");
      setLoading(false);
      return;
    }
    setArtifacts(Array.isArray(res.artifacts) ? res.artifacts : []);
    setLoading(false);
  }, [enabled, threadSlug, workspaceSlug]);

  const selectArtifact = useCallback(
    async ({ artifactId, versionId = null } = {}) => {
      if (!enabled) return;
      if (!artifactId) return;
      setSelectedArtifactId(artifactId);
      setSelectedContent("");
      setSelectedContentLoading(true);

      const artifact = artifacts.find((a) => a.id === artifactId);
      const targetVersionId =
        versionId ||
        artifact?.draftVersionId ||
        artifact?.currentVersionId ||
        null;
      setSelectedVersionId(targetVersionId);

      if (!targetVersionId) {
        setSelectedContentLoading(false);
        return;
      }

      const res = await WorkspaceArtifacts.getVersionContent(
        workspaceSlug,
        threadSlug,
        artifactId,
        targetVersionId
      );
      if (!res?.success) {
        setSelectedContent("");
        setSelectedContentLoading(false);
        return;
      }
      setSelectedContent(res.content || "");
      setSelectedContentLoading(false);
    },
    [artifacts, enabled, threadSlug, workspaceSlug]
  );

  const createFromChat = useCallback(
    async ({ chatId, title = null, type = "note", language = null } = {}) => {
      if (!enabled)
        return {
          success: false,
          error: "Artifacts are not available in this chat.",
        };
      const res = await WorkspaceArtifacts.createFromChat(
        workspaceSlug,
        threadSlug,
        {
          chatId,
          title,
          type,
          language,
        }
      );
      if (!res?.success) return res;

      const created = res.artifact;
      await refresh();
      if (created?.id) {
        await selectArtifact({
          artifactId: created.id,
          versionId: created.currentVersionId,
        });
      }
      return res;
    },
    [enabled, refresh, selectArtifact, threadSlug, workspaceSlug]
  );

  const promote = useCallback(
    async ({ artifactId, versionId } = {}) => {
      if (!enabled)
        return {
          success: false,
          error: "Artifacts are not available in this chat.",
        };
      const res = await WorkspaceArtifacts.promote(
        workspaceSlug,
        threadSlug,
        artifactId,
        versionId
      );
      if (!res?.success) return res;
      await refresh();
      await selectArtifact({ artifactId, versionId });
      return res;
    },
    [enabled, refresh, selectArtifact, threadSlug, workspaceSlug]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onDraftCreated(e) {
      const { artifactId, versionId } = e?.detail || {};
      refresh().then(() => {
        if (artifactId) selectArtifact({ artifactId, versionId });
      });
    }
    window.addEventListener(ARTIFACT_DRAFT_CREATED_EVENT, onDraftCreated);
    return () =>
      window.removeEventListener(ARTIFACT_DRAFT_CREATED_EVENT, onDraftCreated);
  }, [refresh, selectArtifact]);

  const value = useMemo(
    () => ({
      enabled,
      loading,
      error,
      artifacts,
      refresh,
      createFromChat,
      promote,
      selectedArtifactId,
      selectedVersionId,
      selectedContent,
      selectedContentLoading,
      selectArtifact,
    }),
    [
      artifacts,
      createFromChat,
      enabled,
      error,
      loading,
      promote,
      refresh,
      selectArtifact,
      selectedArtifactId,
      selectedContent,
      selectedContentLoading,
      selectedVersionId,
    ]
  );

  return (
    <ArtifactsContext.Provider value={value}>
      {children}
    </ArtifactsContext.Provider>
  );
}

export function useArtifacts() {
  return useContext(ArtifactsContext);
}
