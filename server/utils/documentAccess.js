/**
 * 统一文档访问层
 *
 * 解决问题：不同模块（KnowledgeSensing、document-review、rag-memory）
 * 查询文档的数据源不一致，导致显示结果矛盾。
 *
 * 本模块提供统一的文档访问接口，同时返回数据库记录和向量化状态。
 *
 * @module documentAccess
 * @version 1.0.0
 */

const { Document } = require("../models/documents");
const prisma = require("./prisma");

/**
 * 统一的文档访问层 - 同时返回数据库记录和向量索引状态
 *
 * @param {number} workspaceId - 工作区 ID
 * @returns {Promise<{documents: Array, totalInDb: number, vectorIndexed: number}>}
 */
async function getWorkspaceDocuments(workspaceId) {
  // 1. 从 workspace_documents 表查询所有文档
  const dbDocuments = await Document.forWorkspace(workspaceId);

  if (dbDocuments.length === 0) {
    return {
      documents: [],
      totalInDb: 0,
      vectorIndexed: 0,
    };
  }

  // 2. 从 document_vectors 表查询已向量化的 docId 列表
  let vectorizedDocIds = new Set();
  try {
    const docIds = dbDocuments.map((d) => d.docId).filter(Boolean);
    if (docIds.length > 0) {
      const vectorRecords = await prisma.document_vectors.findMany({
        where: {
          docId: { in: docIds },
        },
        select: { docId: true },
        distinct: ["docId"],
      });
      vectorizedDocIds = new Set(vectorRecords.map((r) => r.docId));
    }
  } catch (error) {
    console.warn("[documentAccess] 无法获取向量化状态:", error.message);
    // 出错不影响主流程，继续返回数据库记录
  }

  // 3. 关联两者，标记向量化状态
  const documents = dbDocuments.map((doc) => ({
    ...doc,
    isVectorIndexed: vectorizedDocIds.has(doc.docId),
  }));

  return {
    documents,
    totalInDb: dbDocuments.length,
    vectorIndexed: vectorizedDocIds.size,
  };
}

/**
 * 获取文档状态差异报告
 *
 * @param {number} workspaceId - 工作区 ID
 * @returns {Promise<{consistent: boolean, report: string}>}
 */
async function getDocumentStatusReport(workspaceId) {
  const { documents, totalInDb, vectorIndexed } =
    await getWorkspaceDocuments(workspaceId);

  const notIndexed = documents.filter((d) => !d.isVectorIndexed);
  const consistent = totalInDb === vectorIndexed;

  const report = `
📊 文档状态报告 (Workspace ID: ${workspaceId})
- 数据库文档总数: ${totalInDb}
- 向量库已索引: ${vectorIndexed}
- 待索引文档: ${notIndexed.length}
${notIndexed.length > 0 ? `\n⚠️ 待索引文档:\n${notIndexed.map((d) => `  - ${d.filename}`).join("\n")}` : ""}
${consistent ? "✅ 数据一致" : "⚠️ 数据不一致，部分文档未向量化"}
  `.trim();

  return { consistent, report };
}

/**
 * 检查单个文档是否已向量化
 *
 * @param {string} docId - 文档 ID
 * @returns {Promise<boolean>}
 */
async function isDocumentVectorized(docId) {
  if (!docId) return false;

  try {
    const record = await prisma.document_vectors.findFirst({
      where: { docId },
      select: { id: true },
    });
    return !!record;
  } catch (error) {
    console.warn("[documentAccess] 检查向量化状态失败:", error.message);
    return false;
  }
}

module.exports = {
  getWorkspaceDocuments,
  getDocumentStatusReport,
  isDocumentVectorized,
};
