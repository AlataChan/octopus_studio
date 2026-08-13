const express = require("express");
const request = require("supertest");
const {
  DEFAULT_REQUEST_BODY_LIMIT,
  DEFAULT_DOCUMENT_UPLOAD_LIMIT_BYTES,
  DEFAULT_IMAGE_UPLOAD_LIMIT_BYTES,
  DEFAULT_UPLOAD_FIELD_COUNT_LIMIT,
  DEFAULT_UPLOAD_FIELD_SIZE_LIMIT_BYTES,
  DEFAULT_UPLOAD_FILE_COUNT_LIMIT,
  DEFAULT_UPLOAD_PART_COUNT_LIMIT,
  getDocumentUploadLimit,
  getImageUploadLimit,
  getMultipartUploadLimits,
  getRequestBodyLimit,
  getUploadErrorStatusCode,
  parseSizeLimitToBytes,
} = require("../../utils/requestLimits");
const { handleFileUpload } = require("../../utils/files/multer");

function buildUploadApp() {
  const app = express();

  app.post("/upload", handleFileUpload, (req, res) => {
    res.status(200).json({ success: true, filename: req.file?.originalname });
  });

  return app;
}

describe("server request limits", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "development" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("uses modest defaults for global request bodies and uploads", () => {
    expect(getRequestBodyLimit({})).toBe(DEFAULT_REQUEST_BODY_LIMIT);
    expect(getDocumentUploadLimit({})).toBe(DEFAULT_DOCUMENT_UPLOAD_LIMIT_BYTES);
    expect(getImageUploadLimit({})).toBe(DEFAULT_IMAGE_UPLOAD_LIMIT_BYTES);
    expect(getMultipartUploadLimits(123, {})).toEqual({
      fileSize: 123,
      files: DEFAULT_UPLOAD_FILE_COUNT_LIMIT,
      fields: DEFAULT_UPLOAD_FIELD_COUNT_LIMIT,
      parts: DEFAULT_UPLOAD_PART_COUNT_LIMIT,
      fieldSize: DEFAULT_UPLOAD_FIELD_SIZE_LIMIT_BYTES,
    });
  });

  test("accepts byte and unit-based upload limit overrides", () => {
    expect(parseSizeLimitToBytes("1048576", 1)).toBe(1048576);
    expect(parseSizeLimitToBytes("25mb", 1)).toBe(25 * 1024 * 1024);
    expect(parseSizeLimitToBytes("2 GB", 1)).toBe(2 * 1024 * 1024 * 1024);
    expect(getRequestBodyLimit({ REQUEST_BODY_LIMIT: "5mb" })).toBe("5mb");
    expect(
      getDocumentUploadLimit({ DOCUMENT_UPLOAD_FILE_SIZE_LIMIT: "25mb" })
    ).toBe(25 * 1024 * 1024);
    expect(getImageUploadLimit({ IMAGE_UPLOAD_FILE_SIZE_LIMIT: "2mb" })).toBe(
      2 * 1024 * 1024
    );
  });

  test("falls back when upload limit overrides are invalid", () => {
    expect(parseSizeLimitToBytes("0", 123)).toBe(123);
    expect(parseSizeLimitToBytes("-1mb", 123)).toBe(123);
    expect(parseSizeLimitToBytes("not-a-size", 123)).toBe(123);
  });

  test("maps multer file-size errors to payload too large", () => {
    const limitErrors = [
      "LIMIT_FILE_SIZE",
      "LIMIT_FILE_COUNT",
      "LIMIT_FIELD_COUNT",
      "LIMIT_PART_COUNT",
      "LIMIT_FIELD_VALUE",
      "LIMIT_UNEXPECTED_FILE",
    ];

    for (const code of limitErrors) {
      const err = new Error(code);
      err.code = code;
      expect(getUploadErrorStatusCode(err)).toBe(413);
    }
    expect(getUploadErrorStatusCode(new Error("other"))).toBe(500);
  });

  test("file upload middleware returns 413 when uploaded file exceeds configured size", async () => {
    process.env.DOCUMENT_UPLOAD_FILE_SIZE_LIMIT = "1b";

    const response = await request(buildUploadApp())
      .post("/upload")
      .attach("file", Buffer.from("too-large"), "large.txt");

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false });
    expect(response.body.error).toContain("Invalid file upload.");
  });

  test("file upload middleware returns 413 when multipart field count is exceeded", async () => {
    process.env.UPLOAD_FIELD_COUNT_LIMIT = "1";

    const response = await request(buildUploadApp())
      .post("/upload")
      .field("first", "one")
      .field("second", "two")
      .attach("file", Buffer.from("ok"), "ok.txt");

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false });
    expect(response.body.error).toContain("Invalid file upload.");
  });

  test("file upload middleware returns 413 when multipart field size is exceeded", async () => {
    process.env.UPLOAD_FIELD_SIZE_LIMIT = "1b";

    const response = await request(buildUploadApp())
      .post("/upload")
      .field("metadata", "too-large")
      .attach("file", Buffer.from("ok"), "ok.txt");

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false });
    expect(response.body.error).toContain("Invalid file upload.");
  });

  test("file upload middleware returns 413 when multipart part count is exceeded", async () => {
    process.env.UPLOAD_PART_COUNT_LIMIT = "1";

    const response = await request(buildUploadApp())
      .post("/upload")
      .field("metadata", "one")
      .attach("file", Buffer.from("ok"), "ok.txt");

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false });
    expect(response.body.error).toContain("Invalid file upload.");
  });
});
