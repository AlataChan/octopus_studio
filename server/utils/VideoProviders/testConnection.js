"use strict";

const path = require("path");
const { getVideoProvider } = require("./index");

const TEST_VIDEO_FIXTURE_PATH = path.join(
  __dirname,
  "fixtures",
  "video-understanding-test.mp4"
);

async function testVideoUnderstandingConnection(
  input = {},
  {
    providerFactory = getVideoProvider,
    fixturePath = TEST_VIDEO_FIXTURE_PATH,
  } = {}
) {
  try {
    const provider = await providerFactory(input.provider, input);
    const { sourceRef } = await provider.uploadVideo({
      path: fixturePath,
      filename: "video-understanding-test.mp4",
      mimeType: "video/mp4",
    });
    const summary = await provider.understand({ sourceRef });
    return { ok: true, summary };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
    };
  }
}

module.exports = {
  TEST_VIDEO_FIXTURE_PATH,
  testVideoUnderstandingConnection,
};
