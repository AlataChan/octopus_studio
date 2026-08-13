import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from octopus_visual_production import webserver as ws, service, config as cfg, http_client


class ServerFixture:
    def __init__(self, config):
        self.httpd = ws.make_server("127.0.0.1", 0, config)
        self.port = self.httpd.server_address[1]
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
    def __enter__(self):
        self.t.start(); return self
    def __exit__(self, *a):
        self.httpd.shutdown()
    def conn(self):
        return HTTPConnection("127.0.0.1", self.port)


class TestApi(unittest.TestCase):
    def setUp(self):
        import os
        for k in ("AGNES_API_KEY", "ARK_API_KEY", "DASHSCOPE_API_KEY"):
            os.environ.pop(k, None)

    def test_config_reports_booleans_not_keys(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("GET", "/api/config"); r = c.getresponse()
            body = json.loads(r.read())
            self.assertIn("tasks", body)
            self.assertIn("providers", body)
            self.assertIn("server_keys", body)
            self.assertIsInstance(body["server_keys"], dict)
            for provider in body["providers"]:
                self.assertIsInstance(provider.get("env_key"), str)
            for model in body["models"]:
                self.assertIsInstance(model.get("adapter"), str)
            for v in body["server_keys"].values():
                self.assertIsInstance(v, bool)

    def test_config_reports_title_card_boolean(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("GET", "/api/config"); r = c.getresponse()
            body = json.loads(r.read())
            self.assertIn("title_card", body)
            self.assertIsInstance(body["title_card"], bool)

    def test_post_jobs_requires_json_content_type(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("POST", "/api/jobs", body="x",
                                    headers={"Content-Type": "text/plain"})
            self.assertEqual(c.getresponse().status, 415)

    def test_post_jobs_without_key_returns_400(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn()
            c.request("POST", "/api/jobs",
                      body=json.dumps({"task": "video.final", "prompt": "x"}),
                      headers={"Content-Type": "application/json"})
            self.assertEqual(c.getresponse().status, 400)

    def test_results_path_traversal_blocked(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("GET", "/api/results/..%2f..%2fetc/passwd")
            self.assertIn(c.getresponse().status, (400, 404))

    def test_job_id_traversal_blocked(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("GET", "/api/jobs/..%2f..%2f..%2fetc")
            self.assertIn(c.getresponse().status, (400, 404))

    def test_static_assets_are_no_store(self):
        with ServerFixture(cfg.load_config()) as s:
            for path in ("/", "/app.js"):
                c = s.conn()
                c.request("GET", path)
                response = c.getresponse()
                response.read()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.getheader("Cache-Control").lower(), "no-store")

    def test_config_includes_pricing_and_budget(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("GET", "/api/config"); r = c.getresponse()
            body = json.loads(r.read())
            self.assertIn("budget", body)
            self.assertIn("usd_cny_rate", body["budget"])
            self.assertTrue(all("pricing" in m for m in body["models"]))
            for v in body["server_keys"].values():
                self.assertIsInstance(v, bool)  # still no key values

    def test_estimate_endpoint_returns_cny_with_key(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn()
            c.request("POST", "/api/estimate",
                      body=json.dumps({"task": "video.final", "duration": 5}),
                      headers={"Content-Type": "application/json", "X-Agnes-Key": "k"})
            r = c.getresponse()
            self.assertEqual(r.status, 200)
            body = json.loads(r.read())
            self.assertEqual(body["model_id"], "agnes.video_v2")
            self.assertEqual(body["cny"], 0)  # agnes free

    def test_estimate_requires_json(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn(); c.request("POST", "/api/estimate", body="x",
                                    headers={"Content-Type": "text/plain"})
            self.assertEqual(c.getresponse().status, 415)

    def test_estimate_without_key_400(self):
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn()
            c.request("POST", "/api/estimate",
                      body=json.dumps({"task": "video.final", "duration": 5}),
                      headers={"Content-Type": "application/json"})
            self.assertEqual(c.getresponse().status, 400)

    def test_estimate_explicit_model_needs_no_key(self):
        # an estimate is just pricing; an explicit model resolves without a key -> 200
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn()
            c.request("POST", "/api/estimate",
                      body=json.dumps({"task": "video.final", "model_id": "volc.seedance_2_0_mini", "duration": 5}),
                      headers={"Content-Type": "application/json"})
            r = c.getresponse()
            self.assertEqual(r.status, 200)
            body = json.loads(r.read())
            self.assertEqual(body["model_id"], "volc.seedance_2_0_mini")
            self.assertIsNotNone(body["cny"])

    def test_estimate_request_aware_skips_agnes_for_video_refs(self):
        # mirrors submit's request-aware routing: a reference video excludes Agnes video
        with ServerFixture(cfg.load_config()) as s:
            c = s.conn()
            c.request("POST", "/api/estimate",
                      body=json.dumps({"task": "video.multimodal", "duration": 5,
                                       "video_urls": ["https://x/v.mp4"]}),
                      headers={"Content-Type": "application/json", "X-Agnes-Key": "k", "X-Ark-Key": "k"})
            r = c.getresponse()
            self.assertEqual(r.status, 200)
            self.assertNotEqual(json.loads(r.read())["model_id"], "agnes.video_v2")

    def test_estimate_creates_no_run_dir(self):
        with TemporaryDirectory() as d, \
             mock.patch.object(service.job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(ws, "RUNS_DIR", Path(d)):
            with ServerFixture(cfg.load_config()) as s:
                c = s.conn()
                c.request("POST", "/api/estimate",
                          body=json.dumps({"task": "video.final", "duration": 5}),
                          headers={"Content-Type": "application/json", "X-Agnes-Key": "k"})
                self.assertEqual(c.getresponse().status, 200)
            self.assertEqual(list(Path(d).glob("*")), [])  # estimate is read-only


if __name__ == "__main__":
    unittest.main()
