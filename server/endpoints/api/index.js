let useSwagger = () => {};
try {
  // Optional in packaged builds: missing swagger assets should not crash the server.
  // Swagger is only used for `/api/docs`.
  ({ useSwagger } = require("../../swagger/utils"));
} catch (e) {
  console.warn(
    `[swagger] Disabled (failed to load swagger utils): ${e?.message || e}`
  );
}
const { apiAdminEndpoints } = require("./admin");
const { apiAuthEndpoints } = require("./auth");
const { apiDocumentEndpoints } = require("./document");
const { apiSystemEndpoints } = require("./system");
const {
  apiWorkspaceEndpoints,
  knowledgeGraphEndpoints,
} = require("./workspace");
const { apiWorkspaceThreadEndpoints } = require("./workspaceThread");
const { apiUserManagementEndpoints } = require("./userManagement");
const { apiOpenAICompatibleEndpoints } = require("./openai");
const { apiResponsesEndpoints } = require("./responses");
const { apiEmbedEndpoints } = require("./embed");
// V1.5 计费系统 API
const { apiBillingEndpoints } = require("./billing");
const { apiApiKeysEndpoints } = require("./apiKeys");
const { apiNotificationsEndpoints } = require("./notifications");
// Phase 1: Episode 记忆管理 API
const { episodeEndpoints } = require("./episodes");
// Phase 1: 用户偏好 API
const { userPreferencesEndpoints } = require("./userPreferences");
// Phase 1: 手动记忆 API
const { memoriesEndpoints } = require("./memories");
// Phase 1: 记忆监控 API
const { memoryStatsEndpoints } = require("./memoryStats");
// Phase 2: 工作记忆 API
const { workingMemoryEndpoints } = require("./workingMemory");

// All endpoints must be documented and pass through the validApiKey Middleware.
// How to JSDoc an endpoint
// https://www.npmjs.com/package/swagger-autogen#openapi-3x
function developerEndpoints(app, router) {
  if (!router) return;
  useSwagger(app);
  apiAuthEndpoints(router);
  apiAdminEndpoints(router);
  apiSystemEndpoints(router);
  apiWorkspaceEndpoints(router);
  // 知识图谱 API
  knowledgeGraphEndpoints(router);
  apiDocumentEndpoints(router);
  apiWorkspaceThreadEndpoints(router);
  apiUserManagementEndpoints(router);
  apiOpenAICompatibleEndpoints(router);
  apiResponsesEndpoints(router);
  apiEmbedEndpoints(router);
  // V1.5 计费系统 API
  apiBillingEndpoints(router);
  apiApiKeysEndpoints(router);
  apiNotificationsEndpoints(router);
  // Phase 1: Episode 记忆管理 API
  episodeEndpoints(router);
  // Phase 1: 用户偏好 API
  userPreferencesEndpoints(router);
  // Phase 1: 手动记忆 API
  memoriesEndpoints(router);
  // Phase 1: 记忆监控 API
  memoryStatsEndpoints(router);
  // Phase 2: 工作记忆 API
  workingMemoryEndpoints(router);
}

module.exports = { developerEndpoints };
