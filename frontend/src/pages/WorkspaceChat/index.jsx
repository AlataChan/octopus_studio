import React, { useEffect, useState } from "react";
import { default as WorkspaceChatContainer } from "@/components/WorkspaceChat";
import Sidebar from "@/components/Sidebar";
import { useParams } from "react-router-dom";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import { FullScreenLoader } from "@/components/Preloader";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import {
  loadWorkspaceChatData,
  loadWorkspaceChatExtras,
  mergeWorkspaceChatExtras,
} from "@/utils/workspaceChatLoader";
import { setLocalStorageItem } from "@/utils/storage";

export default function WorkspaceChat() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return <ShowWorkspaceChat />;
}

function ShowWorkspaceChat() {
  const { slug, threadSlug = null } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function getWorkspace() {
      if (!slug) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const { workspace: loadedWorkspace, history: loadedHistory } =
        await loadWorkspaceChatData({ slug, threadSlug });

      if (isCancelled) return;

      setWorkspace(loadedWorkspace);
      setHistory(loadedHistory);
      setLoading(false);

      if (!loadedWorkspace) return;

      setLocalStorageItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({
          slug: loadedWorkspace.slug,
          name: loadedWorkspace.name,
        })
      );

      loadWorkspaceChatExtras({ slug })
        .then((extras) => {
          if (isCancelled) return;
          setWorkspace((currentWorkspace) =>
            mergeWorkspaceChatExtras(
              currentWorkspace,
              loadedWorkspace.slug,
              extras
            )
          );
        })
        .catch((error) => {
          console.error("Failed to load workspace chat extras.", error);
        });
    }

    getWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [slug, threadSlug]);

  return (
    <>
      <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
        {!isMobile && <Sidebar />}
        <WorkspaceChatContainer
          loading={loading}
          workspace={workspace}
          knownHistory={history}
        />
      </div>
    </>
  );
}
