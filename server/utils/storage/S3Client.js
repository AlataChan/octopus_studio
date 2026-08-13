/**
 * @fileoverview 存储客户端封装
 * 用于临时分析文件的存储和管理
 *
 * @description
 * 支持三种存储后端（通过 STORAGE_BACKEND 环境变量切换）：
 * - local: 本地文件系统（开发环境推荐）
 * - s3: AWS S3 或 MinIO（生产环境推荐）
 *
 * 文件默认保留 30 天后自动删除
 */

const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { v4: uuidv4 } = require("uuid");

// S3 相关模块延迟加载（仅在使用 S3 后端时加载）
let AwsS3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  Upload,
  getSignedUrl;

/**
 * 获取存储后端类型
 * @returns {'local'|'s3'}
 */
function getStorageBackend() {
  return process.env.STORAGE_BACKEND || "local";
}

/**
 * 检查临时分析层是否启用
 * 默认启用，仅当存储后端不可用时返回 false
 * @returns {boolean}
 */
function isEnabled() {
  const backend = getStorageBackend();
  if (backend === "local") return true;
  if (backend === "s3") return !!process.env.S3_ENDPOINT;
  return true; // 默认启用 local 后端
}

/**
 * 获取本地存储目录
 * @returns {string}
 */
function getLocalStorageDir() {
  return path.resolve(
    process.env.STORAGE_DIR || path.join(__dirname, "../../storage"),
    "analysis-files"
  );
}

/**
 * 确保本地存储目录存在
 * @param {string} subDir - 子目录（可选）
 */
