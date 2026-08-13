import { useEffect, useState } from "react";
import Admin from "@/models/admin";
import showToast from "@/utils/toast";
import { Trash } from "@phosphor-icons/react";
import { userFromStorage } from "@/utils/request";
import System from "@/models/system";

export default function ApiKeyRow({ apiKey, removeApiKey }) {
  const [copied, setCopied] = useState(false);

  const handleDelete = async () => {
    if (
      !window.confirm(
        `确定要删除此 API Key 吗？\n删除后将无法恢复。\n\n此操作不可逆。`
      )
    )
      return false;

    const user = userFromStorage();
    const Model = !!user ? Admin : System;
    await Model.deleteApiKey(apiKey.id);
    showToast("API Key 已删除", "info");
    removeApiKey(apiKey.id);
  };

  const copyApiKey = () => {
    if (!apiKey) return false;
    window.navigator.clipboard.writeText(apiKey.secret);
    showToast("API Key 已复制到剪贴板", "success");
    setCopied(true);
  };

  useEffect(() => {
    function resetStatus() {
      if (!copied) return false;
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    }
    resetStatus();
  }, [copied]);

  // 检查是否过期
  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();
  const isInactive = apiKey.isActive === false;

  return (
    <>
      <tr
        className={`bg-transparent text-theme-text-primary text-opacity-80 text-xs font-medium border-b border-theme-border h-12 ${isExpired || isInactive ? "opacity-50" : ""}`}
      >
        <td scope="row" className="px-6 whitespace-nowrap">
          <div className="flex flex-col">
            <span className="font-medium">{apiKey.name || "未命名"}</span>
            <span className="text-theme-text-secondary font-mono text-[10px]">
              {apiKey.secret}
            </span>
          </div>
        </td>
        <td className="px-6 text-left">{apiKey.createdBy?.username || "--"}</td>
        <td className="px-6">
          <div className="flex flex-col">
            <span>
              {new Date(apiKey.createdAt).toLocaleDateString("zh-CN")}
            </span>
            {apiKey.lastUsedAt && (
              <span className="text-theme-text-secondary text-[10px]">
                最后使用:{" "}
                {new Date(apiKey.lastUsedAt).toLocaleDateString("zh-CN")}
              </span>
            )}
          </div>
        </td>
        <td className="px-6">
          <div className="flex items-center gap-2">
            {isInactive && (
              <span className="px-2 py-0.5 bg-red-900/50 text-red-400 rounded text-[10px]">
                已禁用
              </span>
            )}
            {isExpired && (
              <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-[10px]">
                已过期
              </span>
            )}
            {!isInactive && !isExpired && (
              <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-[10px]">
                活跃
              </span>
            )}
          </div>
        </td>
        <td className="px-6">
          <span className="text-theme-text-secondary">
            {apiKey.usageCount || 0} 次
          </span>
        </td>
        <td className="px-6 flex items-center gap-x-4 h-full mt-2">
          <button
            onClick={copyApiKey}
            disabled={copied}
            className="text-xs font-medium text-blue-300 rounded-lg hover:text-theme-text-primary hover:text-opacity-60 hover:underline"
          >
            {copied ? "已复制" : "复制"}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs font-medium text-white/80 hover:text-red-300 rounded-lg p-1 hover:bg-white hover:bg-opacity-10"
            title="删除"
          >
            <Trash className="h-4 w-4" />
          </button>
        </td>
      </tr>
    </>
  );
}
