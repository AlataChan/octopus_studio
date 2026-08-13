process.env.NODE_ENV === "development"
  ? require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` })
  : require("dotenv").config();
const { viewLocalFiles, normalizePath, isWithin } = require("../utils/files");
const { purgeDocument, purgeFolder } = require("../utils/files/purgeDocument");
const { getVectorDbClass } = require("../utils/helpers");
const { updateENV, dumpENV } = require("../utils/helpers/updateENV");
const {
  reqBody,
  makeJWT,
  userFromSession,
  multiUserMode,
  queryParams,
} = require("../utils/http");
const {
  handleAssetUpload,
  handleIconUpload,
  handlePfpUpload,
} = require("../utils/files/multer");
const {
  generateAppIconSet,
  fetchAppIcon,
  removeAppIconSet,
  currentAppIcon,
  isValidSizeKey,
} = require("../utils/files/appIcon");
const { v4 } = require("uuid");
const { SystemSettings } = require("../models/systemSettings");
const { User } = require("../models/user");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { Workspace } = require("../models/workspace");
const fs = require("fs");
const path = require("path");
const {
  getDefaultFilename,
  determineLogoFilepath,
  fetchLogo,
  validFilename,
  renameLogoFile,
  removeCustomLogo,
  LOGO_FILENAME,
  isDefaultFilename,
} = require("../utils/files/logo");
const { Telemetry } = require("../models/telemetry");
const { WelcomeMessages } = require("../models/welcomeMessages");
const { ApiKey } = require("../models/apiKeys");
const { getCustomModels } = require("../utils/helpers/customModels");
const { WorkspaceChats } = require("../models/workspaceChats");
const {
  flexUserRoleValid,
  ROLES,
  isMultiUserSetup,
} = require("../utils/middleware/multiUserProtected");
const { fetchPfp, determinePfpFilepath } = require("../utils/files/pfp");
const { exportChatsAsType } = require("../utils/helpers/chat/convertTo");
const { EventLogs } = require("../models/eventLogs");
const { CollectorApi } = require("../utils/collectorApi");
const {
  recoverAccount,
  resetPassword,
  generateRecoveryCodes,
} = require("../utils/PasswordRecovery");
const { SlashCommandPresets } = require("../models/slashCommandsPresets");
const { EncryptionManager } = require("../utils/EncryptionManager");
const { isDesktopSingleUserNoAuthRuntime } = require("../utils/authRuntime");
const { BrowserExtensionApiKey } = require("../models/browserExtensionApiKey");
const {
  chatHistoryViewable,
} = require("../utils/middleware/chatHistoryViewable");
const {
  simpleSSOEnabled,
  simpleSSOLoginDisabled,
} = require("../utils/middleware/simpleSSOEnabled");
const { TemporaryAuthToken } = require("../models/temporaryAuthToken");
const { SystemPromptVariables } = require("../models/systemPromptVariables");
const { VALID_COMMANDS } = require("../utils/chats");
const bcrypt = require("bcryptjs");
const { authLimiter, strictLimiter } = require("../middleware/rateLimiter");

/**
 * 预计算 AUTH_TOKEN 的 bcrypt hash（启动时计算一次，避免每次登录请求重复计算）
 * bcrypt.hashSync 每次需要约 100-300ms，这会严重影响认证性能
 * @type {string|null}
 */
let cachedAuthTokenHash = null;

/**
 * 获取预计算的 AUTH_TOKEN hash（用于单用户模式登录验证）
 * @returns {string|null}
 */
function getAuthTokenHash() {
  if (cachedAuthTokenHash) return cachedAuthTokenHash;
  if (process.env.AUTH_TOKEN) {
    cachedAuthTokenHash = bcrypt.hashSync(process.env.AUTH_TOKEN, 10);
  }
  return cachedAuthTokenHash;
}

function systemEndpoints(app) {
  if (!app) return;

  app.get("/ping", (_, response) => {
    response.status(200).json({ online: true });
  });

  app.get("/migrate", async (_, response) => {
    response.sendStatus(200);
  });

  app.get("/env-dump", async (_, response) => {
    if (process.env.NODE_ENV !== "production")
      return response.sendStatus(200).end();
    dumpENV();
    response.sendStatus(200).end();
  });

  app.get("/setup-complete", async (_, response) => {
    try {
      const results = await SystemSettings.currentSettings();
      response.status(200).json({ results });
    } catch (e) {
      console.error(e.message, e);
      response.sendStatus(500).end();
    }
  });

  app.get(
    "/system/check-token",
    [validatedRequest],
    async (request, response) => {
      try {
        if (multiUserMode(response)) {
          const user = await userFromSession(request, response);
          if (!user || user.suspended) {
            response.sendStatus(403).end();
            return;
          }

          response.sendStatus(200).end();
          return;
        }

        response.sendStatus(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // 认证接口应用严格限流（15分钟内最多10次请求，防止暴力破解）
  app.post("/request-token", [authLimiter], async (request, response) => {
    try {
      const isMultiUserMode = await SystemSettings.isMultiUserMode();
      if (
        isDesktopSingleUserNoAuthRuntime({ multiUserMode: isMultiUserMode })
      ) {
        response.status(200).json({
          valid: true,
          token: null,
          message:
            "Authentication is not required for desktop single-user runtime.",
        });
        return;
      }

      if (process.env.NODE_ENV !== "development" && !process.env.JWT_SECRET) {
        response.status(500).json({
          valid: false,
          token: null,
          message:
            "Server misconfigured: JWT_SECRET is unset. Set JWT_SECRET before running in production.",
        });
        return;
      }

      if (isMultiUserMode) {
        if (simpleSSOLoginDisabled()) {
          response.status(403).json({
            user: null,
            valid: false,
            token: null,
            message:
              "[005] Login via credentials has been disabled by the administrator.",
          });
          return;
        }

        const { username, password } = reqBody(request);
        const existingUser = await User._get({ username: String(username) });

        if (!existingUser) {
          await EventLogs.logEvent(
            "failed_login_invalid_username",
            {
              ip: request.ip || "Unknown IP",
              username: username || "Unknown user",
            },
            existingUser?.id
          );
          response.status(200).json({
            user: null,
            valid: false,
            token: null,
            message: "[001] Invalid login credentials.",
          });
          return;
        }

        if (!bcrypt.compareSync(String(password), existingUser.password)) {
          await EventLogs.logEvent(
            "failed_login_invalid_password",
            {
              ip: request.ip || "Unknown IP",
              username: username || "Unknown user",
            },
            existingUser?.id
          );
          response.status(200).json({
            user: null,
            valid: false,
            token: null,
            message: "[002] Invalid login credentials.",
          });
          return;
        }

        if (existingUser.suspended) {
          await EventLogs.logEvent(
            "failed_login_account_suspended",
            {
              ip: request.ip || "Unknown IP",
              username: username || "Unknown user",
            },
            existingUser?.id
          );
          response.status(200).json({
            user: null,
            valid: false,
            token: null,
            message: "[004] Account suspended by admin.",
          });
          return;
        }

        await Telemetry.sendTelemetry(
          "login_event",
          { multiUserMode: false },
          existingUser?.id
        );

        await EventLogs.logEvent(
          "login_event",
          {
            ip: request.ip || "Unknown IP",
            username: existingUser.username || "Unknown user",
          },
          existingUser?.id
        );

        // Generate a session token for the user then check if they have seen the recovery codes
        // and if not, generate recovery codes and return them to the frontend.
        const sessionToken = makeJWT(
          { id: existingUser.id, username: existingUser.username },
          process.env.JWT_EXPIRY
        );
        if (!existingUser.seen_recovery_codes) {
          const plainTextCodes = await generateRecoveryCodes(existingUser.id);
          response.status(200).json({
            valid: true,
            user: User.filterFields(existingUser),
            token: sessionToken,
            message: null,
            recoveryCodes: plainTextCodes,
          });
          return;
        }

        response.status(200).json({
          valid: true,
          user: User.filterFields(existingUser),
          token: sessionToken,
          message: null,
        });
        return;
      } else {
        const { password } = reqBody(request);
        if (process.env.NODE_ENV !== "development" && !process.env.AUTH_TOKEN) {
          response.status(500).json({
            valid: false,
            token: null,
            message:
              "Server misconfigured: AUTH_TOKEN is unset. Set AUTH_TOKEN to enable single-user password mode.",
          });
          return;
        }

        // [性能优化] 使用预计算的 hash，避免每次登录都重新计算 bcrypt hash（~100-300ms）
        const authTokenHash = getAuthTokenHash();
        if (!authTokenHash || !bcrypt.compareSync(password, authTokenHash)) {
          await EventLogs.logEvent("failed_login_invalid_password", {
            ip: request.ip || "Unknown IP",
            multiUserMode: false,
          });
          response.status(401).json({
            valid: false,
            token: null,
            message: "[003] Invalid password provided",
          });
          return;
        }

        await Telemetry.sendTelemetry("login_event", { multiUserMode: false });
        await EventLogs.logEvent("login_event", {
          ip: request.ip || "Unknown IP",
          multiUserMode: false,
        });
        response.status(200).json({
          valid: true,
          token: makeJWT(
            { p: new EncryptionManager().encrypt(password) },
            process.env.JWT_EXPIRY
          ),
          message: null,
        });
      }
    } catch (e) {
      console.error(e.message, e);
      response.sendStatus(500).end();
    }
  });

  // SSO 认证接口也应用严格限流
  app.get(
    "/request-token/sso/simple",
    [authLimiter, simpleSSOEnabled],
    async (request, response) => {
      const { token: tempAuthToken } = request.query;
      const { sessionToken, token, error } =
        await TemporaryAuthToken.validate(tempAuthToken);

      if (error) {
        await EventLogs.logEvent("failed_login_invalid_temporary_auth_token", {
          ip: request.ip || "Unknown IP",
          multiUserMode: true,
        });
        return response.status(401).json({
          valid: false,
          token: null,
          message: `[001] An error occurred while validating the token: ${error}`,
        });
      }

      await Telemetry.sendTelemetry(
        "login_event",
        { multiUserMode: true },
        token.user.id
      );
      await EventLogs.logEvent(
        "login_event",
        {
          ip: request.ip || "Unknown IP",
          username: token.user.username || "Unknown user",
        },
        token.user.id
      );

      response.status(200).json({
        valid: true,
        user: User.filterFields(token.user),
        token: sessionToken,
        message: null,
      });
    }
  );

  // 账户恢复接口应用严格限流（1小时内最多5次请求，防止滥用）
  app.post(
    "/system/recover-account",
    [strictLimiter, isMultiUserSetup],
    async (request, response) => {
      try {
        const { username, recoveryCodes } = reqBody(request);
        const { success, resetToken, error } = await recoverAccount(
          username,
          recoveryCodes
        );

        if (success) {
          response.status(200).json({ success, resetToken });
        } else {
          response.status(400).json({ success, message: error });
        }
      } catch (error) {
        console.error("Error recovering account:", error);
        response
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    }
  );

  // 密码重置接口应用严格限流
  app.post(
    "/system/reset-password",
    [strictLimiter, isMultiUserSetup],
    async (request, response) => {
      try {
        const { token, newPassword, confirmPassword } = reqBody(request);
        const { success, message, error } = await resetPassword(
          token,
          newPassword,
          confirmPassword
        );

        if (success) {
          response.status(200).json({ success, message });
        } else {
          response.status(400).json({ success, error });
        }
      } catch (error) {
        console.error("Error resetting password:", error);
        response.status(500).json({ success: false, message: error.message });
      }
    }
  );

  app.get(
    "/system/system-vectors",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const query = queryParams(request);
        const VectorDb = getVectorDbClass();
        const vectorCount = !!query.slug
          ? await VectorDb.namespaceCount(query.slug)
          : await VectorDb.totalVectors();
        response.status(200).json({ vectorCount });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/system/remove-document",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { name } = reqBody(request);
        await purgeDocument(name);
        response.sendStatus(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/system/remove-documents",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { names } = reqBody(request);
        for await (const name of names) await purgeDocument(name);
        response.sendStatus(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/system/remove-folder",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { name } = reqBody(request);
        await purgeFolder(name);
        response.sendStatus(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/system/local-files",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_, response) => {
      try {
        const localFiles = await viewLocalFiles();
        response.status(200).json({ localFiles });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/system/document-processing-status",
    [validatedRequest],
    async (_, response) => {
      try {
        const online = await new CollectorApi().online();
        response.sendStatus(online ? 200 : 503);
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/system/accepted-document-types",
    [validatedRequest],
    async (_, response) => {
      try {
        const types = await new CollectorApi().acceptedFileTypes();
        if (!types) {
          response.sendStatus(404).end();
          return;
        }

        response.status(200).json({ types });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ==================== OCR API ====================

  /**
   * 获取 OCR 引擎状态
   */
  app.get("/system/ocr/status", [validatedRequest], async (_, response) => {
    try {
      const result = await new CollectorApi().getOCRStatus();
      response.status(200).json(result);
    } catch (e) {
      console.error(e.message, e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 触发 PaddleOCR 模型下载
   */
  app.post(
    "/system/ocr/paddle/setup",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_, response) => {
      try {
        const result = await new CollectorApi().setupPaddleOCR();
        response.status(200).json(result);
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取 OCR 性能指标
   */
  app.get("/system/ocr/metrics", [validatedRequest], async (_, response) => {
    try {
      const result = await new CollectorApi().getOCRMetrics();
      response.status(200).json(result);
    } catch (e) {
      console.error(e.message, e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 清空 OCR 缓存
   */
  app.post(
    "/system/ocr/cache/clear",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_, response) => {
      try {
        const result = await new CollectorApi().clearOCRCache();
        response.status(200).json(result);
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  app.post(
    "/system/update-env",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const { newValues, error } = await updateENV(
          body,
          false,
          response?.locals?.user?.id
        );
        response.status(200).json({ newValues, error });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/system/llm-provider-overrides",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        const workspaces = await Workspace.where({
          OR: [
            { chatProvider: { not: null } },
            { agentProvider: { not: null } },
          ],
        });
        const overrides = workspaces
          .filter(
            (workspace) => workspace.chatProvider || workspace.agentProvider
          )
          .map(({ id, name, chatProvider, agentProvider }) => ({
            id,
            name,
            chatProvider,
            agentProvider,
          }));

        response.status(200).json({ overrides });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/system/update-password",
    [validatedRequest],
    async (request, response) => {
      try {
        // Cannot update password in multi - user mode.
        if (multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

        let error = null;
        const { usePassword, newPassword } = reqBody(request);
        if (!usePassword) {
          // Password is being disabled so directly unset everything to bypass validation.
          process.env.AUTH_TOKEN = "";
          process.env.JWT_SECRET = "";
        } else {
          error = await updateENV(
            {
              AuthToken: newPassword,
              JWTSecret: v4(),
            },
            true
          )?.error;
        }
        response.status(200).json({ success: !error, error });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/system/enable-multi-user",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode) {
          response.status(200).json({
            success: false,
            error: "Multi-user mode is already enabled.",
          });
          return;
        }

        const { username, password } = reqBody(request);
        const { user, error } = await User.create({
          username,
          password,
          role: ROLES.admin,
        });

        if (error || !user) {
          response.status(400).json({
            success: false,
            error: error || "Failed to enable multi-user mode.",
          });
          return;
        }

        await SystemSettings._updateSettings({
          multi_user_mode: true,
        });
        await BrowserExtensionApiKey.migrateApiKeysToMultiUser(user.id);

        await updateENV(
          {
            JWTSecret: process.env.JWT_SECRET || v4(),
          },
          true
        );
        await Telemetry.sendTelemetry("enabled_multi_user_mode", {
          multiUserMode: true,
        });
        await EventLogs.logEvent("multi_user_mode_enabled", {}, user?.id);
        response.status(200).json({ success: !!user, error });
      } catch (e) {
        await User.delete({});
        await SystemSettings._updateSettings({
          multi_user_mode: false,
        });

        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get("/system/multi-user-mode", async (_, response) => {
    try {
      const multiUserMode = await SystemSettings.isMultiUserMode();
      response.status(200).json({ multiUserMode });
    } catch (e) {
      console.error(e.message, e);
      response.sendStatus(500).end();
    }
  });

  app.get("/system/logo", async function (request, response) {
    try {
      const darkMode =
        !request?.query?.theme || request?.query?.theme === "default";
      const defaultFilename = getDefaultFilename(darkMode);
      const logoPath = await determineLogoFilepath(defaultFilename);
      const { found, buffer, size, mime } = fetchLogo(logoPath);

      if (!found) {
        response.sendStatus(204).end();
        return;
      }

      const currentLogoFilename = await SystemSettings.currentLogoFilename();
      const servedLogoFilename = path.basename(logoPath);
      response.writeHead(200, {
        "Access-Control-Expose-Headers":
          "Content-Disposition,X-Is-Custom-Logo,Content-Type,Content-Length",
        "Content-Type": mime || "image/png",
        "Content-Disposition": `attachment; filename=${path.basename(
          logoPath
        )}`,
        "Content-Length": size,
        "X-Is-Custom-Logo":
          currentLogoFilename !== null &&
          currentLogoFilename === servedLogoFilename &&
          !isDefaultFilename(servedLogoFilename),
      });
      response.end(Buffer.from(buffer, "base64"));
      return;
    } catch (error) {
      console.error("Error processing the logo request:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/system/footer-data", [validatedRequest], async (_, response) => {
    try {
      const footerData =
        (await SystemSettings.get({ label: "footer_data" }))?.value ??
        JSON.stringify([]);
      response.status(200).json({ footerData: footerData });
    } catch (error) {
      console.error("Error fetching footer data:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/system/support-email", [validatedRequest], async (_, response) => {
    try {
      const supportEmail =
        (
          await SystemSettings.get({
            label: "support_email",
          })
        )?.value ?? null;
      response.status(200).json({ supportEmail: supportEmail });
    } catch (error) {
      console.error("Error fetching support email:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  // No middleware protection in order to get this on the login page
  app.get("/system/custom-app-name", async (_, response) => {
    try {
      const customAppName =
        (
          await SystemSettings.get({
            label: "custom_app_name",
          })
        )?.value ?? null;
      response.status(200).json({ customAppName: customAppName });
    } catch (error) {
      console.error("Error fetching custom app name:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(
    "/system/pfp/:id",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async function (request, response) {
      try {
        const { id } = request.params;
        if (response.locals?.user?.id !== Number(id))
          return response.sendStatus(204).end();

        const pfpPath = await determinePfpFilepath(id);
        if (!pfpPath) return response.sendStatus(204).end();

        const { found, buffer, size, mime } = fetchPfp(pfpPath);
        if (!found) return response.sendStatus(204).end();

        response.writeHead(200, {
          "Content-Type": mime || "image/png",
          "Content-Disposition": `attachment; filename=${path.basename(pfpPath)}`,
          "Content-Length": size,
        });
        response.end(Buffer.from(buffer, "base64"));
        return;
      } catch (error) {
        console.error("Error processing the logo request:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.post(
    "/system/upload-pfp",
    [validatedRequest, flexUserRoleValid([ROLES.all]), handlePfpUpload],
    async function (request, response) {
      try {
        const user = await userFromSession(request, response);
        const uploadedFileName = request.randomFileName;
        if (!uploadedFileName) {
          return response.status(400).json({ message: "File upload failed." });
        }

        const userRecord = await User.get({ id: user.id });
        const oldPfpFilename = userRecord.pfpFilename;
        if (oldPfpFilename) {
          const storagePath = path.join(__dirname, "../storage/assets/pfp");
          const oldPfpPath = path.join(
            storagePath,
            normalizePath(userRecord.pfpFilename)
          );
          if (!isWithin(path.resolve(storagePath), path.resolve(oldPfpPath)))
            throw new Error("Invalid path name");
          if (fs.existsSync(oldPfpPath)) fs.unlinkSync(oldPfpPath);
        }

        const { success, error } = await User.update(user.id, {
          pfpFilename: uploadedFileName,
        });

        return response.status(success ? 200 : 500).json({
          message: success
            ? "Profile picture uploaded successfully."
            : error || "Failed to update with new profile picture.",
        });
      } catch (error) {
        console.error("Error processing the profile picture upload:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.delete(
    "/system/remove-pfp",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async function (request, response) {
      try {
        const user = await userFromSession(request, response);
        const userRecord = await User.get({ id: user.id });
        const oldPfpFilename = userRecord.pfpFilename;

        if (oldPfpFilename) {
          const storagePath = path.join(__dirname, "../storage/assets/pfp");
          const oldPfpPath = path.join(
            storagePath,
            normalizePath(oldPfpFilename)
          );
          if (!isWithin(path.resolve(storagePath), path.resolve(oldPfpPath)))
            throw new Error("Invalid path name");
          if (fs.existsSync(oldPfpPath)) fs.unlinkSync(oldPfpPath);
        }

        const { success, error } = await User.update(user.id, {
          pfpFilename: null,
        });

        return response.status(success ? 200 : 500).json({
          message: success
            ? "Profile picture removed successfully."
            : error || "Failed to remove profile picture.",
        });
      } catch (error) {
        console.error("Error processing the profile picture removal:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.post(
    "/system/upload-logo",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      handleAssetUpload,
    ],
    async (request, response) => {
      if (!request?.file || !request?.file.originalname) {
        return response.status(400).json({ message: "No logo file provided." });
      }

      if (!validFilename(request.file.originalname)) {
        return response.status(400).json({
          message: "Invalid file name. Please choose a different file.",
        });
      }

      try {
        const newFilename = await renameLogoFile(request.file.originalname);
        const existingLogoFilename = await SystemSettings.currentLogoFilename();
        await removeCustomLogo(existingLogoFilename);

        const { success, error } = await SystemSettings._updateSettings({
          logo_filename: newFilename,
        });

        return response.status(success ? 200 : 500).json({
          message: success
            ? "Logo uploaded successfully."
            : error || "Failed to update with new logo.",
        });
      } catch (error) {
        console.error("Error processing the logo upload:", error);
        response.status(500).json({ message: "Error uploading the logo." });
      }
    }
  );

  app.get("/system/is-default-logo", async (_, response) => {
    try {
      const currentLogoFilename = await SystemSettings.currentLogoFilename();
      const isDefaultLogo =
        !currentLogoFilename || isDefaultFilename(currentLogoFilename);
      response.status(200).json({ isDefaultLogo });
    } catch (error) {
      console.error("Error processing the logo request:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(
    "/system/remove-logo",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const currentLogoFilename = await SystemSettings.currentLogoFilename();
        await removeCustomLogo(currentLogoFilename);
        const { success, error } = await SystemSettings._updateSettings({
          logo_filename: LOGO_FILENAME,
        });

        return response.status(success ? 200 : 500).json({
          message: success
            ? "Logo removed successfully."
            : error || "Failed to update with new logo.",
        });
      } catch (error) {
        console.error("Error processing the logo removal:", error);
        response.status(500).json({ message: "Error removing the logo." });
      }
    }
  );

  // White-label app icon: one square master PNG -> favicon + apple-touch + desktop source.
  app.post(
    "/system/upload-app-icon",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      handleIconUpload,
    ],
    async (request, response) => {
      try {
        if (!request?.file || !request?.file.path) {
          return response
            .status(400)
            .json({ message: "No icon file provided." });
        }

        const sourcePath = request.file.path;
        const baseId = v4();
        await generateAppIconSet(sourcePath, baseId);

        // Only keep the generated derivatives; discard the uploaded original.
        try {
          if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
        } catch (cleanupError) {
          console.error("App icon temp cleanup failed:", cleanupError.message);
        }

        const previous = await currentAppIcon();
        if (previous && previous !== baseId) removeAppIconSet(previous);

        const { success, error } = await SystemSettings._updateSettings({
          app_icon: baseId,
        });

        return response.status(success ? 200 : 500).json({
          message: success
            ? "App icon uploaded successfully."
            : error || "Failed to set app icon.",
          baseId: success ? baseId : null,
        });
      } catch (error) {
        console.error("Error processing the app icon upload:", error);
        response.status(500).json({ message: "Error uploading the app icon." });
      }
    }
  );

  // Public: favicon/apple-touch etc. must load on the login/index page without auth.
  app.get("/system/app-icon/:size", async (request, response) => {
    try {
      const baseId = await currentAppIcon();
      if (!baseId) return response.sendStatus(204).end();

      const sizeKey = String(request.params.size || "").replace(/\.png$/i, "");
      if (!isValidSizeKey(sizeKey)) return response.sendStatus(404).end();

      const { found, buffer, size, mime } = fetchAppIcon(baseId, sizeKey);
      if (!found) return response.sendStatus(204).end();

      response.writeHead(200, {
        "Content-Type": mime || "image/png",
        "Content-Length": size,
        "Cache-Control": "public, max-age=86400",
      });
      response.end(buffer);
      return;
    } catch (error) {
      console.error("Error processing the app icon request:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/system/is-default-app-icon", async (_, response) => {
    try {
      const baseId = await currentAppIcon();
      response.status(200).json({ isDefault: !baseId });
    } catch (error) {
      console.error("Error processing the app icon request:", error);
      response.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(
    "/system/remove-app-icon",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const baseId = await currentAppIcon();
        if (baseId) removeAppIconSet(baseId);
        const { success, error } = await SystemSettings._updateSettings({
          app_icon: null,
        });

        return response.status(success ? 200 : 500).json({
          message: success
            ? "App icon removed successfully."
            : error || "Failed to remove app icon.",
        });
      } catch (error) {
        console.error("Error processing the app icon removal:", error);
        response.status(500).json({ message: "Error removing the app icon." });
      }
    }
  );

  app.get(
    "/system/welcome-messages",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async function (_, response) {
      try {
        const welcomeMessages = await WelcomeMessages.getMessages();
        response.status(200).json({ success: true, welcomeMessages });
      } catch (error) {
        console.error("Error fetching welcome messages:", error);
        response
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    }
  );

  app.post(
    "/system/set-welcome-messages",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { messages = [] } = reqBody(request);
        if (!Array.isArray(messages)) {
          return response.status(400).json({
            success: false,
            message: "Invalid message format. Expected an array of messages.",
          });
        }

        await WelcomeMessages.saveAll(messages);
        return response.status(200).json({
          success: true,
          message: "Welcome messages saved successfully.",
        });
      } catch (error) {
        console.error("Error processing the welcome messages:", error);
        response.status(500).json({
          success: true,
          message: "Error saving the welcome messages.",
        });
      }
    }
  );

  app.get("/system/api-keys", [validatedRequest], async (_, response) => {
    try {
      if (response.locals.multiUserMode) {
        return response.sendStatus(401).end();
      }

      const apiKeys = await ApiKey.where({});
      return response.status(200).json({
        apiKeys,
        error: null,
      });
    } catch (error) {
      console.error(error);
      response.status(500).json({
        apiKey: null,
        error: "Could not find an API Key.",
      });
    }
  });

  app.post(
    "/system/generate-api-key",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode) {
          return response.sendStatus(401).end();
        }

        const { name, expiresAt, rateLimit } = reqBody(request);
        const { apiKey, error } = await ApiKey.create(null, {
          name,
          expiresAt,
          rateLimit,
        });
        await EventLogs.logEvent(
          "api_key_created",
          { keyName: name },
          response?.locals?.user?.id
        );
        return response.status(200).json({
          apiKey,
          error,
        });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          apiKey: null,
          error: "Error generating api key.",
        });
      }
    }
  );

  // TODO: This endpoint is replicated in the admin endpoints file.
  // and should be consolidated to be a single endpoint with flexible role protection.
  app.delete(
    "/system/api-key/:id",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode)
          return response.sendStatus(401).end();
        const { id } = request.params;
        if (!id || isNaN(Number(id))) return response.sendStatus(400).end();

        await ApiKey.delete({ id: Number(id) });
        await EventLogs.logEvent(
          "api_key_deleted",
          { deletedBy: response.locals?.user?.username },
          response?.locals?.user?.id
        );
        return response.status(200).end();
      } catch (error) {
        console.error(error);
        response.status(500).end();
      }
    }
  );

  app.post(
    "/system/custom-models",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { provider, apiKey = null, basePath = null } = reqBody(request);
        const { models, error } = await getCustomModels(
          provider,
          apiKey,
          basePath
        );
        return response.status(200).json({
          models,
          error,
        });
      } catch (error) {
        console.error(error);
        response.status(500).end();
      }
    }
  );

  app.post(
    "/system/test-embedding-connection",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const { EmbeddingEngine } = body;

        if (!EmbeddingEngine) {
          return response.status(400).json({
            success: false,
            message: "Embedding engine is required",
          });
        }

        // 字段名映射: 前端表单字段名 -> 后端环境变量名
        const fieldMapping = {
          // OpenAI
          OpenAiKey: "OPEN_AI_KEY",
          // Azure
          AzureOpenAiEndpoint: "AZURE_OPENAI_ENDPOINT",
          AzureOpenAiKey: "AZURE_OPENAI_KEY",
          AzureOpenAiEmbeddingModelPref: "EMBEDDING_MODEL_PREF",
          // Gemini
          GeminiEmbeddingApiKey: "GEMINI_API_KEY",
          // Voyage AI
          VoyageAiApiKey: "VOYAGEAI_API_KEY",
          // Generic OpenAI
          EmbeddingBasePath: "EMBEDDING_BASE_PATH",
          GenericOpenAiEmbeddingApiKey: "GENERIC_OPEN_AI_KEY",
          // LM Studio
          LMStudioBasePath: "EMBEDDING_BASE_PATH",
          // Ollama
          OllamaBasePath: "EMBEDDING_BASE_PATH",
          // LocalAI
          LocalAIBasePath: "EMBEDDING_BASE_PATH",
          LocalAIApiKey: "LOCAL_AI_API_KEY",
          // Cohere
          CohereApiKey: "COHERE_API_KEY",
          // LiteLLM
          LiteLLMBasePath: "LITE_LLM_BASE_PATH",
          LiteLLMAPIKey: "LITE_LLM_API_KEY",
          // Mistral
          MistralApiKey: "MISTRAL_API_KEY",
          // BAAI
          BAAIApiKey: "BAAI_API_KEY",
          BAAIBaseURL: "BAAI_BASE_URL",
          BAAIUseOllama: "BAAI_USE_OLLAMA",
          // Jina
          JinaApiKey: "JINA_API_KEY",
          JinaBaseURL: "JINA_BASE_URL",
          JinaUseOllama: "JINA_USE_OLLAMA",
          // Qwen
          QwenApiKey: "QWEN_API_KEY",
          QwenBaseURL: "QWEN_BASE_URL",
          // Zhipu
          ZhipuApiKey: "ZHIPU_API_KEY",
          ZhipuBaseURL: "ZHIPU_BASE_URL",
          // Common
          EmbeddingModelPref: "EMBEDDING_MODEL_PREF",
          EmbeddingModelMaxChunkLength: "EMBEDDING_MODEL_MAX_CHUNK_LENGTH",
        };

        // 临时设置环境变量进行测试
        const originalEnv = {};
        for (const [key, value] of Object.entries(body)) {
          if (key !== "EmbeddingEngine" && value) {
            // 使用映射后的环境变量名
            const envKey = fieldMapping[key] || key;
            originalEnv[envKey] = process.env[envKey];
            process.env[envKey] = value;
          }
        }

        try {
          // 根据 embedding engine 类型创建实例并测试
          let embedder;
          switch (EmbeddingEngine) {
            case "native":
              const {
                NativeEmbedder,
              } = require("../utils/EmbeddingEngines/native");
              embedder = new NativeEmbedder();
              break;
            case "openai":
              const {
                OpenAiEmbedder,
              } = require("../utils/EmbeddingEngines/openAi");
              embedder = new OpenAiEmbedder();
              break;
            case "azure":
              const {
                AzureOpenAiEmbedder,
              } = require("../utils/EmbeddingEngines/azureOpenAi");
              embedder = new AzureOpenAiEmbedder();
              break;
            case "ollama":
              const {
                OllamaEmbedder,
              } = require("../utils/EmbeddingEngines/ollama");
              embedder = new OllamaEmbedder();
              break;
            case "lmstudio":
              const {
                LMStudioEmbedder,
              } = require("../utils/EmbeddingEngines/lmstudio");
              embedder = new LMStudioEmbedder();
              break;
            case "voyageai":
              const {
                VoyageAiEmbedder,
              } = require("../utils/EmbeddingEngines/voyageAi");
              embedder = new VoyageAiEmbedder();
              break;
            case "gemini":
              const {
                GeminiEmbedder,
              } = require("../utils/EmbeddingEngines/gemini");
              embedder = new GeminiEmbedder();
              break;
            case "generic-openai":
              const {
                GenericOpenAiEmbedder,
              } = require("../utils/EmbeddingEngines/genericOpenAi");
              embedder = new GenericOpenAiEmbedder();
              break;
            case "localai":
              const {
                LocalAiEmbedder,
              } = require("../utils/EmbeddingEngines/localAi");
              embedder = new LocalAiEmbedder();
              break;
            case "cohere":
              const {
                CohereEmbedder,
              } = require("../utils/EmbeddingEngines/cohere");
              embedder = new CohereEmbedder();
              break;
            case "litellm":
              const {
                LiteLLMEmbedder,
              } = require("../utils/EmbeddingEngines/liteLLM");
              embedder = new LiteLLMEmbedder();
              break;
            case "mistral":
              const {
                MistralEmbedder,
              } = require("../utils/EmbeddingEngines/mistral");
              embedder = new MistralEmbedder();
              break;
            case "baai":
              const {
                BAAIEmbedder,
              } = require("../utils/EmbeddingEngines/baai");
              embedder = new BAAIEmbedder();
              break;
            case "jina":
              const {
                JinaEmbedder,
              } = require("../utils/EmbeddingEngines/jina");
              embedder = new JinaEmbedder();
              break;
            case "qwen":
              const {
                QwenEmbedder,
              } = require("../utils/EmbeddingEngines/qwen");
              embedder = new QwenEmbedder();
              break;
            case "zhipu-embedding":
              const {
                ZhipuEmbedder,
              } = require("../utils/EmbeddingEngines/zhipuEmbedding");
              embedder = new ZhipuEmbedder();
              break;
            default:
              throw new Error(
                `Unsupported embedding engine: ${EmbeddingEngine}`
              );
          }

          // 测试 embedding 功能
          const testText = "This is a test string for embedding connection.";
          const result = await embedder.embedTextInput(testText);

          if (!result || result.length === 0) {
            throw new Error("Embedding returned empty result");
          }

          return response.status(200).json({
            success: true,
            message: `Successfully connected to ${EmbeddingEngine} embedding service. Generated ${result.length}-dimensional embedding.`,
          });
        } catch (error) {
          console.error("Embedding test error:", error);
          return response.status(200).json({
            success: false,
            message: error.message || "Failed to connect to embedding service",
          });
        } finally {
          // 恢复原始环境变量
          for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
              delete process.env[key];
            } else {
              process.env[key] = value;
            }
          }
        }
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  );

  app.post(
    "/system/event-logs",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { offset = 0, limit = 10 } = reqBody(request);
        const logs = await EventLogs.whereWithData({}, limit, offset * limit, {
          id: "desc",
        });
        const totalLogs = await EventLogs.count();
        const hasPages = totalLogs > (offset + 1) * limit;

        response.status(200).json({ logs: logs, hasPages, totalLogs });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/system/event-logs",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        await EventLogs.delete();
        await EventLogs.logEvent(
          "event_logs_cleared",
          {},
          response?.locals?.user?.id
        );
        response.json({ success: true });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/system/workspace-chats",
    [
      chatHistoryViewable,
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { offset = 0, limit = 20 } = reqBody(request);
        const chats = await WorkspaceChats.whereWithData(
          {},
          limit,
          offset * limit,
          { id: "desc" }
        );
        const totalChats = await WorkspaceChats.count();
        const hasPages = totalChats > (offset + 1) * limit;

        response.status(200).json({ chats: chats, hasPages, totalChats });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/system/workspace-chats/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { id } = request.params;
        Number(id) === -1
          ? await WorkspaceChats.delete({}, true)
          : await WorkspaceChats.delete({ id: Number(id) });
        response.json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/system/export-chats",
    [
      chatHistoryViewable,
      validatedRequest,
      flexUserRoleValid([ROLES.manager, ROLES.admin]),
    ],
    async (request, response) => {
      try {
        const { type = "jsonl", chatType = "workspace" } = request.query;
        const { contentType, data } = await exportChatsAsType(type, chatType);
        await EventLogs.logEvent(
          "exported_chats",
          {
            type,
            chatType,
          },
          response.locals.user?.id
        );
        response.setHeader("Content-Type", contentType);
        response.status(200).send(data);
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  // Used for when a user in multi-user updates their own profile
  // from the UI.
  app.post("/system/user", [validatedRequest], async (request, response) => {
    try {
      const sessionUser = await userFromSession(request, response);
      const { username, password, bio } = reqBody(request);
      const id = Number(sessionUser.id);

      if (!id) {
        response.status(400).json({ success: false, error: "Invalid user ID" });
        return;
      }

      const updates = {};
      if (username)
        updates.username = User.validations.username(String(username));
      if (password) updates.password = String(password);
      if (bio) updates.bio = String(bio);

      if (Object.keys(updates).length === 0) {
        response
          .status(400)
          .json({ success: false, error: "No updates provided" });
        return;
      }

      const { success, error } = await User.update(id, updates);
      response.status(200).json({ success, error });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.get(
    "/system/slash-command-presets",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const userPresets = await SlashCommandPresets.getUserPresets(user?.id);
        response.status(200).json({ presets: userPresets });
      } catch (error) {
        console.error("Error fetching slash command presets:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.post(
    "/system/slash-command-presets",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { command, prompt, description } = reqBody(request);
        const formattedCommand = SlashCommandPresets.formatCommand(
          String(command)
        );

        if (Object.keys(VALID_COMMANDS).includes(formattedCommand)) {
          return response.status(400).json({
            message:
              "Cannot create a preset with a command that matches a system command",
          });
        }

        const presetData = {
          command: formattedCommand,
          prompt: String(prompt),
          description: String(description),
        };

        const preset = await SlashCommandPresets.create(user?.id, presetData);
        if (!preset) {
          return response
            .status(500)
            .json({ message: "Failed to create preset" });
        }
        response.status(201).json({ preset });
      } catch (error) {
        console.error("Error creating slash command preset:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.post(
    "/system/slash-command-presets/:slashCommandId",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { slashCommandId } = request.params;
        const { command, prompt, description } = reqBody(request);
        const formattedCommand = SlashCommandPresets.formatCommand(
          String(command)
        );

        if (Object.keys(VALID_COMMANDS).includes(formattedCommand)) {
          return response.status(400).json({
            message:
              "Cannot update a preset to use a command that matches a system command",
          });
        }

        // Valid user running owns the preset if user session is valid.
        const ownsPreset = await SlashCommandPresets.get({
          userId: user?.id ?? null,
          id: Number(slashCommandId),
        });
        if (!ownsPreset)
          return response.status(404).json({ message: "Preset not found" });

        const updates = {
          command: formattedCommand,
          prompt: String(prompt),
          description: String(description),
        };

        const preset = await SlashCommandPresets.update(
          Number(slashCommandId),
          updates
        );
        if (!preset) return response.sendStatus(422);
        response.status(200).json({ preset: { ...ownsPreset, ...updates } });
      } catch (error) {
        console.error("Error updating slash command preset:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.delete(
    "/system/slash-command-presets/:slashCommandId",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const { slashCommandId } = request.params;
        const user = await userFromSession(request, response);

        // Valid user running owns the preset if user session is valid.
        const ownsPreset = await SlashCommandPresets.get({
          userId: user?.id ?? null,
          id: Number(slashCommandId),
        });
        if (!ownsPreset)
          return response
            .status(403)
            .json({ message: "Failed to delete preset" });

        await SlashCommandPresets.delete(Number(slashCommandId));
        response.sendStatus(204);
      } catch (error) {
        console.error("Error deleting slash command preset:", error);
        response.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.get(
    "/system/prompt-variables",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const variables = await SystemPromptVariables.getAll(user?.id);
        response.status(200).json({ variables });
      } catch (error) {
        console.error("Error fetching system prompt variables:", error);
        response.status(500).json({
          success: false,
          error: `Failed to fetch system prompt variables: ${error.message}`,
        });
      }
    }
  );

  app.post(
    "/system/prompt-variables",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { key, value, description = null } = reqBody(request);

        if (!key || !value) {
          return response.status(400).json({
            success: false,
            error: "Key and value are required",
          });
        }

        const variable = await SystemPromptVariables.create({
          key,
          value,
          description,
          userId: user?.id || null,
        });

        response.status(200).json({
          success: true,
          variable,
        });
      } catch (error) {
        console.error("Error creating system prompt variable:", error);
        response.status(500).json({
          success: false,
          error: `Failed to create system prompt variable: ${error.message}`,
        });
      }
    }
  );

  app.put(
    "/system/prompt-variables/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { id } = request.params;
        const { key, value, description = null } = reqBody(request);

        if (!key || !value) {
          return response.status(400).json({
            success: false,
            error: "Key and value are required",
          });
        }

        const variable = await SystemPromptVariables.update(Number(id), {
          key,
          value,
          description,
        });

        if (!variable) {
          return response.status(404).json({
            success: false,
            error: "Variable not found",
          });
        }

        response.status(200).json({
          success: true,
          variable,
        });
      } catch (error) {
        console.error("Error updating system prompt variable:", error);
        response.status(500).json({
          success: false,
          error: `Failed to update system prompt variable: ${error.message}`,
        });
      }
    }
  );

  app.delete(
    "/system/prompt-variables/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { id } = request.params;
        const success = await SystemPromptVariables.delete(Number(id));

        if (!success) {
          return response.status(404).json({
            success: false,
            error: "System prompt variable not found or could not be deleted",
          });
        }

        response.status(200).json({
          success: true,
        });
      } catch (error) {
        console.error("Error deleting system prompt variable:", error);
        response.status(500).json({
          success: false,
          error: `Failed to delete system prompt variable: ${error.message}`,
        });
      }
    }
  );

  app.post(
    "/system/validate-sql-connection",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { engine, connectionString } = reqBody(request);
        if (!engine || !connectionString) {
          return response.status(400).json({
            success: false,
            error: "Both engine and connection details are required.",
          });
        }

        const {
          validateConnection,
        } = require("../utils/agents/aibitat/plugins/sql-agent/SQLConnectors");
        const result = await validateConnection(engine, { connectionString });

        if (!result.success) {
          return response.status(200).json({
            success: false,
            error: `Unable to connect to ${engine}. Please verify your connection details.`,
          });
        }

        response.status(200).json(result);
      } catch (error) {
        console.error("SQL validation error:", error);
        response.status(500).json({
          success: false,
          error: `Unable to connect to ${engine}. Please verify your connection details.`,
        });
      }
    }
  );
}

module.exports = { systemEndpoints };
