/**
 * @fileoverview 临时分析文件管理页面
 * 允许用户上传 Excel/CSV 文件到 S3/MinIO，供 DuckDB Agent 分析
 */

import React, { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import {
  FileXls,
  FileCsv,
  Trash,
  CloudArrowUp,
  Warning,
  CheckCircle,
  SpinnerGap,
} from "@phosphor-icons/react";
import { formatFileSize, formatRelativeTime } from "./utils";

export default function AnalysisFiles({ workspace }) {
  const [status, setStatus] = useState({ enabled: false, loading: true });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // 加载状态和文件列表
  useEffect(() => {
    async function loadData() {
      const [layerStatus, filesData] = await Promise.all([
        Workspace.getAnalysisLayerStatus(),
        Workspace.getAnalysisFiles(workspace.slug),
      ]);
      setStatus({ ...layerStatus, loading: false });
      setFiles(filesData.files || []);
    }
    loadData();
  }, [workspace.slug]);

  // 文件拖放处理
  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (!status.enabled || uploading) return;

      for (const file of acceptedFiles) {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        const result = await Workspace.uploadAnalysisFile(
          workspace.slug,
          formData
        );

        if (result.success) {
          showToast(`${file.name} 上传成功`, "success");
          // 刷新文件列表
          const filesData = await Workspace.getAnalysisFiles(workspace.slug);
          setFiles(filesData.files || []);
        } else {
          showToast(`上传失败: ${result.error}`, "error");
        }
        setUploading(false);
      }
    },
    [workspace.slug, status.enabled, uploading]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    disabled: !status.enabled || uploading,
  });

  // 删除文件
  const handleDelete = async (key) => {
    if (!window.confirm("确定要删除此文件吗？")) return;

    setDeleting(key);
    const result = await Workspace.deleteAnalysisFile(workspace.slug, key);

    if (result.success) {
      showToast("文件已删除", "success");
      setFiles(files.filter((f) => f.key !== key));
    } else {
      showToast(`删除失败: ${result.error}`, "error");
    }
    setDeleting(null);
  };

  if (status.loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SpinnerGap className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <h2 className="text-lg font-semibold text-theme-text-primary mb-2">
        临时分析文件
      </h2>
      <p className="text-white/60 text-sm mb-6">
        上传 Excel 或 CSV 文件，让 AI 助手使用 DuckDB 进行数据分析。文件将在{" "}
        {status.retentionDays || 30} 天后自动删除。
      </p>

      {/* 状态提示 */}
      {!status.enabled && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <Warning className="h-6 w-6 text-yellow-500 flex-shrink-0" />
          <div>
            <p className="text-yellow-200 font-medium">存储后端配置异常</p>
            <p className="text-yellow-200/70 text-sm">
              请检查服务器存储配置，确保本地存储目录可写或 S3 配置正确
            </p>
          </div>
        </div>
      )}

      {status.enabled && !status.connected && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-red-500/10 border border-red-500/30">
          <Warning className="h-6 w-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-200 font-medium">存储服务连接失败</p>
            <p className="text-red-200/70 text-sm">
              无法连接到 S3/MinIO 存储服务，请检查配置
            </p>
          </div>
        </div>
      )}

      {status.enabled && status.connected && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-green-500/10 border border-green-500/30">
          <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-green-200 font-medium">临时分析层已启用</p>
            <p className="text-green-200/70 text-sm">
              {status.backend === "local" ? (
                <>本地存储 | 单文件最大: {formatFileSize(status.maxFileSize)}</>
              ) : (
                <>
                  存储桶: {status.bucket} | 单文件最大:{" "}
                  {formatFileSize(status.maxFileSize)}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* 拖放上传区域 */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 mb-6 text-center transition-all cursor-pointer
          ${isDragActive ? "border-sky-400 bg-sky-400/10" : "border-theme-border-medium hover:border-white/40"}
          ${!status.enabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />
        <CloudArrowUp className="h-12 w-12 mx-auto mb-3 text-white/40" />
        {uploading ? (
          <p className="text-white/60">正在上传...</p>
        ) : isDragActive ? (
          <p className="text-sky-400">释放文件以上传</p>
        ) : (
          <p className="text-white/60">
            拖放文件到此处，或点击选择文件
            <br />
            <span className="text-sm">支持 .csv, .xls, .xlsx 格式</span>
          </p>
        )}
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-white/80 mb-3">
            已上传文件 ({files.length})
          </h3>
          {files.map((file) => (
            <FileRow
              key={file.key}
              file={file}
              onDelete={handleDelete}
              deleting={deleting === file.key}
            />
          ))}
        </div>
      )}

      {files.length === 0 && status.enabled && (
        <p className="text-white/40 text-center py-8">
          暂无分析文件，上传文件后可在对话中让 AI 助手进行数据分析
        </p>
      )}
    </div>
  );
}

/**
 * 文件行组件
 */
function FileRow({ file, onDelete, deleting }) {
  const fileName = file.key.split("/").pop();
  const ext = fileName.split(".").pop().toLowerCase();
  const Icon = ext === "csv" ? FileCsv : FileXls;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-theme-bg-primary hover:bg-theme-bg-primary/80 transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 text-green-400" weight="duotone" />
        <div>
          <p className="text-theme-text-primary text-sm font-medium">
            {fileName}
          </p>
          <p className="text-white/40 text-xs">
            {formatFileSize(file.size)} •{" "}
            {formatRelativeTime(file.lastModified)}
          </p>
        </div>
      </div>
      <button
        onClick={() => onDelete(file.key)}
        disabled={deleting}
        className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
        title="删除文件"
      >
        {deleting ? (
          <SpinnerGap className="h-5 w-5 animate-spin" />
        ) : (
          <Trash className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
