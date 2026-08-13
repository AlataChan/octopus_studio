import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import System from "@/models/system";
import { Database, FolderOpen, File, Trash, Plus } from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import ManageWorkspace, {
  useManageWorkspaceModal,
} from "@/components/Modals/ManageWorkspace";
import Workspace from "@/models/workspace";
import {
  normalizeDocumentCollection,
  normalizeWorkspaceList,
} from "@/utils/documentCollections";

/**
 * 文档管理页面
 * 显示所有已上传的文档，支持查看、删除等操作
 */
export default function DocumentManager() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState({ items: [] });
  const [defaultWorkspace, setDefaultWorkspace] = useState(null);
  const { showing, showModal, hideModal } = useManageWorkspaceModal();

  useEffect(() => {
    fetchDocuments();
    fetchDefaultWorkspace();
  }, []);

  const documentItems = documents?.items ?? [];

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const docs = await System.localFiles();
      setDocuments(normalizeDocumentCollection(docs));
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      showToast("获取文档列表失败", "error");
    }
    setLoading(false);
  };

  const fetchDefaultWorkspace = async () => {
    try {
      const workspaces = normalizeWorkspaceList(await Workspace.all());
      if (workspaces.length > 0) {
        setDefaultWorkspace(workspaces[0]);
      }
    } catch (error) {
      console.error("Failed to fetch workspace:", error);
    }
  };

  const handleOpenUploadModal = () => {
    if (!defaultWorkspace) {
      showToast("请先创建一个工作区", "warning");
      return;
    }
    showModal();
  };

  const handleDeleteDocument = async (folderName, fileName) => {
    if (!window.confirm(`确定要删除文档 "${fileName}" 吗？`)) return;

    try {
      const success = await System.deleteDocument(`${folderName}/${fileName}`);
      if (success) {
        showToast("文档删除成功", "success");
        fetchDocuments();
      } else {
        showToast("文档删除失败", "error");
      }
    } catch (error) {
      console.error("Failed to delete document:", error);
      showToast("文档删除失败", "error");
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        <div className="flex flex-col w-full px-6 py-6">
          {/* 页面标题 */}
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex gap-x-4 justify-between">
              <div className="flex items-center gap-x-4">
                <Database
                  className="h-8 w-8 text-theme-text-primary"
                  weight="bold"
                />
                <p className="text-2xl font-bold text-theme-text-primary">
                  知识库管理
                </p>
              </div>
              {/* 添加文档按钮 */}
              <button
                onClick={handleOpenUploadModal}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-theme-accent-primary hover:bg-theme-accent-primary/80 transition-colors"
                title="上传文档"
              >
                <Plus
                  className="h-6 w-6 text-theme-text-primary"
                  weight="bold"
                />
              </button>
            </div>
            <p className="text-sm text-white/60 mt-2">
              查看和管理所有已上传的文档。这些文档可以被添加到不同的工作区中。
            </p>
          </div>

          {/* 文档列表 */}
          <div className="w-full mt-6">
            {loading ? (
              <div className="text-theme-text-primary text-center py-10">
                加载中...
              </div>
            ) : documentItems.length === 0 ? (
              <div className="text-white/60 text-center py-10">
                <Database className="h-16 w-16 mx-auto mb-4 opacity-40" />
                <p className="text-lg">暂无文档</p>
                <p className="text-sm mt-2">
                  请通过主页的"新知识库"按钮上传文档
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {documentItems.map((folder, folderIndex) => (
                  <FolderSection
                    key={folderIndex}
                    folder={folder}
                    onDelete={handleDeleteDocument}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 文档上传弹窗 */}
      {showing && defaultWorkspace && (
        <ManageWorkspace
          hideModal={hideModal}
          providedSlug={defaultWorkspace.slug}
        />
      )}
    </div>
  );
}

function FolderSection({ folder, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const folderItems = Array.isArray(folder?.items) ? folder.items : [];

  if (folderItems.length === 0) return null;

  return (
    <div className="bg-theme-bg-primary rounded-lg p-4">
      {/* 文件夹标题 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-x-3 text-theme-text-primary hover:text-sky-400 transition-colors"
      >
        <FolderOpen className="h-5 w-5" weight="fill" />
        <span className="text-lg font-semibold">{folder.name}</span>
        <span className="text-sm text-white/40">
          ({folderItems.length} 个文件)
        </span>
      </button>

      {/* 文件列表 */}
      {isExpanded && (
        <div className="mt-4 space-y-2">
          {folderItems.map((file, fileIndex) => (
            <FileRow
              key={fileIndex}
              file={file}
              folderName={folder.name}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ file, folderName, onDelete }) {
  // 优先显示 title（原始文件名），如果没有则显示 name（处理后的文件名）
  const displayName = file?.title || file?.name || "";

  return (
    <div className="flex items-center justify-between p-3 bg-theme-bg-secondary rounded-lg hover:bg-theme-bg-secondary/80 transition-colors">
      <div className="flex items-center gap-x-3 flex-1 min-w-0">
        <File className="h-4 w-4 text-white/60 flex-shrink-0" />
        <span
          className="text-sm text-theme-text-primary truncate"
          title={displayName}
        >
          {displayName}
        </span>
      </div>
      <div className="flex items-center gap-x-2 flex-shrink-0">
        {file?.cached && (
          <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
            已缓存
          </span>
        )}
        <button
          onClick={() => onDelete(folderName, file?.name)}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors group"
          title="删除文档"
        >
          <Trash className="h-4 w-4 text-white/60 group-hover:text-red-400" />
        </button>
      </div>
    </div>
  );
}
