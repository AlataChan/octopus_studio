const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const prisma = require("../prisma");
const { safeJsonParse } = require("../http");
const { TokenManager } = require("../helpers/tiktoken");
const {
  documentsPath,
  normalizePath,
  isWithin,
  fileData,
} = require("../files");

const ARTIFACTS_FOLDER = "artifacts";
const MAX_ARTIFACTS_PER_THREAD = 50;
const MAX_VERSIONS_PER_ARTIFACT = 50;

const VALID_ARTIFACT_TYPES = ["spec", "sop", "code", "summary", "note"];

function nowISO() {
  return new Date().toISOString();
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeArtifactType(type) {
  if (!isNonEmptyString(type)) return "note";
  const normalized = String(type).trim().toLowerCase();
  return VALID_ARTIFACT_TYPES.includes(normalized) ? normalized : "note";
}

function safeTitleFromContent(content) {
  if (!isNonEmptyString(content)) return "Untitled Artifact";
  const firstLine = String(content)
    .split("\n")
    .find((l) => l.trim().length);
  const raw = (firstLine || "Untitled Artifact")
    .replace(/^#{1,6}\s+/, "")
    .trim();
  return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
}

function slugSafeFilenameBase(input) {
  const base = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base.length > 60 ? base.slice(0, 60) : base || "artifact";
}

function estimateWordCount(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) return tokens.length;
  // For CJK / code-heavy content, whitespace tokenization can undercount.
  return Math.min(t.length, 10_000);
}

function buildSummary(content) {
  const t = String(content || "").trim();
  if (!t) return "";
  const oneLine = t.replace(/\s+/g, " ");
  return oneLine.length > 220 ? `${oneLine.slice(0, 217)}...` : oneLine;
}

function estimateTokenCount(content, model = null) {
  const text = String(content || "");
  try {
    const tokenManager = new TokenManager(model || "gpt-3.5-turbo");
    return tokenManager.countFromString(text);
  } catch {
    // Rough heuristic fallback.
    return Math.ceil(text.length / 4);
  }
}

function parseThreadMetadata(thread) {
  const meta = safeJsonParse(thread?.metadata, {});
  return meta && typeof meta === "object" ? meta : {};
}

function extractArtifactRefs(meta) {
  const list = Array.isArray(meta?.artifacts_generated)
    ? meta.artifacts_generated
    : [];
  return list.filter(
    (a) =>
      a &&
      typeof a === "object" &&
      a.kind === "artifact" &&
      isNonEmptyString(a.id)
  );
}

function findArtifactRefBySourceChatId(artifacts, chatId) {
  const key = String(chatId);
  for (const a of artifacts) {
    const versions = Array.isArray(a?.versions) ? a.versions : [];
    if (versions.some((v) => String(v?.sourceChatId) === key)) return a;
  }
  return null;
}

function upsertArtifactRefs(meta, artifacts) {
  const existing = Array.isArray(meta?.artifacts_generated)
    ? meta.artifacts_generated
    : [];
  const nonArtifactItems = existing.filter(
    (a) => !(a && typeof a === "object" && a.kind === "artifact")
  );
  return {
    ...meta,
    artifacts_generated: [...nonArtifactItems, ...artifacts].slice(
      -MAX_ARTIFACTS_PER_THREAD
    ),
  };
}

async function ensureArtifactsFolder() {
  const folderPath = path.resolve(documentsPath, ARTIFACTS_FOLDER);
  if (!isWithin(path.resolve(documentsPath), folderPath)) {
    throw new Error("Invalid artifacts folder path.");
  }
  await fsPromises.mkdir(folderPath, { recursive: true });
}

async function writeArtifactDocument({
  workspace,
  thread,
  artifactId,
  versionId,
  title,
  type,
  content,
  user = null,
  language = null,
  sourceChatId = null,
  model = null,
}) {
  if (!workspace?.id) throw new Error("workspace is required");
  if (!thread?.id || !thread?.slug) throw new Error("thread is required");
  if (!isNonEmptyString(artifactId)) throw new Error("artifactId is required");
  if (!isNonEmptyString(versionId)) throw new Error("versionId is required");
  if (!isNonEmptyString(title)) throw new Error("title is required");

  const artifactType = normalizeArtifactType(type);
  const createdAt = nowISO();
  const summary = buildSummary(content);
  const contentTokenCount = estimateTokenCount(
    content,
    model || workspace?.chatModel
  );

  await ensureArtifactsFolder();

  const docId = uuidv4();
  const filenameBase = slugSafeFilenameBase(title);
  const filename = `${filenameBase}-${docId}.json`;
  const docpath = `${ARTIFACTS_FOLDER}/${filename}`;

  const fullFilePath = path.resolve(documentsPath, normalizePath(docpath));
  if (!isWithin(path.resolve(documentsPath), fullFilePath)) {
    throw new Error("Invalid artifact document path.");
  }

  const documentJson = {
    id: docId,
    url: `artifact://${workspace.slug}/${thread.slug}/${artifactId}/${versionId}`,
    title,
    docAuthor: user?.username || "AI",
    description: `Artifact ${artifactType} (${artifactId} ${versionId})`,
    docSource: "artifact generated from chat",
    chunkSource: `artifact://${artifactId}/${versionId}`,
    published: createdAt,
    wordCount: estimateWordCount(content),
    token_count_estimate: contentTokenCount,
    pageContent: String(content || ""),
    artifact: {
      id: artifactId,
      versionId,
      type: artifactType,
      language: isNonEmptyString(language) ? String(language).trim() : null,
      sourceChatId: sourceChatId ?? null,
      threadSlug: thread.slug,
      workspaceSlug: workspace.slug,
    },
  };

  await fsPromises.writeFile(
    fullFilePath,
    JSON.stringify(documentJson, null, 2),
    "utf8"
  );

  // Store metadata in DB without pageContent to avoid bloating the row.
  const dbMetadata = { ...documentJson };
  delete dbMetadata.pageContent;

  try {
    await prisma.workspace_documents.create({
      data: {
        docId,
        filename,
        docpath,
        workspaceId: workspace.id,
        metadata: JSON.stringify(dbMetadata),
        pinned: false,
        watched: false,
      },
    });
  } catch (e) {
    // If DB insert fails, clean up the file to avoid orphaned artifacts.
    try {
      fs.existsSync(fullFilePath) && fs.unlinkSync(fullFilePath);
    } catch {}
    throw e;
  }

  return {
    docId,
    docpath,
    title,
    type: artifactType,
    versionId,
    summary,
    contentTokenCount,
    language: isNonEmptyString(language) ? String(language).trim() : null,
    sourceChatId: sourceChatId ?? null,
    createdAt,
  };
}

async function readArtifactContentByDocpath(docpath) {
  const data = await fileData(docpath);
  return data?.pageContent ?? "";
}

async function listArtifactsForThread(thread) {
  const meta = parseThreadMetadata(thread);
  return extractArtifactRefs(meta);
}

async function createArtifactFromChat({
  workspace,
  thread,
  user,
  chat,
  title = null,
  type = "note",
  language = null,
  contentOverride = null,
}) {
  if (!workspace?.id) throw new Error("workspace is required");
  if (!thread?.id) throw new Error("thread is required");
  if (!chat?.id) throw new Error("chat is required");

  const shouldDedupe =
    !isNonEmptyString(title) && !isNonEmptyString(contentOverride);
  if (shouldDedupe) {
    const meta = parseThreadMetadata(thread);
    const artifacts = extractArtifactRefs(meta);
    const existing = findArtifactRefBySourceChatId(artifacts, chat.id);
    if (existing) return existing;
  }

  const responseObj = safeJsonParse(chat.response, {});
  const assistantText = responseObj?.text || "";
  const content = isNonEmptyString(contentOverride)
    ? String(contentOverride)
    : String(assistantText || "");

  const artifactId = `artifact_${uuidv4()}`;
  const artifactType = normalizeArtifactType(type);
  const artifactTitle = isNonEmptyString(title)
    ? String(title).trim()
    : safeTitleFromContent(content);

  const versionId = "v1";
  const version = await writeArtifactDocument({
    workspace,
    thread,
    artifactId,
    versionId,
    title: artifactTitle,
    type: artifactType,
    content,
    user,
    language,
    sourceChatId: chat.id,
    model: workspace?.chatModel,
  });

  const meta = parseThreadMetadata(thread);
  const artifacts = extractArtifactRefs(meta);
  const createdAt = version.createdAt;

  const artifactRef = {
    kind: "artifact",
    id: artifactId,
    title: artifactTitle,
    name: artifactTitle, // compatibility with existing working-memory formatting
    type: artifactType,
    currentVersionId: versionId,
    docId: version.docId,
    summary: version.summary,
    contentTokenCount: version.contentTokenCount,
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        versionId,
        docId: version.docId,
        docpath: version.docpath,
        summary: version.summary,
        contentTokenCount: version.contentTokenCount,
        language: version.language,
        sourceChatId: version.sourceChatId,
        status: "current",
        createdAt,
      },
    ],
    draftVersionId: null,
  };

  const updatedArtifacts = [...artifacts, artifactRef].slice(
    -MAX_ARTIFACTS_PER_THREAD
  );
  const nextMeta = upsertArtifactRefs(meta, updatedArtifacts);

  await prisma.workspace_threads.update({
    where: { id: thread.id },
    data: { metadata: JSON.stringify(nextMeta), lastUpdatedAt: new Date() },
  });

  return artifactRef;
}

