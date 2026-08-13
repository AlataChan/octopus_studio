const { mockClient } = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");

const {
  S3Client: AwsS3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const mockGetSignedUrl = jest.fn();

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args) => mockGetSignedUrl(...args),
}));

const S3Client = require("../../utils/storage/S3Client");

describe("S3 image asset lifecycle hardening", () => {
  const s3Mock = mockClient(AwsS3Client);
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.STORAGE_BACKEND = "s3";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY = "test-access-key";
    process.env.S3_SECRET_KEY = "test-secret-key";
    process.env.S3_BUCKET = "alata-test-assets";

    s3Mock.reset();
    mockGetSignedUrl.mockReset();
    mockGetSignedUrl.mockResolvedValue("https://signed.example/object.png");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("deleteFile returns ok on successful delete", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    const result = await S3Client.deleteFile("workspaces/7/image.png");

    expect(result).toEqual({ ok: true });
    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
      Bucket: "alata-test-assets",
      Key: "workspaces/7/image.png",
    });
  });

  test("deleteFile treats NoSuchKey as idempotent success", async () => {
    const error = new Error("object missing");
    error.name = "NoSuchKey";
    error.$metadata = { httpStatusCode: 404 };
    s3Mock.on(DeleteObjectCommand).rejects(error);

    const result = await S3Client.deleteFile("workspaces/7/missing.png");

    expect(result).toEqual({ ok: true, alreadyDeleted: true });
  });

  test("deleteFile retries one 5xx failure and returns structured failure", async () => {
    const error = new Error("S3 unavailable");
    error.name = "InternalError";
    error.$metadata = { httpStatusCode: 503 };
    s3Mock.on(DeleteObjectCommand).rejectsOnce(error).rejects(error);

    const result = await S3Client.deleteFile("workspaces/7/image.png");

    expect(result).toEqual({ ok: false, error: "S3 unavailable" });
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(2);
  });

  test("getPresignedGetUrl rejects keys outside the workspace prefix", async () => {
    await expect(
      S3Client.getPresignedGetUrl({
        key: "workspaces/8/image.png",
        workspaceId: 7,
      })
    ).rejects.toThrow("Key not in workspace prefix");
  });

  test("getPresignedGetUrl clamps expiry to 900 seconds", async () => {
    await S3Client.getPresignedGetUrl({
      key: "workspaces/7/image.png",
      workspaceId: 7,
      expiresInSec: 3600,
    });

    expect(mockGetSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 900 });
  });

  test("getPresignedGetUrl signs only a GetObjectCommand", async () => {
    const result = await S3Client.getPresignedGetUrl({
      key: "workspaces/7/image.png",
      workspaceId: 7,
    });

    const [, command] = mockGetSignedUrl.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: "alata-test-assets",
      Key: "workspaces/7/image.png",
    });
    expect(result).toEqual({
      url: "https://signed.example/object.png",
      expiresAt: expect.any(String),
    });
  });
});
