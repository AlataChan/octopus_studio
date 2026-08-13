/**
 * 用户偏好 API 端点
 *
 * Phase 1 任务 2: 用户偏好 (3字段)
 *
 * @module endpoints/api/userPreferences
 */

const {
  validApiKeyOrSession,
} = require("../../utils/middleware/validApiKeyOrSession");
const { userFromSession } = require("../../utils/http");
const { User } = require("../../models/user");
const {
  UserPreferences,
  PREFERENCE_FIELDS,
} = require("../../utils/memory/userPreferences");

/**
 * 从请求中获取用户（支持 Session Token 和 API Key 两种方式）
 * @param {Request} request - Express 请求对象
 * @param {Response} response - Express 响应对象
 * @returns {Promise<Object|null>} 用户对象或 null
 */
async function getUserFromRequest(request, response) {
  // 优先从 session 获取用户
  const sessionUser = await userFromSession(request, response);
  if (sessionUser) return sessionUser;

  // 从 API Key 获取关联用户（如果有）
  const apiKey = response.locals.apiKey;
  if (apiKey && apiKey.createdBy) {
    const user = await User.get({ id: apiKey.createdBy });
    if (user) return user;
  }

  // 如果是多用户模式但没有用户信息，返回 null
  if (response.locals.multiUserMode) {
    return null;
  }

  // 单用户模式，返回默认用户 ID
  return { id: 1 };
}

/**
 * 注册用户偏好相关的 API 端点
 * @param {Express} app - Express 应用实例
 */
function userPreferencesEndpoints(app) {
  if (!app) return;

  /**
   * GET /api/v1/user/preferences
   * 获取当前用户的偏好设置
   */
  app.get(
    "/v1/user/preferences",
    [validApiKeyOrSession],
    async (request, response) => {
      try {
        const user = await getUserFromRequest(request, response);
        if (!user) {
          return response.status(401).json({
            success: false,
            error: "Unauthorized - User not found",
          });
        }

        const preferences = await UserPreferences.getPreferences(user.id);

        response.status(200).json({
          success: true,
          preferences,
        });
      } catch (error) {
        console.error(
          "[UserPreferences API] Error getting preferences:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/user/preferences/fields
   * 获取偏好字段定义（用于前端渲染表单）
   */
  app.get(
    "/v1/user/preferences/fields",
    [validApiKeyOrSession],
    async (_request, response) => {
      try {
        response.status(200).json({
          success: true,
          fields: PREFERENCE_FIELDS,
        });
      } catch (error) {
        console.error("[UserPreferences API] Error getting fields:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * PATCH /api/v1/user/preferences
   * 更新当前用户的偏好设置
   */
  app.patch(
    "/v1/user/preferences",
    [validApiKeyOrSession],
    async (request, response) => {
      try {
        const user = await getUserFromRequest(request, response);
        if (!user) {
          return response.status(401).json({
            success: false,
            error: "Unauthorized - User not found",
          });
        }

        const updates = request.body;

        if (!updates || Object.keys(updates).length === 0) {
          return response.status(400).json({
            success: false,
            error: "No updates provided",
          });
        }

        const preferences = await UserPreferences.updatePreferences(
          user.id,
          updates
        );

        response.status(200).json({
          success: true,
          preferences,
        });
      } catch (error) {
        console.error(
          "[UserPreferences API] Error updating preferences:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/user/preferences/reset
   * 重置用户偏好为默认值
   */
  app.post(
    "/v1/user/preferences/reset",
    [validApiKeyOrSession],
    async (request, response) => {
      try {
        const user = await getUserFromRequest(request, response);
        if (!user) {
          return response.status(401).json({
            success: false,
            error: "Unauthorized - User not found",
          });
        }

        const preferences = await UserPreferences.resetPreferences(user.id);

        response.status(200).json({
          success: true,
          preferences,
          message: "Preferences reset to defaults",
        });
      } catch (error) {
        console.error(
          "[UserPreferences API] Error resetting preferences:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { userPreferencesEndpoints };