async function createArtifactDraftVersionFromText({
  workspace,
  thread,
  user,
  artifactId,
  baseVersionId = null,
  content,
  sourceChatId = null,
  language = null,
}) {
  if (!workspace?.id) throw new Error("workspace is required");
  if (!thread?.id) throw new Error("thread is required");
  if (!isNonEmptyString(artifactId)) throw new Error("artifactId is required");

  const meta = parseThreadMetadata(thread);
  const artifacts = extractArtifactRefs(meta);
  const artifact = artifacts.find((a) => a.id === artifactId);
  if (!artifact) throw new Error("Artifact not found.");

  const versions = Array.isArray(artifact.versions) ? artifact.versions : [];
  const nextVersionNumber = Math.min(
    versions.length + 1,
    MAX_VERSIONS_PER_ARTIFACT
  );
  const versionId = `v${nextVersionNumber}`;

  const version = await writeArtifactDocument({
    workspace,
    thread,
    artifactId,
    versionId,
    title: artifact.title || artifact.name || "Untitled Artifact",
    type: artifact.type || "note",
    content,
    user,
    language: language || artifact.language || null,
    sourceChatId,
    model: workspace?.chatModel,
  });

  const createdAt = version.createdAt;
  const updatedArtifact = {
    ...artifact,
    updatedAt: createdAt,
    draftVersionId: versionId,
    versions: [
      ...versions,
      {
        versionId,
        docId: version.docId,
        docpath: version.docpath,
        summary: version.summary,
        contentTokenCount: version.contentTokenCount,
        language: version.language,
        sourceChatId: version.sourceChatId,
        status: "draft",
        basedOnVersionId: isNonEmptyString(baseVersionId)
          ? baseVersionId
          : null,
        createdAt,
      },
    ].slice(-MAX_VERSIONS_PER_ARTIFACT),
  };

  const updatedArtifacts = artifacts.map((a) =>
    a.id === artifactId ? updatedArtifact : a
  );
  const nextMeta = upsertArtifactRefs(meta, updatedArtifacts);

  await prisma.workspace_threads.update({
    where: { id: thread.id },
    data: { metadata: JSON.stringify(nextMeta), lastUpdatedAt: new Date() },
  });

  return { artifact: updatedArtifact, versionId, docId: version.docId };
}

