/**
 * 测试统一文档访问层
 *
 * 运行方式: cd server && node scripts/maintenance/test-document-access.js
 */

const { getWorkspaceDocuments, getDocumentStatusReport, isDocumentVectorized } = require("../../utils/documentAccess");

async function main() {
  console.log("=== 测试统一文档访问层 ===\n");

  // 获取第一个有文档的工作区
  const prisma = require("../../utils/prisma");

  // 查找有文档的工作区
  const workspaceWithDocs = await prisma.workspace_documents.findFirst({
    select: { workspaceId: true },
  });

  if (!workspaceWithDocs) {
    console.log("❌ 没有找到任何文档，请先上传文档到知识库");
    await prisma.$disconnect();
    return;
  }

  const workspaceId = workspaceWithDocs.workspaceId;
  console.log(`📁 测试工作区 ID: ${workspaceId}\n`);

  // 测试 1: getWorkspaceDocuments
  console.log("--- 测试 1: getWorkspaceDocuments ---");
  try {
    const result = await getWorkspaceDocuments(workspaceId);
    console.log(`✅ 数据库文档数: ${result.totalInDb}`);
    console.log(`✅ 向量化完成数: ${result.vectorIndexed}`);
    console.log(`✅ 文档详情:`);
    result.documents.slice(0, 5).forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.filename} - ${doc.isVectorIndexed ? "✅ 已向量化" : "⏳ 待向量化"}`);
    });
    if (result.documents.length > 5) {
      console.log(`   ... 还有 ${result.documents.length - 5} 个文档`);
    }
  } catch (error) {
    console.error(`❌ 测试失败:`, error.message);
  }

  console.log("\n--- 测试 2: getDocumentStatusReport ---");
  try {
    const { consistent, report } = await getDocumentStatusReport(workspaceId);
    console.log(`✅ 数据一致: ${consistent ? "是" : "否"}`);
    console.log(`✅ 报告内容:\n${report}`);
  } catch (error) {
    console.error(`❌ 测试失败:`, error.message);
  }

  // 测试 3: isDocumentVectorized
  console.log("\n--- 测试 3: isDocumentVectorized ---");
  try {
    const { documents } = await getWorkspaceDocuments(workspaceId);
    if (documents.length > 0) {
      const testDoc = documents[0];
      const isVectorized = await isDocumentVectorized(testDoc.docId);
      console.log(`✅ 文档 "${testDoc.filename}" (${testDoc.docId})`);
      console.log(`   向量化状态: ${isVectorized ? "✅ 已向量化" : "⏳ 待向量化"}`);
      console.log(`   与 getWorkspaceDocuments 结果一致: ${isVectorized === testDoc.isVectorIndexed ? "✅ 是" : "❌ 否"}`);
    }
  } catch (error) {
    console.error(`❌ 测试失败:`, error.message);
  }

  // 测试 4: 边界情况 - 不存在的工作区
  console.log("\n--- 测试 4: 边界情况 (不存在的工作区) ---");
  try {
    const result = await getWorkspaceDocuments(99999);
    console.log(`✅ 返回空结果: totalInDb=${result.totalInDb}, vectorIndexed=${result.vectorIndexed}`);
  } catch (error) {
    console.error(`❌ 测试失败:`, error.message);
  }

  // 测试 5: 边界情况 - 无效的 docId
  console.log("\n--- 测试 5: 边界情况 (无效的 docId) ---");
  try {
    const isVectorized = await isDocumentVectorized("invalid-doc-id-12345");
    console.log(`✅ 无效 docId 返回: ${isVectorized}`);
  } catch (error) {
    console.error(`❌ 测试失败:`, error.message);
  }

  console.log("\n=== 测试完成 ===");
  await prisma.$disconnect();
}

main().catch(console.error);

