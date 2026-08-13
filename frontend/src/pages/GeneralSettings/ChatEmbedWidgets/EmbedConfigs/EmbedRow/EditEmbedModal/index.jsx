import React, { useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  BooleanInput,
  ChatModeSelection,
  NumberInput,
  PermittedDomains,
  WorkspaceSelection,
  enforceSubmissionSchema,
} from "../../NewEmbedModal";
import Embed from "@/models/embed";
import showToast from "@/utils/toast";

export default function EditEmbedModal({ embed, closeModal }) {
  const [error, setError] = useState(null);

  const handleUpdate = async (e) => {
    setError(null);
    e.preventDefault();
    const form = new FormData(e.target);
    const data = enforceSubmissionSchema(form);
    const { success, error } = await Embed.updateEmbed(embed.id, data);
    if (success) {
      showToast("Embed updated successfully.", "success", { clear: true });
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
    setError(error);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <div className="w-full flex gap-x-2 items-center">
            <h3 className="text-xl font-semibold text-theme-text-primary overflow-hidden overflow-ellipsis whitespace-nowrap">
              更新嵌入 #{embed.id}
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
          <form onSubmit={handleUpdate}>
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              <WorkspaceSelection defaultValue={embed.workspace.id} />
              <ChatModeSelection defaultValue={embed.chat_mode} />
              <PermittedDomains
                defaultValue={
                  embed.allowlist_domains
                    ? JSON.parse(embed.allowlist_domains)
                    : []
                }
              />
              <NumberInput
                name="max_chats_per_day"
                title="每日最大聊天次数"
                hint="限制此嵌入聊天在 24 小时内可处理的聊天数量。零表示无限制。"
                defaultValue={embed.max_chats_per_day}
              />
              <NumberInput
                name="max_chats_per_session"
                title="每会话最大聊天次数"
                hint="限制会话用户在 24 小时内可发送的聊天数量。零表示无限制。"
                defaultValue={embed.max_chats_per_session}
              />
              <NumberInput
                name="message_limit"
                title="消息历史记录限制"
                hint="聊天上下文中包含的先前消息数量。默认为 20。"
                defaultValue={embed.message_limit}
              />
              <BooleanInput
                name="allow_model_override"
                title="启用动态模型使用"
                hint="允许设置首选 LLM 模型以覆盖工作区默认值。"
                defaultValue={embed.allow_model_override}
              />
              <BooleanInput
                name="allow_temperature_override"
                title="启用动态 LLM 温度"
                hint="允许设置 LLM 温度以覆盖工作区默认值。"
                defaultValue={embed.allow_temperature_override}
              />
              <BooleanInput
                name="allow_prompt_override"
                title="启用提示词覆盖"
                hint="允许设置系统提示词以覆盖工作区默认值。"
                defaultValue={embed.allow_prompt_override}
              />

              {error && <p className="text-red-400 text-sm">错误：{error}</p>}
              <p className="text-theme-text-primary text-opacity-60 text-xs md:text-sm">
                创建嵌入后，您将获得一个链接，可以通过简单的
                <code className="border-none bg-theme-settings-input-bg text-theme-text-primary mx-1 px-1 rounded-sm">
                  &lt;script&gt;
                </code>{" "}
                标签将其发布到您的网站上。
              </p>
            </div>
            <div className="flex justify-between items-center mt-6 pt-6 border-t border-theme-modal-border">
              <button
                onClick={closeModal}
                type="button"
                className="transition-all duration-300 text-theme-text-primary hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                type="submit"
                className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm"
              >
                更新嵌入
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
