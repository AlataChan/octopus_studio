import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { Plus, CircleNotch, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ThreadItem from "./ThreadItem";
import { useNavigate, useParams } from "react-router-dom";
export const THREAD_RENAME_EVENT = "renameThread";

export function appendThreadIfMissing(threads = [], thread = null) {
  if (!thread?.slug) return threads;
  if (threads.some((existingThread) => existingThread.slug === thread.slug)) {
    return threads;
  }
  return [...threads, thread];
}

export default function ThreadContainer({ workspace }) {
  const { threadSlug = null } = useParams();
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ctrlPressed, setCtrlPressed] = useState(false);

  useEffect(() => {
    const chatHandler = (event) => {
      const { threadSlug, newName } = event.detail;
      setThreads((prevThreads) =>
        prevThreads.map((thread) => {
          if (thread.slug === threadSlug) {
            return { ...thread, name: newName };
          }
          return thread;
        })
      );
    };

    window.addEventListener(THREAD_RENAME_EVENT, chatHandler);

    return () => {
      window.removeEventListener(THREAD_RENAME_EVENT, chatHandler);
    };
  }, []);

  useEffect(() => {
    async function fetchThreads() {
      if (!workspace.slug) return;
      const { threads } = await Workspace.threads.all(workspace.slug);
      setLoading(false);
      setThreads(threads);
    }
    fetchThreads();
  }, [workspace.slug]);

  // Enable toggling of bulk-deletion by holding meta-key (ctrl on win and cmd/fn on others)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (["Control", "Meta"].includes(event.key)) {
        setCtrlPressed(true);
      }
    };

    const handleKeyUp = (event) => {
      if (["Control", "Meta"].includes(event.key)) {
        setCtrlPressed(false);
        // when toggling, unset bulk progress so
        // previously marked threads that were never deleted
        // come back to life.
        setThreads((prev) =>
          prev.map((t) => {
            return { ...t, deleted: false };
          })
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const toggleForDeletion = (id) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, deleted: !t.deleted };
      })
    );
  };

  const handleDeleteAll = async () => {
    const slugs = threads.filter((t) => t.deleted === true).map((t) => t.slug);
    await Workspace.threads.deleteBulk(workspace.slug, slugs);
    setThreads((prev) => prev.filter((t) => !t.deleted));

    // Only redirect if current thread is being deleted
    if (slugs.includes(threadSlug)) {
      navigate(paths.workspace.chat(workspace.slug));
    }
  };

  function removeThread(threadId) {
    setThreads((prev) =>
      prev.map((_t) => {
        if (_t.id !== threadId) return _t;
        return { ..._t, deleted: true };
      })
    );

    // Show thread was deleted, but then remove from threads entirely so it will
    // not appear in bulk-selection.
    setTimeout(() => {
      setThreads((prev) => prev.filter((t) => !t.deleted));
    }, 500);
  }

  function addThread(thread) {
    setThreads((prev) => appendThreadIfMissing(prev, thread));
  }

  if (loading) {
    return (
      <div className="flex flex-col bg-pulse w-full h-10 items-center justify-center">
        <p className="text-xs text-theme-text-primary animate-pulse">
          loading threads....
        </p>
      </div>
    );
  }

  const activeThreadIdx = !!threads.find(
    (thread) => thread?.slug === threadSlug
  )
    ? threads.findIndex((thread) => thread?.slug === threadSlug) + 1
    : 0;

  return (
    <div className="flex flex-col" role="list" aria-label="Threads">
      <ThreadItem
        idx={0}
        activeIdx={activeThreadIdx}
        isActive={activeThreadIdx === 0}
        thread={{ slug: null, name: "default" }}
        hasNext={threads.length > 0}
      />
      {threads.map((thread, i) => (
        <ThreadItem
          key={thread.slug}
          idx={i + 1}
          ctrlPressed={ctrlPressed}
          toggleMarkForDeletion={toggleForDeletion}
          activeIdx={activeThreadIdx}
          isActive={activeThreadIdx === i + 1}
          workspace={workspace}
          onRemove={removeThread}
          thread={thread}
          hasNext={i !== threads.length - 1}
        />
      ))}
      <DeleteAllThreadButton
        ctrlPressed={ctrlPressed}
        threads={threads}
        onDelete={handleDeleteAll}
      />
      <NewThreadButton workspace={workspace} onThreadCreated={addThread} />
    </div>
  );
}

function NewThreadButton({ workspace, onThreadCreated }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const { thread, error } = await Workspace.threads.new(workspace.slug);
      if (!!error || !thread?.slug) {
        showToast(
          `Could not create thread - ${error || "Invalid thread response"}`,
          "error",
          { clear: true }
        );
        return;
      }

      onThreadCreated?.(thread);
      navigate(paths.workspace.thread(workspace.slug, thread.slug), {
        replace: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full relative flex h-[40px] items-center border-none hover:bg-[var(--theme-sidebar-thread-selected)] hover:light:bg-theme-sidebar-subitem-hover rounded-lg"
    >
      <div className="flex w-full gap-x-2 items-center pl-4">
        <div className="bg-white/20 p-2 rounded-lg h-[24px] w-[24px] flex items-center justify-center">
          {loading ? (
            <CircleNotch
              weight="bold"
              size={14}
              className="shrink-0 animate-spin text-theme-text-primary light:text-theme-text-primary"
            />
          ) : (
            <Plus
              weight="bold"
              size={14}
              className="shrink-0 text-theme-text-primary light:text-theme-text-primary"
            />
          )}
        </div>

        {loading ? (
          <p className="text-left text-theme-text-primary light:text-theme-text-primary text-sm">
            Starting Thread...
          </p>
        ) : (
          <p className="text-left text-theme-text-primary light:text-theme-text-primary text-sm">
            New Thread
          </p>
        )}
      </div>
    </button>
  );
}

function DeleteAllThreadButton({ ctrlPressed, threads, onDelete }) {
  if (!ctrlPressed || threads.filter((t) => t.deleted).length === 0)
    return null;
  return (
    <button
      type="button"
      onClick={onDelete}
      className="w-full relative flex h-[40px] items-center border-none hover:bg-red-400/20 rounded-lg group"
    >
      <div className="flex w-full gap-x-2 items-center pl-4">
        <div className="bg-transparent p-2 rounded-lg h-[24px] w-[24px] flex items-center justify-center">
          <Trash
            weight="bold"
            size={14}
            className="shrink-0 text-theme-text-primary light:text-red-500/50 group-hover:text-red-400"
          />
        </div>
        <p className="text-theme-text-primary light:text-theme-text-secondary text-left text-sm group-hover:text-red-400">
          Delete Selected
        </p>
      </div>
    </button>
  );
}
