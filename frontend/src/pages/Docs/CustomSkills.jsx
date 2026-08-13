import React from "react";
import DocsLayout from "./DocsLayout";

/**
 * 自定义技能开发指南文档页面
 */
export default function CustomSkillsDocs() {
  return (
    <DocsLayout title="自定义技能开发指南">
      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-bold text-theme-text-primary mb-4">
            如何开发自定义 AI 员工技能
          </h2>
          <p className="text-theme-text-secondary mb-4">
            本指南适用于希望为 Octopus Studio 创建自定义 AI 员工技能的开发者。
          </p>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            前置要求
          </h3>
          <ul className="list-disc list-inside space-y-2 text-theme-text-secondary">
            <li>NodeJS 18+</li>
            <li>Yarn</li>
            <li>Octopus Studio 运行环境（Docker、本地开发或桌面版）</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            创建自定义技能的准则
          </h3>
          <ul className="list-disc list-inside space-y-2 text-theme-text-secondary">
            <li>自定义技能必须使用 JavaScript 编写，并在 NodeJS 环境中执行</li>
            <li>
              可以在技能文件夹中包含任何 NodeJS 包，但必须存在于文件夹结构中
            </li>
            <li>所有函数必须返回字符串值，其他类型可能会破坏 AI 员工调用</li>
            <li>
              应在技能根目录提供 README.md 文件，说明描述、额外要求和使用方法
            </li>
            <li>必须在根目录定义 plugin.json 文件来描述插件</li>
            <li>必须定义 handler.js 文件作为技能的入口点</li>
            <li>
              必须将整个技能包装在与 plugin.json 中 name 属性相同的文件夹中
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            热加载自定义技能
          </h3>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
            <p className="text-blue-400 text-sm">
              💡 如果在活动的 AI 员工调用期间修改技能，需要使用 /exit
              退出当前会话才能使更改生效。
              如果刚添加新技能，需要重新访问或刷新页面才能在 UI 中显示新技能。
            </p>
          </div>
          <p className="text-theme-text-secondary">
            Octopus Studio
            支持自定义技能的热加载。这意味着您可以修改技能并立即看到更改，
            无需重启 AI 员工或 Octopus Studio 实例。
          </p>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            自定义技能代码放置位置
          </h3>
          <p className="text-theme-text-secondary mb-4">
            所有 AI 员工技能必须放置在 Octopus Studio 存储目录的相应文件夹中。
            根据运行环境不同，位置也不同。
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                Docker 环境
              </h4>
              <p className="text-theme-text-secondary mb-2">
                存储目录应作为卷挂载在 Docker 容器启动命令中（STORAGE_LOCATION
                变量的值）。
              </p>
              <p className="text-theme-text-secondary">
                然后需要在存储目录中创建此子文件夹：
              </p>
              <code className="block bg-theme-bg-secondary p-3 rounded mt-2 text-sm">
                plugins/agent-skills
              </code>
            </div>

            <div>
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                本地开发环境
              </h4>
              <p className="text-theme-text-secondary mb-2">
                本地运行时，存储目录通常挂载在 server/storage 目录中。
              </p>
              <p className="text-theme-text-secondary">
                然后需要在存储目录中创建此子文件夹：
              </p>
              <code className="block bg-theme-bg-secondary p-3 rounded mt-2 text-sm">
                plugins/agent-skills
              </code>
            </div>

            <div>
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                桌面版
              </h4>
              <p className="text-theme-text-secondary mb-2">
                桌面版运行时，可以在应用设置中找到存储目录位置。
              </p>
              <p className="text-theme-text-secondary">
                然后需要在存储目录中创建此子文件夹：
              </p>
              <code className="block bg-theme-bg-secondary p-3 rounded mt-2 text-sm">
                plugins/agent-skills
              </code>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            文件结构
          </h3>
          <p className="text-theme-text-secondary mb-4">
            自定义技能应包装在与 plugin.json 中 hubId 属性相同的文件夹中。
          </p>
          <div className="bg-theme-bg-secondary p-4 rounded-lg">
            <p className="text-theme-text-secondary mb-2">示例 plugin.json：</p>
            <pre className="text-sm overflow-x-auto">
              {`{
  "name": "这是我的可读名称",
  "hubId": "my-custom-agent-skill" // 必须与父文件夹名称相同
}`}
            </pre>
          </div>
          <div className="bg-theme-bg-secondary p-4 rounded-lg mt-4">
            <p className="text-theme-text-secondary mb-2">文件夹结构：</p>
            <pre className="text-sm overflow-x-auto">
              {`plugins/agent-skills/my-custom-agent-skill
|-- plugin.json
|-- handler.js
|-- // 可以添加任何其他文件并在 handler.js 中引用！`}
            </pre>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            下一步
          </h3>
          <p className="text-theme-text-secondary">
            了解更多关于 plugin.json 和 handler.js 文件的详细信息， 请参考完整的
            API 文档或查看示例技能代码。
          </p>
        </section>
      </div>
    </DocsLayout>
  );
}
