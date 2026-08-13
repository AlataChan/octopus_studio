import unittest

from octopus_visual_production import providers as P
from octopus_visual_production import http_client


AGNES_CFG = {"env_key": "AGNES_API_KEY", "base_url": "https://apihub.agnes-ai.com"}
IMG_MODEL = {"model": "agnes-image-2.1-flash", "adapter": "agnes_image"}


class TestAgnesImage(unittest.TestCase):
    def setUp(self):
        self._real = http_client.request_json
        self.sent = {}

        def fake(method, url, headers, body=None, timeout=120):
            self.sent.update(url=url, body=body)
            return {"created": 1, "data": [{"url": "https://storage.googleapis.com/x/y.png",
                                            "b64_json": None}]}

        http_client.request_json = fake

    def tearDown(self):
        http_client.request_json = self._real

    def test_size_normalization(self):
        self.assertEqual(P.agnes_normalize_size("1328*1328", None), "1328x1328")
        self.assertEqual(P.agnes_normalize_size(None, "16:9"), "1152x768")
        self.assertEqual(P.agnes_normalize_size(None, None), "1024x768")

    def test_submit_is_synchronous_completed_with_url(self):
        prov = P.provider_for("agnes", AGNES_CFG, api_keys={"AGNES_API_KEY": "k"})
        res = prov.submit(IMG_MODEL, {"prompt": "poster", "size": "1024*768"})
        self.assertEqual(res.status, "completed")
        self.assertEqual(res.result_urls, ["https://storage.googleapis.com/x/y.png"])
        self.assertTrue(self.sent["url"].endswith("/v1/images/generations"))
        self.assertEqual(self.sent["body"]["extra_body"]["response_format"], "url")
        self.assertEqual(self.sent["body"]["size"], "1024x768")

    def test_poll_is_noop_preserving_stored_result(self):
        prov = P.provider_for("agnes", AGNES_CFG, api_keys={"AGNES_API_KEY": "k"})
        job = {"choice": {"adapter": "agnes_image", "model": "agnes-image-2.1-flash"},
               "status": "completed",
               "result_urls": ["https://storage.googleapis.com/x/y.png"]}
        called = {"n": 0}
        real = http_client.request_json
        http_client.request_json = lambda *a, **k: called.__setitem__("n", called["n"] + 1) or {}
        try:
            res = prov.poll(job)
        finally:
            http_client.request_json = real
        self.assertEqual(called["n"], 0)  # no network on image poll
        self.assertEqual(res.status, "completed")
        self.assertEqual(res.result_urls, ["https://storage.googleapis.com/x/y.png"])


if __name__ == "__main__":
    unittest.main()
