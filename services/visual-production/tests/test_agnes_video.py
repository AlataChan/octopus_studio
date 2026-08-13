import unittest

from octopus_visual_production import providers as P
from octopus_visual_production import http_client


AGNES_CFG = {"env_key": "AGNES_API_KEY", "base_url": "https://apihub.agnes-ai.com"}
MODEL = {"model": "agnes-video-v2.0", "adapter": "agnes_video"}


class TestAgnesVideoHelpers(unittest.TestCase):
    def test_ratio_to_wh(self):
        self.assertEqual(P.agnes_ratio_to_wh("16:9"), (1152, 768))
        self.assertEqual(P.agnes_ratio_to_wh("9:16"), (768, 1152))
        self.assertEqual(P.agnes_ratio_to_wh("weird"), (1152, 768))

    def test_num_frames_snaps_to_8n_plus_1_and_caps(self):
        self.assertEqual(P.agnes_num_frames(5, 24), 121)   # 120 -> 121
        self.assertEqual(P.agnes_num_frames(3, 24), 73)    # 72 -> 73
        self.assertEqual(P.agnes_num_frames(100, 24), 441) # cap
        self.assertEqual((P.agnes_num_frames(5, 24) - 1) % 8, 0)


class TestAgnesVideoSubmitPoll(unittest.TestCase):
    def setUp(self):
        self._real = http_client.request_json
        self.sent = {}

        def fake(method, url, headers, body=None, timeout=120):
            self.sent.update(method=method, url=url, headers=headers, body=body)
            if url.endswith("/v1/videos"):
                return {"task_id": "task_1", "video_id": "video_9", "status": "queued"}
            return {"status": "completed",
                    "remixed_from_video_id": "https://storage.googleapis.com/x/video_9.mp4"}

        http_client.request_json = fake

    def tearDown(self):
        http_client.request_json = self._real

    def test_submit_uses_video_id_as_task_id_and_maps_params(self):
        prov = P.provider_for("agnes", AGNES_CFG, api_keys={"AGNES_API_KEY": "k"})
        res = prov.submit(MODEL, {"prompt": "hi", "ratio": "16:9", "duration": 5})
        self.assertEqual(res.task_id, "video_9")
        self.assertTrue(self.sent["url"].endswith("/v1/videos"))
        self.assertEqual(self.sent["body"]["num_frames"], 121)
        self.assertEqual((self.sent["body"]["width"], self.sent["body"]["height"]), (1152, 768))
        self.assertEqual(self.sent["headers"]["Authorization"], "Bearer k")

    def test_poll_extracts_result_url(self):
        prov = P.provider_for("agnes", AGNES_CFG, api_keys={"AGNES_API_KEY": "k"})
        res = prov.poll({"task_id": "video_9",
                         "choice": {"adapter": "agnes_video", "model": "agnes-video-v2.0"}})
        self.assertEqual(res.status, "completed")
        self.assertIn("https://storage.googleapis.com/x/video_9.mp4", res.result_urls)
        self.assertIn("video_id=video_9", self.sent["url"])

    def test_poll_excludes_echoed_request_reference_urls(self):
        # If the provider echoes a user-supplied reference URL, it must NOT become a result url.
        prov = P.provider_for("agnes", AGNES_CFG, api_keys={"AGNES_API_KEY": "k"})
        echoed = "http://127.0.0.1:9/internal.mp4"
        http_client.request_json = lambda *a, **k: {
            "status": "completed",
            "input": {"video_url": echoed},
            "remixed_from_video_id": "https://storage.googleapis.com/x/video_9.mp4",
        }  # tearDown restores the real function
        res = prov.poll({"task_id": "video_9",
                         "choice": {"adapter": "agnes_video", "model": "agnes-video-v2.0"},
                         "request": {"video_urls": [echoed]}})
        self.assertNotIn(echoed, res.result_urls or [])
        self.assertIn("https://storage.googleapis.com/x/video_9.mp4", res.result_urls)


class TestResultDownloadUrls(unittest.TestCase):
    def test_keeps_result_drops_echoed_and_nonhttp(self):
        from octopus_visual_production import media
        raw = {"remixed_from_video_id": "https://cdn/x.mp4",
               "input": {"video_url": "https://user/ref.mp4"},
               "note": "data:image/png;base64,AAAA"}
        out = media.result_download_urls(
            raw,
            {"video_urls": ["https://user/ref.mp4"], "image_urls": [], "audio_urls": []},
            preferred=[raw["remixed_from_video_id"]],
        )
        self.assertEqual(out, ["https://cdn/x.mp4"])  # echoed ref + data-uri dropped


if __name__ == "__main__":
    unittest.main()
