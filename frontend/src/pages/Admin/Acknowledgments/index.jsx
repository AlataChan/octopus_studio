import { useEffect } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import { Heart, GithubLogo, Globe } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export default function Acknowledgments() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t("acknowledgments.page-title") || "致谢 - Octopus Studio";
  }, [t]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="flex items-center gap-x-4">
              <Heart size={32} className="text-red-500" weight="fill" />
              <div className="flex flex-col">
                <h3 className="text-theme-text-primary text-2xl font-semibold">
                  {t("acknowledgments.title") || "致谢"}
                </h3>
                <p className="text-theme-text-secondary text-sm">
                  {t("acknowledgments.subtitle") || "感谢开源社区的贡献"}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full flex flex-col gap-y-6 mt-6 max-w-4xl">
            {/* 主要致谢内容 */}
            <div className="bg-theme-bg-container rounded-xl p-6 border border-theme-border">
              <h4 className="text-theme-text-primary text-xl font-semibold mb-4 flex items-center gap-x-2">
                <GithubLogo size={24} weight="fill" />
                {t("acknowledgments.based-on") || "基于 AnythingLLM"}
              </h4>
              <div className="text-theme-text-secondary space-y-4 leading-relaxed">
                <p>
                  <strong className="text-theme-text-primary">
                    Octopus Studio
                  </strong>{" "}
                  是基于开源项目{" "}
                  <a
                    href="https://github.com/Mintplex-Labs/anything-llm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    AnythingLLM
                  </a>{" "}
                  进行修改和增强的企业级 AI 工作台。
                </p>
                <p>
                  AnythingLLM 是由{" "}
                  <a
                    href="https://mintplexlabs.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Mintplex Labs
                  </a>{" "}
                  开发的开源项目，采用 MIT 许可证发布。我们衷心感谢 Mintplex
                  Labs 团队及所有贡献者为开源社区做出的卓越贡献。
                </p>
                <p>
                  在 AnythingLLM 的坚实基础上，Octopus Studio
                  针对中国市场和企业需求进行了深度定制：
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    <strong className="text-theme-text-primary">
                      AI 员工库
                    </strong>
                    ：提供可复用的 AI 助手模板，支持一键雇佣和管理
                  </li>
                  <li>
                    <strong className="text-theme-text-primary">
                      中国本地化
                    </strong>
                    ：集成国内主流 LLM 提供商（DeepSeek、Moonshot
                    AI、智谱AI、MiniMax、硅基流动等）
                  </li>
                  <li>
                    <strong className="text-theme-text-primary">
                      多 Agent 编排
                    </strong>
                    ：支持 Level 1 隐形多智能体协作，实现复杂任务自动化
                  </li>
                  <li>
                    <strong className="text-theme-text-primary">
                      私有化部署
                    </strong>
                    ：完善的本地 LLM 支持和部署方案，确保数据安全
                  </li>
                </ul>
              </div>
            </div>

            {/* 开源许可 */}
            <div className="bg-theme-bg-container rounded-xl p-6 border border-theme-border">
              <h4 className="text-theme-text-primary text-xl font-semibold mb-4">
                {t("acknowledgments.license") || "开源许可"}
              </h4>
              <div className="text-theme-text-secondary space-y-3 leading-relaxed">
                <p>
                  Octopus Studio 遵循 AnythingLLM 的{" "}
                  <a
                    href="https://github.com/Mintplex-Labs/anything-llm/blob/master/LICENSE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline font-mono"
                  >
                    MIT License
                  </a>{" "}
                  开源协议。我们承诺保持开源精神，并将持续回馈社区。
                </p>
                <p className="text-sm text-theme-text-secondary/80 font-mono bg-theme-bg-secondary p-4 rounded-lg">
                  Copyright © 2024 Mintplex Labs, Inc.
                  <br />
                  Copyright © 2025 Octopus Studio Team
                </p>
              </div>
            </div>

            {/* 相关链接 */}
            <div className="bg-theme-bg-container rounded-xl p-6 border border-theme-border">
              <h4 className="text-theme-text-primary text-xl font-semibold mb-4 flex items-center gap-x-2">
                <Globe size={24} />
                {t("acknowledgments.links") || "相关链接"}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                  href="https://github.com/Mintplex-Labs/anything-llm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-x-3 p-4 bg-theme-bg-secondary rounded-lg hover:bg-theme-bg-secondary/80 transition-colors border border-white/5"
                >
                  <GithubLogo size={24} className="text-theme-text-primary" />
                  <div>
                    <div className="text-theme-text-primary font-medium">
                      AnythingLLM GitHub
                    </div>
                    <div className="text-theme-text-secondary text-sm">
                      查看源代码
                    </div>
                  </div>
                </a>
                <a
                  href="https://github.com/AlataChan/octopus_studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-x-3 p-4 bg-theme-bg-secondary rounded-lg hover:bg-theme-bg-secondary/80 transition-colors border border-white/5"
                >
                  <Globe size={24} className="text-theme-text-primary" />
                  <div>
                    <div className="text-theme-text-primary font-medium">
                      AnythingLLM 文档
                    </div>
                    <div className="text-theme-text-secondary text-sm">
                      官方文档
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