async function ensureLocalDirExists(subDir = "") {
  const dir = subDir
    ? path.join(getLocalStorageDir(), subDir)
    : getLocalStorageDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 加载 S3 相关模块（延迟加载）
 */
function loadS3Modules() {
  if (!AwsS3Client) {
    const s3Client = require("@aws-sdk/client-s3");
    AwsS3Client = s3Client.S3Client;
    PutObjectCommand = s3Client.PutObjectCommand;
    GetObjectCommand = s3Client.GetObjectCommand;
    DeleteObjectCommand = s3Client.DeleteObjectCommand;
    ListObjectsV2Command = s3Client.ListObjectsV2Command;
    HeadBucketCommand = s3Client.HeadBucketCommand;
    CreateBucketCommand = s3Client.CreateBucketCommand;
    PutBucketLifecycleConfigurationCommand =
      s3Client.PutBucketLifecycleConfigurationCommand;
    Upload = require("@aws-sdk/lib-storage").Upload;
    getSignedUrl = require("@aws-sdk/s3-request-presigner").getSignedUrl;
  }
}

/**
 * 获取 S3 客户端配置
 * @returns {Object|null}
 */
function getConfig() {
  if (getStorageBackend() !== "s3") return null;
  if (!process.env.S3_ENDPOINT) return null;

  return {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true, // MinIO 需要
  };
}

/**
 * 创建 S3 客户端实例
 * @returns {AwsS3Client|null}
 */
function createClient() {
  const config = getConfig();
  if (!config) return null;
  loadS3Modules();
  return new AwsS3Client(config);
}

/**
 * 获取 bucket 名称
 * @returns {string}
 */
function getBucketName() {
  return process.env.S3_BUCKET || "alata-analysis";
}

/**
 * 获取文件保留天数
 * @returns {number}
 */
function getRetentionDays() {
  return parseInt(process.env.ANALYSIS_FILE_RETENTION_DAYS || "30", 10);
}

/**
 * 获取最大文件大小（字节）
 * @returns {number}
 */
function getMaxFileSize() {
  return parseInt(process.env.ANALYSIS_FILE_MAX_SIZE || "524288000", 10); // 默认 500MB
}

/**
 * 确保 bucket 存在，如果不存在则创建
 * @param {AwsS3Client} client
 */
async function ensureBucketExists(client) {
  const bucket = getBucketName();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[S3Client] Bucket "${bucket}" already exists.`);
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      console.log(`[S3Client] Creating bucket "${bucket}"...`);
      await client.send(new CreateBucketCommand({ Bucket: bucket }));

      // 设置生命周期策略（30 天后自动删除）
      await setLifecyclePolicy(client);
      console.log(
        `[S3Client] Bucket "${bucket}" created with ${getRetentionDays()}-day retention policy.`
      );
    } else {
      throw err;
    }
  }
}

/**
 * 设置 bucket 的生命周期策略
 * @param {AwsS3Client} client
 */
async function setLifecyclePolicy(client) {
  const bucket = getBucketName();
  const days = getRetentionDays();

  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "auto-delete-after-retention",
            Status: "Enabled",
            Filter: { Prefix: "" },
            Expiration: { Days: days },
          },
        ],
      },
    })
  );
}

/**
 * 生成唯一的文件 key
 * @param {string} originalFilename - 原始文件名
 * @param {number} workspaceId - 工作区 ID
 * @returns {string}
 */
function generateFileKey(originalFilename, workspaceId) {
  const ext = path.extname(originalFilename);
  const timestamp = Date.now();
  const uuid = uuidv4().slice(0, 8);
  return `workspace-${workspaceId}/${timestamp}-${uuid}${ext}`;
}

/**
 * 上传文件
 * @param {Buffer|ReadableStream} body - 文件内容
 * @param {string} originalFilename - 原始文件名
 * @param {number} workspaceId - 工作区 ID
 * @param {string} contentType - MIME 类型
 * @returns {Promise<{key: string, url: string}>}
 */
async function uploadFile(body, originalFilename, workspaceId, contentType) {
  if (!isEnabled()) {
    throw new Error("存储后端配置异常，请检查 STORAGE_BACKEND 设置");
  }

  const key = generateFileKey(originalFilename, workspaceId);
  const backend = getStorageBackend();

  if (backend === "local") {
    // 本地文件系统存储
    const workspaceDir = await ensureLocalDirExists(`workspace-${workspaceId}`);
    const filePath = path.join(workspaceDir, path.basename(key));

    // 写入文件
    const buffer = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    await fs.writeFile(filePath, buffer);

    // 写入元数据文件
    const metadataPath = filePath + ".meta.json";
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        originalFilename,
        workspaceId,
        contentType,
        uploadTime: new Date().toISOString(),
        size: buffer.length,
      })
    );

    console.log(`[StorageClient] Local file saved: ${filePath}`);
    return {
      key,
      url: `file://${filePath}`,
    };
  } else {
    // S3/MinIO 存储
    const client = createClient();
    if (!client) {
      throw new Error("S3 配置无效，请检查环境变量");
    }

    await ensureBucketExists(client);
    const bucket = getBucketName();

    loadS3Modules();
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: {
          "original-filename": encodeURIComponent(originalFilename),
          "workspace-id": String(workspaceId),
          "upload-time": new Date().toISOString(),
        },
      },
    });

    await upload.done();
    return {
      key,
      url: `s3://${bucket}/${key}`,
    };
  }
}

