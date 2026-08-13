const express = require("express");
const fs = require("fs/promises");
const jwt = require("jsonwebtoken");
const path = require("path");
const request = require("supertest");

const mockIsMultiUserMode = jest.fn();
const mockUserGet = jest.fn();
const mockImageAssetGet = jest.fn();
const mockImageAssetGetAccessUrl = jest.fn();
const mockWorkspaceUserFindFirst = jest.fn();

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

jest.mock("../../models/user", () => ({
  User: {
    get: (...args) => mockUserGet(...args),
  },
}));

jest.mock("../../models/imageAsset", () => ({
  ImageAsset: {
    get: (...args) => mockImageAssetGet(...args),
    getAccessUrl: (...args) => mockImageAssetGetAccessUrl(...args),
  },
}));

jest.mock("../../utils/prisma", () => ({
  workspace_users: {
    findFirst: (...args) => mockWorkspaceUserFindFirst(...args),
  },
  $disconnect: jest.fn(),
}));

const { workspaceImagesEndpoints } = require("../../endpoints/workspaceImages");

function buildApp() {
  const app = express();
  app.use(express.json());
  workspaceImagesEndpoints(app);
  return app;
}

function tokenFor(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET);
}

function localAsset(storagePath, overrides = {}) {
  return {
    id: "asset-1",
    workspaceId: 1,
    filename: "asset.png",
    mimeType: "image/png",
    storageBackend: "local",
    storagePath,
    expiresAt: null,
    ...overrides,
  };
}

describe("workspace image asset file access", () => {
  const storageRoot = path.resolve(
    __dirname,
    "..",
    ".storage",
    `workspace-images-${process.pid}`
  );
  const assetPath = path.join(storageRoot, "images", "workspace-1", "asset.png");
  const outsidePath = path.resolve(storageRoot, "..", "outside.png");
  let originalNodeEnv;
  let originalJwtSecret;
  let originalStorageDir;

  beforeEach(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    originalJwtSecret = process.env.JWT_SECRET;
    originalStorageDir = process.env.STORAGE_DIR;
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "workspace-images-test-secret";
    process.env.STORAGE_DIR = storageRoot;

    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, "png");

    mockIsMultiUserMode.mockResolvedValue(false);
    mockImageAssetGet.mockResolvedValue(localAsset(assetPath));
    mockImageAssetGetAccessUrl.mockResolvedValue("https://signed.example/asset");
    mockWorkspaceUserFindFirst.mockResolvedValue(null);
    mockUserGet.mockImplementation(({ id }) => {
      if (Number(id) === 1) return { id: 1, role: "default" };
      if (Number(id) === 2) return { id: 2, role: "default" };
      if (Number(id) === 99) return { id: 99, role: "admin" };
      return null;
    });
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.STORAGE_DIR = originalStorageDir;
    await fs.rm(storageRoot, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  test("allows single-user mode access", async () => {
    const app = buildApp();

    await request(app).get("/images/assets/asset-1/file").expect(200);
  });

  test("allows a multi-user workspace member", async () => {
    mockIsMultiUserMode.mockResolvedValue(true);
    mockWorkspaceUserFindFirst.mockResolvedValue({ id: 10 });
    const app = buildApp();

    await request(app)
      .get("/images/assets/asset-1/file")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .expect(200);

    expect(mockWorkspaceUserFindFirst).toHaveBeenCalledWith({
      where: { workspace_id: 1, user_id: 1 },
      select: { id: true },
    });
  });

  test("denies a multi-user non-member", async () => {
    mockIsMultiUserMode.mockResolvedValue(true);
    mockWorkspaceUserFindFirst.mockResolvedValue(null);
    const app = buildApp();

    const response = await request(app)
      .get("/images/assets/asset-1/file")
      .set("Authorization", `Bearer ${tokenFor(2)}`)
      .expect(403);

    expect(response.body).toEqual({
      success: false,
      error: "Forbidden: not a workspace member",
    });
  });

  test("allows a multi-user admin for any workspace", async () => {
    mockIsMultiUserMode.mockResolvedValue(true);
    const app = buildApp();

    await request(app)
      .get("/images/assets/asset-1/file")
      .set("Authorization", `Bearer ${tokenFor(99)}`)
      .expect(200);

    expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
  });

  test("returns 404 when the asset does not exist", async () => {
    mockImageAssetGet.mockResolvedValue(null);
    const app = buildApp();

    await request(app).get("/images/assets/missing/file").expect(404);
  });

  test("returns 404 for a soft-deleted asset", async () => {
    mockImageAssetGet.mockResolvedValue(
      localAsset(assetPath, { expiresAt: new Date() })
    );
    const app = buildApp();

    await request(app).get("/images/assets/asset-1/file").expect(404);
  });

  test("rejects local asset paths outside the storage root", async () => {
    mockImageAssetGet.mockResolvedValue(localAsset(outsidePath));
    const app = buildApp();

    const response = await request(app)
      .get("/images/assets/asset-1/file")
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: "Invalid asset storage path.",
    });
  });

  test("sanitizes Content-Disposition filename values", async () => {
    mockImageAssetGet.mockResolvedValue(
      localAsset(assetPath, {
        filename: 'bad";X-Inject:\\.png',
      })
    );
    const app = buildApp();

    const response = await request(app)
      .get("/images/assets/asset-1/file")
      .expect(200);

    expect(response.headers["content-disposition"]).toContain(
      'filename="bad;X-Inject:.png"'
    );
  });

  test("checks access before redirecting to a presigned S3 URL", async () => {
    mockIsMultiUserMode.mockResolvedValue(true);
    mockWorkspaceUserFindFirst.mockResolvedValue({ id: 11 });
    mockImageAssetGet.mockResolvedValue(
      localAsset("images/workspace-1/asset.png", {
        storageBackend: "s3",
      })
    );
    const app = buildApp();

    const response = await request(app)
      .get("/images/assets/asset-1/file")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .expect(302);

    expect(response.headers.location).toBe("https://signed.example/asset");
    expect(mockWorkspaceUserFindFirst).toHaveBeenCalledWith({
      where: { workspace_id: 1, user_id: 1 },
      select: { id: true },
    });
  });
});
