import React, { useEffect, useRef, useState } from "react";
import illustration from "@/media/illustrations/create-workspace.png";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { useNavigate } from "react-router-dom";
import Workspace from "@/models/workspace";
import { useTranslation } from "react-i18next";

export default function CreateWorkspace({
  setHeader,
  setForwardBtn,
  setBackBtn,
}) {
  const { t } = useTranslation();
  const [workspaceName, setWorkspaceName] = useState("");
  const navigate = useNavigate();
  const createWorkspaceRef = useRef();
  const TITLE = t("onboarding.workspace.title");
  const DESCRIPTION = t("onboarding.workspace.description");

  useEffect(() => {
    setHeader({ title: TITLE, description: DESCRIPTION });
    setBackBtn({ showing: false, disabled: false, onClick: handleBack });
  }, []);

  useEffect(() => {
    if (workspaceName.length > 0) {
      setForwardBtn({ showing: true, disabled: false, onClick: handleForward });
    } else {
      setForwardBtn({ showing: true, disabled: true, onClick: handleForward });
    }
  }, [workspaceName]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const { workspace, error } = await Workspace.new({
      name: form.get("name"),
      onboardingComplete: true,
    });
    if (!!workspace) {
      showToast(
        "🎉 Onboarding 完成！Workspace 创建成功，请登录开始使用",
        "success",
        { autoClose: 5000 }
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // 跳转到登录页面，让用户手动登录
      navigate(paths.login());
    } else {
      showToast(`Failed to create workspace: ${error}`, "error");
    }
  };

  function handleForward() {
    createWorkspaceRef.current.click();
  }

  function handleBack() {
    navigate(paths.onboarding.survey());
  }

  return (
    <form
      onSubmit={handleCreate}
      className="w-full flex items-center justify-center flex-col gap-y-2"
    >
      <img src={illustration} alt="Create workspace" />
      <div className="flex flex-col gap-y-4 w-full max-w-[600px]">
        {" "}
        <div className="w-full mt-4">
          <label
            htmlFor="name"
            className="block mb-3 text-sm font-medium text-theme-text-primary"
          >
            {t("common.workspaces-name")}
          </label>
          <input
            name="name"
            type="text"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary focus:outline-primary-button active:outline-primary-button placeholder:text-theme-settings-input-placeholder outline-none text-sm rounded-lg block w-full p-2.5"
            placeholder="My Workspace"
            required={true}
            autoComplete="off"
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        </div>
        {/* 下一步引导 */}
        <div className="mt-6 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="text-blue-400 font-semibold mb-3 text-lg">
            📋 下一步
          </h3>
          <p className="text-theme-text-primary text-sm mb-4">
            完成 Workspace 创建后，您将被引导到登录页面。请使用您在 Onboarding
            中设置的凭据登录。
          </p>
          <div className="space-y-2 text-theme-text-primary text-sm">
            <p className="font-medium">登录后，您可以：</p>
            <ul className="list-disc list-inside space-y-1 text-white/80 ml-2">
              <li>创建更多用户（管理员功能）</li>
              <li>生成邀请链接邀请团队成员</li>
              <li>浏览和雇佣 AI 助手</li>
              <li>开始使用 Octopus Studio</li>
            </ul>
          </div>
        </div>
      </div>
      <button
        type="submit"
        ref={createWorkspaceRef}
        hidden
        aria-hidden="true"
      ></button>
    </form>
  );
}