async function promoteArtifactVersion({ thread, artifactId, versionId }) {
  const meta = parseThreadMetadata(thread);
  const artifacts = extractArtifactRefs(meta);
  const artifact = artifacts.find((a) => a.id === artifactId);
  if (!artifact) throw new Error("Artifact not found.");

  const versions = Array.isArray(artifact.versions) ? artifact.versions : [];
  const version = versions.find((v) => v.versionId === versionId);
  if (!version) throw new Error("Version not found.");

  const updatedAt = nowISO();
  const updatedArtifact = {
    ...artifact,
    currentVersionId: versionId,
    draftVersionId:
      artifact.draftVersionId === versionId ? null : artifact.draftVersionId,
    docId: version.docId,
    summary: version.summary,
    contentTokenCount: version.contentTokenCount,
    updatedAt,
    versions: versions.map((v) => ({
      ...v,
      status: v.versionId === versionId ? "current" : v.status,
    })),
  };

  const updatedArtifacts = artifacts.map((a) =>
    a.id === artifactId ? updatedArtifact : a
  );
  const nextMeta = upsertArtifactRefs(meta, updatedArtifacts);

  await prisma.workspace_threads.update({
    where: { id: thread.id },
    data: { metadata: JSON.stringify(nextMeta), lastUpdatedAt: new Date() },
  });

  return updatedArtifact;
}

async function getArtifactVersionContent({ thread, artifactId, versionId }) {
  const meta = parseThreadMetadata(thread);
  const artifacts = extractArtifactRefs(meta);
  const artifact = artifacts.find((a) => a.id === artifactId);
  if (!artifact) throw new Error("Artifact not found.");

  const versions = Array.isArray(artifact.versions) ? artifact.versions : [];
  const version = versions.find((v) => v.versionId === versionId);
  if (!version?.docpath) throw new Error("Version content not available.");
  const content = await readArtifactContentByDocpath(version.docpath);
  return { artifact, version, content };
}

module.exports = {
  normalizeArtifactType,
  listArtifactsForThread,
  createArtifactFromChat,
  createArtifactDraftVersionFromText,
  promoteArtifactVersion,
  getArtifactVersionContent,
};
