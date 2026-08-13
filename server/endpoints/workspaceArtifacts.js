const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  ROLES,
  flexUserRoleValid,
} = require("../utils/middleware/multiUserProtected");
const {
  validWorkspaceAndThreadSlug,
} = require("../utils/middleware/validWorkspace");
const { WorkspaceChats } = require("../models/workspaceChats");
const {
  listArtifactsForThread,
  createArtifactFromChat,
  promoteArtifactVersion,
  getArtifactVersionContent,
} = require("../utils/artifacts");

function workspaceArtifactsEndpoints(app) {
  if (!app) return;

  app.get(
    "/workspace/:slug/thread/:threadSlug/artifacts",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validWorkspaceAndThreadSlug,
    ],
    async (_, response) => {
      try {
        const thread = response.locals.thread;
        const artifacts = await listArtifactsForThread(thread);
        response.status(200).json({ success: true, artifacts });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  app.post(
    "/workspace/:slug/thread/:threadSlug/artifacts",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validWorkspaceAndThreadSlug,
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const thread = response.locals.thread;
        const {
          chatId,
          title = null,
          type = "note",
          language = null,
          content = null,
        } = reqBody(request);

        if (!chatId || Number.isNaN(Number(chatId))) {
          response
            .status(400)
            .json({ success: false, error: "chatId is required." });
          return;
        }

        const chat = await WorkspaceChats.get({
          id: Number(chatId),
          workspaceId: workspace.id,
          thread_id: thread.id,
          user_id: user?.id || null,
          include: true,
        });

        if (!chat) {
          response
            .status(404)
            .json({ success: false, error: "Chat not found." });
          return;
        }

        const artifact = await createArtifactFromChat({
          workspace,
          thread,
          user,
          chat,
          title,
          type,
          language,
          contentOverride: content,
        });

        response.status(200).json({ success: true, artifact });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  app.get(
    "/workspace/:slug/thread/:threadSlug/artifacts/:artifactId/versions/:versionId",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validWorkspaceAndThreadSlug,
    ],
    async (request, response) => {
      try {
        const thread = response.locals.thread;
        const { artifactId, versionId } = request.params;
        const { artifact, version, content } = await getArtifactVersionContent({
          thread,
          artifactId,
          versionId,
        });

        response.status(200).json({
          success: true,
          artifactId: artifact.id,
          versionId: version.versionId,
          type: artifact.type,
          title: artifact.title,
          content,
          summary: version.summary || artifact.summary || "",
          contentTokenCount:
            version.contentTokenCount || artifact.contentTokenCount || 0,
          language: version.language || null,
          status: version.status || null,
        });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  app.post(
    "/workspace/:slug/thread/:threadSlug/artifacts/:artifactId/promote",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validWorkspaceAndThreadSlug,
    ],
    async (request, response) => {
      try {
        const thread = response.locals.thread;
        const { artifactId } = request.params;
        const { versionId } = reqBody(request);
        if (!versionId) {
          response
            .status(400)
            .json({ success: false, error: "versionId is required." });
          return;
        }

        const artifact = await promoteArtifactVersion({
          thread,
          artifactId,
          versionId,
        });

        response.status(200).json({ success: true, artifact });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );
}

module.exports = { workspaceArtifactsEndpoints };
