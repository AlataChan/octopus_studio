process.env.STORAGE_DIR = "test-storage"; // needed for tests to run
const { YoutubeTranscript } = require("../../../../../utils/extensions/YoutubeTranscript/YoutubeLoader/youtube-transcript.js");

describe("YoutubeTranscript", () => {
  const watchPageHtml = `
    <!doctype html>
    <html>
      <head></head>
      <body>
        <script>
          // Keep JSON formatting compatible with the captions parser in
          // youtube-transcript.js (expects captions JSON adjacent to videoDetails).
          var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"en","kind":"asr"},{"languageCode":"en"},{"languageCode":"zh-HK"}]}},"videoDetails":{}};
        </script>
      </body>
    </html>
  `;

  const transcriptResponse = {
    actions: [
      {
        updateEngagementPanelAction: {
          content: {
            transcriptRenderer: {
              content: {
                transcriptSearchPanelRenderer: {
                  body: {
                    transcriptSegmentListRenderer: {
                      initialSegments: [
                        {
                          transcriptSegmentRenderer: {
                            snippet: { runs: [{ text: "hello" }, { text: " world" }] },
                          },
                        },
                        {
                          transcriptSegmentRenderer: {
                            snippet: { runs: [{ text: "foo" }] },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn(async (url) => {
      if (String(url).startsWith("https://www.youtube.com/watch?v=")) {
        return {
          ok: true,
          text: async () => watchPageHtml,
        };
      }

      if (String(url).includes("https://www.youtube.com/youtubei/v1/get_transcript")) {
        return {
          ok: true,
          json: async () => transcriptResponse,
        };
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });
  });

  it("should fetch transcript from YouTube video", async () => {
    const videoId = "BJjsfNO5JTo";
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });

    expect(transcript).toBe("hello world foo");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should fetch non asr transcript from YouTube video", async () => {
    const videoId = "D111ao6wWH0";
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: "zh-HK" });

    expect(transcript).toBe("hello world foo");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