/**
 * 将 ReadableStream 转换为 Buffer
 * @param {ReadableStream} stream
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * 获取文件的访问 URL（本地返回文件路径，S3 返回预签名 URL）
 * @param {string} key - 文件 key
 * @param {number} expiresIn - URL 过期时间（秒），默认 1 小时（仅 S3）
 * @returns {Promise<string>}
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  if (!isEnabled()) {
    throw new Error("临时分析层未启用");
  }

  const backend = getStorageBackend();

  if (backend === "local") {
    // 本地文件：直接返回文件路径
    const filePath = path.join(getLocalStorageDir(), key);
    return filePath;
  } else {
    // S3：返回预签名 URL
    const client = createClient();
    if (!client) {
      throw new Error("S3 配置无效");
    }

    loadS3Modules();
    const bucket = getBucketName();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(client, command, { expiresIn });
  }
}

function normalizeWorkspaceS3Key(key) {
  return String(key || "").replace(/^\/+/, "");
}

function assertWorkspaceScopedKey(key, workspaceId) {
  const normalizedKey = normalizeWorkspaceS3Key(key);
  const prefix = `workspaces/${workspaceId}/`;
  const segments = normalizedKey.split("/");

  if (!normalizedKey.startsWith(prefix) || segments.includes("..")) {
    throw new Error("Key not in workspace prefix");
  }

  return normalizedKey;
}

/**
 * 获取工作区图像资产的 S3 GET 预签名 URL
 * @param {Object} params
 * @param {string} params.key - S3 object key
 * @param {number|string} params.workspaceId - Workspace ID
 * @param {number} [params.expiresInSec=900] - Expiry in seconds, capped to 15 minutes
 * @returns {Promise<{url: string, expiresAt: string}>}
 */
async function getPresignedGetUrl({ key, workspaceId, expiresInSec = 900 }) {
  if (!isEnabled()) {
    throw new Error("临时分析层未启用");
  }

  const scopedKey = assertWorkspaceScopedKey(key, workspaceId);
  const requestedExpiry = Number(expiresInSec);
  let safeExpiry =
    Number.isFinite(requestedExpiry) && requestedExpiry > 0
      ? Math.floor(requestedExpiry)
      : 900;
  if (safeExpiry > 900) {
    console.warn(
      `[S3Client] Presigned GET expiry capped from ${safeExpiry}s to 900s`
    );
    safeExpiry = 900;
  }

  const client = createClient();
  if (!client) {
    throw new Error("S3 配置无效");
  }

  loadS3Modules();
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: scopedKey,
  });
  const url = await getSignedUrl(client, command, { expiresIn: safeExpiry });

  return {
    url,
    expiresAt: new Date(Date.now() + safeExpiry * 1000).toISOString(),
  };
}

/**
 * 下载文件
 * @param {string} key - 文件 key
 * @returns {Promise<{body: ReadableStream|Buffer, contentType: string, metadata: Object}>}
 */
async function downloadFile(key) {
  if (!isEnabled()) {
    throw new Error("临时分析层未启用");
  }

  const backend = getStorageBackend();

  if (backend === "local") {
    const filePath = path.join(getLocalStorageDir(), key);
    const metadataPath = filePath + ".meta.json";

    const body = await fs.readFile(filePath);
    let metadata = {};
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, "utf-8"));
    } catch (_e) {
      // 元数据文件不存在
    }

    return {
      body,
      contentType: metadata.contentType || "application/octet-stream",
      metadata,
    };
  } else {
    const client = createClient();
    if (!client) {
      throw new Error("S3 配置无效");
    }

    loadS3Modules();
    const bucket = getBucketName();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return {
      body: response.Body,
      contentType: response.ContentType,
      metadata: response.Metadata,
    };
  }
}

/**
 * 删除文件
 * @param {string} key - 文件 key
 */
async function deleteFile(key) {
  if (!isEnabled()) return { ok: false, error: "Storage backend disabled" };

  const backend = getStorageBackend();

  if (backend === "local") {
    const filePath = path.join(getLocalStorageDir(), key);
    const metadataPath = filePath + ".meta.json";

    try {
      await fs.unlink(filePath);
      await fs.unlink(metadataPath).catch(() => {}); // 元数据可能不存在
      console.log(`[StorageClient] Local file deleted: ${filePath}`);
      return { ok: true };
    } catch (err) {
      if (err.code === "ENOENT") return { ok: true, alreadyDeleted: true };
      return { ok: false, error: err.message };
    }
  } else {
    const client = createClient();
    if (!client) return { ok: false, error: "S3 client not configured" };

    loadS3Modules();
    const bucket = getBucketName();
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await client.send(command);
        return { ok: true };
      } catch (error) {
        if (isNotFoundError(error)) {
          return { ok: true, alreadyDeleted: true };
        }

        if (attempt === 0 && isRetryableServerError(error)) {
          await sleep(200);
          continue;
        }

        return { ok: false, error: error.message };
      }
    }

    return { ok: false, error: "S3 delete failed" };
  }
}

