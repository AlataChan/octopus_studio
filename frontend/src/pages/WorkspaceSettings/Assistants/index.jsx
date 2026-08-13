import { useEffect, useState } from "react";
import * as Skeleton from "react-loading-skeleton";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import AssistantRow from "./AssistantRow";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import { Sparkle } from "@phosphor-icons/react";

/**
 * Workspace 助手管理 Tab
 * 显示已安装的助手列表，支持启用/禁用、重命名、卸载
 */
export default function Assistants({ workspace }) {
  const [loading, setLoading] = useState(true);
  const [assistants, setAssistants] = useState([]);

  useEffect(() => {
    async function fetchAssistants() {
      const result = await WorkspaceAssistant.list(workspace.slug);
      if (result.success) {
        setAssistants(result.data.assistants || []);
      }
      setLoading(false);
    }
    fetchAssistants();
  }, [workspace.slug]);

  /**
   * 刷新助手列表
   */
  const refreshAssistants = async () => {
    const result = await WorkspaceAssistant.list(workspace.slug);
    if (result.success) {
      setAssistants(result.data.assistants || []);
    }
  };

  if (loading) {
    return (
      <Skeleton.default
        height="80vh"
        width="100%"
        highlightColor="var(--theme-bg-primary)"
        baseColor="var(--theme-bg-secondary)"
        count={1}
        className="w-full p-4 rounded-b-2xl rounded-tr-2xl rounded-tl-sm mt-6"
        containerClassName="flex w-full"
      />
    );
  }

  return (
    <div className="flex flex-col gap-y-6 -mt-3">
      {/* 助手列表 */}
      <div className="flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-theme-text-primary text-lg font-semibold">
              已安装的助手
            </h3>
            <p className="text-white/60 text-sm mt-1">
              管理此 Workspace 中已安装的助手
            </p>
          </div>
          <Link
            to={paths.assistantLibrary()}
            className="flex items-center gap-x-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-theme-text-primary rounded-lg transition-all duration-300"
          >
            <Sparkle size={18} weight="fill" />
            <span className="text-sm font-medium">浏览助手库</span>
          </Link>
        </div>

        {assistants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 bg-theme-bg-primary rounded-lg border border-theme-border">
            <Sparkle size={48} className="text-white/20 mb-4" weight="fill" />
            <h4 className="text-theme-text-primary text-base font-medium mb-2">
              还没有安装任何助手
            </h4>
            <p className="text-white/60 text-sm text-center mb-4 max-w-md">
              前往助手库浏览并雇佣专业助手，提升您的工作效率
            </p>
            <Link
              to={paths.assistantLibrary()}
              className="flex items-center gap-x-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-theme-text-primary rounded-lg transition-all duration-300"
            >
              <Sparkle size={18} weight="fill" />
              <span className="text-sm font-medium">前往助手库</span>
            </Link>
          </div>
        ) : (
          <div className="bg-theme-bg-primary rounded-lg border border-theme-border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-theme-text-primary text-opacity-80 text-xs leading-[18px] font-bold uppercase border-theme-border border-b">
                <tr>
                  <th scope="col" className="px-6 py-3">
                    助手
                  </th>
                  <th scope="col" className="px-6 py-3">
                    分类
                  </th>
                  <th scope="col" className="px-6 py-3">
                    状态
                  </th>
                  <th scope="col" className="px-6 py-3">
                    安装时间
                  </th>
                  <th scope="col" className="px-6 py-3 text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {assistants.map((assistant) => (
                  <AssistantRow
                    key={assistant.id}
                    assistant={assistant}
                    workspaceSlug={workspace.slug}
                    onUpdate={refreshAssistants}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-4">
        <h4 className="text-sky-400 text-sm font-medium mb-2">💡 提示</h4>
        <ul className="text-white/60 text-sm space-y-1 list-disc list-inside">
          <li>禁用的助手不会出现在聊天界面的助手选择器中</li>
          <li>重命名助手不会影响其功能，只是改变显示名称</li>
          <li>卸载助手会永久删除，但可以随时重新安装</li>
        </ul>
      </div>
    </div>
  );
}
