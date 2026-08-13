import React from "react";
import DocsLayout from "./DocsLayout";

/**
 * MCP 服务器文档页面
 */
export default function MCPServersDocs() {
  return (
    <DocsLayout title="MCP 服务器指南">
      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-bold text-theme-text-primary mb-4">
            什么是 MCP？
          </h2>
          <p className="text-theme-text-secondary mb-4">
            MCP（Model Context Protocol，模型上下文协议）是由 Anthropic
            开发的开放协议， 用于在 AI 应用程序和外部数据源之间建立标准化连接。
          </p>
          <p className="text-theme-text-secondary">
            通过 MCP，Octopus Studio 可以安全地连接到各种外部服务和数据源， 为 AI
            员工提供更丰富的上下文和能力。
          </p>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            MCP 的核心优势
          </h3>
          <ul className="list-disc list-inside space-y-2 text-theme-text-secondary">
            <li>标准化的连接协议，无需为每个服务编写自定义集成</li>
            <li>安全的数据访问控制和权限管理</li>
            <li>支持多种传输方式（StdIO、SSE、Streamable）</li>
            <li>可扩展的架构，易于添加新的数据源</li>
            <li>与 AI 员工无缝集成</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            配置 MCP 服务器
          </h3>
          <p className="text-theme-text-secondary mb-4">
            MCP 服务器通过配置文件进行管理。配置文件位于：
          </p>
          <code className="block bg-theme-bg-secondary p-3 rounded text-sm mb-4">
            anythingllm_mcp_servers.json
          </code>
          <p className="text-theme-text-secondary mb-4">配置文件结构示例：</p>
          <div className="bg-theme-bg-secondary p-4 rounded-lg">
            <pre className="text-sm overflow-x-auto">
              {`{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "your-api-key"
      },
      "transport": "stdio",
      "autostart": true
    }
  }
}`}
            </pre>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            MCP 管理界面
          </h3>
          <p className="text-theme-text-secondary mb-4">
            Octopus Studio 提供了图形化的 MCP 管理界面，您可以：
          </p>
          <ul className="list-disc list-inside space-y-2 text-theme-text-secondary">
            <li>查看所有已配置的 MCP 服务器</li>
            <li>查看每个服务器的状态（运行中/已停止）</li>
            <li>启动或停止 MCP 服务器</li>
            <li>查看服务器日志和错误信息</li>
            <li>测试服务器连接</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            支持的传输类型
          </h3>
          <div className="space-y-4">
            <div className="bg-theme-bg-secondary p-4 rounded-lg">
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                StdIO（标准输入输出）
              </h4>
              <p className="text-theme-text-secondary mb-2">
                最常用的传输方式，通过标准输入输出流与 MCP 服务器通信。
              </p>
              <p className="text-sm text-theme-text-secondary">
                适用于：本地进程、命令行工具
              </p>
            </div>

            <div className="bg-theme-bg-secondary p-4 rounded-lg">
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                SSE（Server-Sent Events）
              </h4>
              <p className="text-theme-text-secondary mb-2">
                基于 HTTP 的单向通信，服务器可以主动推送事件到客户端。
              </p>
              <p className="text-sm text-theme-text-secondary">
                适用于：远程服务、实时数据流
              </p>
            </div>

            <div className="bg-theme-bg-secondary p-4 rounded-lg">
              <h4 className="text-lg font-medium text-theme-text-primary mb-2">
                Streamable
              </h4>
              <p className="text-theme-text-secondary mb-2">
                支持双向流式通信，适合需要持续交互的场景。
              </p>
              <p className="text-sm text-theme-text-secondary">
                适用于：实时协作、长时间运行的任务
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            自动启动控制
          </h3>
          <p className="text-theme-text-secondary mb-4">
            默认情况下，所有 MCP 服务器会在 Octopus Studio 启动时自动启动。
            如果您希望手动控制某个服务器的启动，可以在配置中设置：
          </p>
          <div className="bg-theme-bg-secondary p-4 rounded-lg">
            <pre className="text-sm overflow-x-auto">
              {`{
  "mcpServers": {
    "my-server": {
      ...
      "autostart": false  // 禁用自动启动
    }
  }
}`}
            </pre>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            常见 MCP 服务器示例
          </h3>
          <div className="space-y-3">
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                文件系统访问
              </h5>
              <p className="text-sm text-theme-text-secondary">
                允许 AI 员工读取和写入本地文件系统
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                数据库连接
              </h5>
              <p className="text-sm text-theme-text-secondary">
                连接到 PostgreSQL、MySQL 等数据库进行查询
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                API 集成
              </h5>
              <p className="text-sm text-theme-text-secondary">
                与第三方 API 服务集成（如 GitHub、Slack 等）
              </p>
            </div>
            <div className="bg-theme-bg-secondary p-3 rounded">
              <h5 className="font-medium text-theme-text-primary mb-1">
                搜索引擎
              </h5>
              <p className="text-sm text-theme-text-secondary">
                提供网络搜索、企业内部搜索等能力
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            安全最佳实践
          </h3>
          <ul className="list-disc list-inside space-y-2 text-theme-text-secondary">
            <li>不要在配置文件中硬编码敏感信息（如 API 密钥）</li>
            <li>使用环境变量来管理凭证</li>
            <li>定期审查 MCP 服务器的访问权限</li>
            <li>监控服务器日志以发现异常活动</li>
            <li>仅启用必要的 MCP 服务器</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-theme-text-primary mb-3">
            故障排查
          </h3>
          <div className="space-y-3">
            <div>
              <h5 className="font-medium text-theme-text-primary mb-1">
                服务器无法启动
              </h5>
              <p className="text-sm text-theme-text-secondary">
                检查配置文件语法、命令路径是否正确、环境变量是否设置
              </p>
            </div>
            <div>
              <h5 className="font-medium text-theme-text-primary mb-1">
                连接超时
              </h5>
              <p className="text-sm text-theme-text-secondary">
                确认网络连接、防火墙设置、服务器地址是否正确
              </p>
            </div>
            <div>
              <h5 className="font-medium text-theme-text-primary mb-1">
                权限错误
              </h5>
              <p className="text-sm text-theme-text-secondary">
                检查文件系统权限、API 密钥有效性、用户角色配置
              </p>
            </div>
          </div>
        </section>
      </div>
    </DocsLayout>
  );
}