function isNotFoundError(error) {
  return (
    error?.name === "NoSuchKey" ||
    error?.name === "NotFound" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

function isRetryableServerError(error) {
  const status = Number(error?.$metadata?.httpStatusCode);
  return status >= 500 && status < 600;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 列出工作区的所有文件
 * @param {number} workspaceId - 工作区 ID
 * @returns {Promise<Array<{key: string, size: number, lastModified: Date, originalFilename?: string}>>}
 */
async function listWorkspaceFiles(workspaceId) {
  if (!isEnabled()) return [];

  const backend = getStorageBackend();

  if (backend === "local") {
    const workspaceDir = path.join(
      getLocalStorageDir(),
      `workspace-${workspaceId}`
    );

    try {
      const files = await fs.readdir(workspaceDir);
      const result = [];

      for (const file of files) {
        if (file.endsWith(".meta.json")) continue; // 跳过元数据文件

        const filePath = path.join(workspaceDir, file);
        const metadataPath = filePath + ".meta.json";
        const stat = await fs.stat(filePath);

        let metadata = {};
        try {
          metadata = JSON.parse(await fs.readFile(metadataPath, "utf-8"));
        } catch (_e) {
          // 元数据不存在
        }

        result.push({
          key: `workspace-${workspaceId}/${file}`,
          size: stat.size,
          lastModified: stat.mtime,
          originalFilename: metadata.originalFilename,
        });
      }

      return result;
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  } else {
    const client = createClient();
    if (!client) return [];

    loadS3Modules();
    const bucket = getBucketName();
    const prefix = `workspace-${workspaceId}/`;

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      })
    );

    return (response.Contents || []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }));
  }
}

/**
 * 检查连接状态
 * @returns {Promise<{connected: boolean, backend: string, bucket?: string, storageDir?: string, error?: string}>}
 */
async function checkConnection() {
  if (!isEnabled()) {
    return { connected: false, backend: null, error: "临时分析层未启用" };
  }

  const backend = getStorageBackend();

  if (backend === "local") {
    // 本地文件系统：检查目录是否可写
    const storageDir = getLocalStorageDir();
    try {
      await ensureLocalDirExists();
      // 测试写入权限
      const testFile = path.join(storageDir, ".write-test");
      await fs.writeFile(testFile, "test");
      await fs.unlink(testFile);
      return { connected: true, backend: "local", storageDir };
    } catch (err) {
      return {
        connected: false,
        backend: "local",
        storageDir,
        error: err.message,
      };
    }
  } else {
    // S3：检查 bucket 连接
    const client = createClient();
    const bucket = getBucketName();

    if (!client) {
      return {
        connected: false,
        backend: "s3",
        bucket,
        error: "S3 客户端配置无效",
      };
    }

    try {
      loadS3Modules();
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { connected: true, backend: "s3", bucket };
    } catch (err) {
      // 如果 bucket 不存在，尝试创建
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        try {
          await ensureBucketExists(client);
          return { connected: true, backend: "s3", bucket };
        } catch (createErr) {
          return {
            connected: false,
            backend: "s3",
            bucket,
            error: createErr.message,
          };
        }
      }
      return { connected: false, backend: "s3", bucket, error: err.message };
    }
  }
}

module.exports = {
  isEnabled,
  getStorageBackend,
  getLocalStorageDir,
  getConfig,
  createClient,
  getBucketName,
  getRetentionDays,
  getMaxFileSize,
  ensureBucketExists,
  uploadFile,
  getPresignedUrl,
  getPresignedGetUrl,
  downloadFile,
  deleteFile,
  listWorkspaceFiles,
  checkConnection,
};
