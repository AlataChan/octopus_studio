import React, { useEffect, useState } from "react";
import { X, Copy, Check } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import paths from "@/utils/paths";
import { userFromStorage } from "@/utils/request";
import System from "@/models/system";
import showToast from "@/utils/toast";

export default function NewApiKeyModal({ closeModal, onSuccess }) {
  const [apiKey, setApiKey] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState("");
  const [rateLimit, setRateLimit] = useState(100);

  const handleCreate = async (e) => {
    setError(null);
    e.preventDefault();
    const user = userFromStorage();
    const Model = user ? Admin : System;

    // 计算过期时间
    let expiresAt = null;
    if (expiresIn) {
      const days = parseInt(expiresIn);
      expiresAt = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    const { apiKey: newApiKey, error } = await Model.generateApiKey({
      name: name || undefined,
      expiresAt,
      rateLimit,
    });
    if (newApiKey) {
      setApiKey(newApiKey);
      onSuccess();
    }
    setError(error);
  };

  const copyApiKey = () => {
    if (!apiKey) return false;
    window.navigator.clipboard.writeText(apiKey.secret);
    setCopied(true);
    showToast("API key copied to clipboard", "success", {
      clear: true,
    });
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

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <div className="w-full flex gap-x-2 items-center">
            <h3 className="text-xl font-semibold text-theme-text-primary overflow-hidden overflow-ellipsis whitespace-nowrap">
              Create new API key
            </h3>
          </div>
          <button
            onClick={closeModal}
            type="button"
            className="absolute top-4 right-4 transition-all duration-300 bg-transparent rounded-lg text-sm p-1 inline-flex items-center hover:bg-theme-modal-border hover:border-theme-modal-border hover:border-opacity-50 border-transparent border"
          >
            <X size={24} weight="bold" className="text-theme-text-primary" />
          </button>
        </div>
        <div className="px-7 py-6">
          <form onSubmit={handleCreate}>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {error && <p className="text-red-400 text-sm">错误: {error}</p>}
              {apiKey ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-900/20 border border-green-600/50 rounded-lg">
                    <p className="text-green-400 font-medium mb-2">
                      🔑 请保存您的 API Key
                    </p>
                    <p className="text-sm text-theme-text-secondary mb-3">
                      此密钥只会显示一次，请妥善保存：
                    </p>
                    <div className="relative">
                      <input
                        type="text"
                        defaultValue={`${apiKey.secret}`}
                        disabled={true}
                        className="border-none bg-theme-settings-input-bg text-green-300 font-mono text-sm rounded-lg outline-none block w-full p-2.5 pr-10"
                      />
                      <button
                        type="button"
                        onClick={copyApiKey}
                        disabled={copied}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-theme-modal-border transition-all duration-300"
                      >
                        {copied ? (
                          <Check
                            size={20}
                            className="text-green-400"
                            weight="bold"
                          />
                        ) : (
                          <Copy
                            size={20}
                            className="text-theme-text-primary"
                            weight="bold"
                          />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-theme-text-secondary mb-1">
                      名称（可选）
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：生产环境、测试用"
                      className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg outline-none block w-full p-2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-theme-text-secondary mb-1">
                      有效期
                    </label>
                    <select
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value)}
                      className="border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg outline-none block w-full p-2.5"
                    >
                      <option value="">永不过期</option>
                      <option value="30">30 天</option>
                      <option value="90">90 天</option>
                      <option value="180">180 天</option>
                      <option value="365">1 年</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-theme-text-secondary mb-1">
                      速率限制（请求/分钟）
                    </label>
                    <input
                      type="number"
                      value={rateLimit}
                      onChange={(e) =>
                        setRateLimit(parseInt(e.target.value) || 100)
                      }
                      min="1"
                      max="1000"
                      className="border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg outline-none block w-full p-2.5"
                    />
                  </div>
                </div>
              )}
              <p className="text-theme-text-primary text-opacity-60 text-xs md:text-sm">
                创建后，API Key 可用于程序化访问和配置此 Octopus Studio 实例。
              </p>
              <a
                href={paths.apiDocs()}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline"
              >
                查看 API 文档 &rarr;
              </a>
            </div>
            <div className="flex justify-end items-center mt-6 pt-6 border-t border-theme-modal-border">
              {!apiKey ? (
                <>
                  <button
                    onClick={closeModal}
                    type="button"
                    className="transition-all duration-300 text-theme-text-primary hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm mr-2"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm"
                  >
                    创建 API Key
                  </button>
                </>
              ) : (
                <button
                  onClick={closeModal}
                  type="button"
                  className="transition-all duration-300 text-theme-text-primary hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm"
                >
                  关闭
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
