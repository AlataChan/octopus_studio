import AgentWebSearchSelection from "./WebSearchSelection";
import AgentSQLConnectorSelection from "./SQLConnectorSelection";
import GenericSkillPanel from "./GenericSkillPanel";
import DefaultSkillPanel from "./DefaultSkillPanel";
import AlwaysOnSkillPanel from "./AlwaysOnSkillPanel";
import {
  Brain,
  File,
  Browser,
  ChartBar,
  FileMagnifyingGlass,
  Clock,
  FileXls,
  Presentation,
  FilePdf,
  FileDoc,
  Database,
  ImageSquare,
} from "@phosphor-icons/react";
import RAGImage from "@/media/agents/rag-memory.png";
import SummarizeImage from "@/media/agents/view-summarize.png";
import ScrapeWebsitesImage from "@/media/agents/scrape-websites.png";
import GenerateChartsImage from "@/media/agents/generate-charts.png";
import GenerateSaveImages from "@/media/agents/generate-save-files.png";

/**
 * 始终启用的技能 - Layer 1 (系统级) + Layer 2 (输出级)
 * 这些技能不可关闭，是所有 Agent 的基础能力
 */
export const alwaysOnSkills = {
  // Layer 1: 系统级工具
  "datetime-info": {
    title: "时间感知",
    description: "让 Agent 知道当前的日期和时间，这是 LLM 的固有限制补充。",
    component: AlwaysOnSkillPanel,
    icon: Clock,
    skill: "datetime-info",
    layer: 1,
  },
  // Layer 2: 输出级工具
  "save-file-to-browser": {
    title: "生成并保存文件",
    description: "允许 Agent 生成文件并保存到您的计算机。",
    component: AlwaysOnSkillPanel,
    skill: "save-file-to-browser",
    icon: FileMagnifyingGlass,
    image: GenerateSaveImages,
    layer: 2,
  },
  "create-chart": {
    title: "生成图表",
    description: "根据数据生成各种类型的可视化图表。",
    component: AlwaysOnSkillPanel,
    skill: "create-chart",
    icon: ChartBar,
    image: GenerateChartsImage,
    layer: 2,
  },
  "generate-excel-report": {
    title: "生成 Excel",
    description: "生成 Excel 电子表格报告。",
    component: AlwaysOnSkillPanel,
    skill: "generate-excel-report",
    icon: FileXls,
    layer: 2,
  },
  "generate-presentation": {
    title: "生成 PPT",
    description: "生成 PowerPoint 演示文稿。",
    component: AlwaysOnSkillPanel,
    skill: "generate-presentation",
    icon: Presentation,
    layer: 2,
  },
  "generate-pdf-document": {
    title: "生成 PDF",
    description: "生成 PDF 文档。",
    component: AlwaysOnSkillPanel,
    skill: "generate-pdf-document",
    icon: FilePdf,
    layer: 2,
  },
  "generate-official-document": {
    title: "生成 Word",
    description: "生成 Word 公文文档。",
    component: AlwaysOnSkillPanel,
    skill: "generate-official-document",
    icon: FileDoc,
    layer: 2,
  },
};

/**
 * 默认启用的技能 - 可关闭
 * 这些是核心能力，默认开启但用户可以关闭
 */
export const defaultSkills = {
  "rag-memory": {
    title: "RAG 与长期记忆",
    description:
      '允许 Agent 利用您的本地文档来回答查询，或要求 Agent "记住"内容片段以进行长期记忆检索。',
    component: DefaultSkillPanel,
    icon: Brain,
    image: RAGImage,
    skill: "rag-memory",
  },
  "document-summarizer": {
    title: "查看和总结文档",
    description: "允许 Agent 列出并总结当前嵌入的工作区文件内容。",
    component: DefaultSkillPanel,
    icon: File,
    image: SummarizeImage,
    skill: "document-summarizer",
  },
  "web-scraping": {
    title: "抓取网站",
    description: "允许 Agent 访问并抓取网站内容。",
    component: DefaultSkillPanel,
    icon: Browser,
    image: ScrapeWebsitesImage,
    skill: "web-scraping",
  },
  "duckdb-agent": {
    title: "数据文件分析",
    description: "允许 Agent 分析上传的 CSV/Excel 文件，执行 SQL 查询。",
    component: DefaultSkillPanel,
    icon: Database,
    skill: "duckdb-agent",
  },
};

/**
 * 需要配置的技能 - 默认关闭
 * 这些技能需要额外配置（API Key、数据库连接等）才能使用
 */
export const configurableSkills = {
  "web-browsing": {
    title: "网络搜索",
    component: AgentWebSearchSelection,
    skill: "web-browsing",
  },
  "sql-agent": {
    title: "SQL 连接器",
    component: AgentSQLConnectorSelection,
    skill: "sql-agent",
  },
  "visual-generate": {
    title: "视觉生成",
    description:
      "允许 Agent 调用本机视觉生成边车生成图片或视频。需要先启动 yarn dev:visual 并在边车环境配置 provider key；高成本任务会引导到 /visual 页面确认。",
    component: GenericSkillPanel,
    icon: ImageSquare,
    image: GenerateChartsImage,
    skill: "visual-generate",
  },
};
