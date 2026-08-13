import React from "react";
import DocsLayout from "./DocsLayout";

/**
 * AI 员工流程文档页面
 */
export default function AgentFlowsDocs() {
  return (
    <DocsLayout title="AI 员工流程指南">
      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-bold text-theme-text-primary mb-4">
            什么是 AI 员工流程？
          </h2>
          <p className="text-theme-text-secondary mb-4">
            AI 员工流程（Agent Flows）是一种可视化的工作流编排工具，
            允许您创建复杂的多步骤 AI 任务流程，无需编写代码。
          </p>
          <p className="text-theme-text-secondary">
            通过流程构建器，您可以定义 AI 员工如何处理任务、调用工具、
            处理数据以及与其他系统集成。
          </p>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            访问流程构建器
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-theme-text-secondary">
            <li>导航到 设置 → AI 员工技能 页面</li>
            <li>找到"AI 员工流程"部分</li>
            <li>点击"新建流程"按钮打开流程构建器</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            理解画布
          </h3>
          <p className="text-theme-text-secondary mb-4">
            流程构建器画布是您设计和组织 AI 员工工作流的地方。
            画布提供了一个可视化界面，用于连接不同的流程块。
          </p>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-blue-400 text-sm">
              💡 提示：使用鼠标拖拽来移动画布，使用滚轮缩放视图。
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            默认流程块
          </h3>
          <p className="text-theme-text-secondary mb-4">
            每个新流程都包含三个默认块：
          </p>

          <div className="space-y-4">
            <div className="bg-theme-bg-secondary p-4 rounded-lg">
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                1. 流程信息块
              </h4>
              <p className="text-theme-text-secondary">
                定义流程的基本信息，包括名称、描述和触发条件。
                这是流程的入口点。
              </p>
            </div>

            <div className="bg-theme-bg-secondary p-4 rounded-lg">
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                2. 流程变量块
              </h4>
              <p className="text-theme-text-secondary">
                定义在整个流程中可以使用的变量。
                这些变量可以在不同的流程块之间传递数据。
              </p>
            </div>

            <div className="bg-theme-bg-secondary p-4 rounded-lg">
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                3. 流程完成块
              </h4>
              <p className="text-theme-text-secondary">
                标记流程的结束点。可以定义流程完成后返回的结果。
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            添加新块
          </h3>
          <p className="text-theme-text-secondary mb-4">要向流程添加新块：</p>
          <ol className="list-decimal list-inside space-y-2 text-theme-text-secondary">
            <li>点击画布左侧的"添加块"按钮</li>
            <li>从可用块列表中选择一个块类型</li>
            <li>将块拖拽到画布上的所需位置</li>
            <li>配置块的参数和设置</li>
            <li>连接块的输入和输出端口</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            可用的流程块类型
          </h3>
          <div className="space-y-3">
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                LLM 调用块
              </h5>
              <p className="text-sm text-theme-text-secondary">
                调用大语言模型进行文本生成、分析或转换
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                工具调用块
              </h5>
              <p className="text-sm text-theme-text-secondary">
                执行特定的工具或技能，如网络搜索、文档检索等
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                条件判断块
              </h5>
              <p className="text-sm text-theme-text-secondary">
                根据条件分支流程执行路径
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                数据转换块
              </h5>
              <p className="text-sm text-theme-text-secondary">
                处理和转换数据格式
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                子流程块
              </h5>
              <p className="text-sm text-theme-text-secondary">
                调用另一个已定义的流程作为子任务
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            保存和管理流程
          </h3>
          <p className="text-theme-text-secondary mb-4">完成流程设计后：</p>
          <ol className="list-decimal list-inside space-y-2 text-theme-text-secondary">
            <li>点击右上角的"保存"按钮保存流程</li>
            <li>为流程命名并添加描述</li>
            <li>流程将出现在"AI 员工流程"列表中</li>
            <li>可以在 AI 员工配置中选择使用此流程</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            最佳实践
          </h3>
          <ul className="list-disc list-inside space-y-2 text-theme-text-secondary">
            <li>为流程和块使用清晰、描述性的名称</li>
            <li>添加注释说明复杂的逻辑</li>
            <li>使用变量来避免重复配置</li>
            <li>测试流程的各种输入场景</li>
            <li>定期备份重要的流程配置</li>
          </ul>
        </section>
      </div>
    </DocsLayout>
  );
}
