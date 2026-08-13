import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from octopus_visual_production import webserver as ws, service, config as cfg


def post(port, path, obj):
    c = HTTPConnection("127.0.0.1", port)
    c.request("POST", path, body=json.dumps(obj), headers={"Content-Type": "application/json"})
    return c.getresponse()


class TestComposeEndpoint(unittest.TestCase):
    def _serve(self):
        httpd = ws.make_server("127.0.0.1", 0, cfg.load_config())
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        return httpd, httpd.server_address[1]

    def test_rejects_video_outside_runs(self):
        httpd, port = self._serve()
        try:
            r = post(port, "/api/compose", {"video": "../../etc/passwd", "title": "x"})
            self.assertEqual(r.status, 400)
        finally:
            httpd.shutdown()

    def test_rejects_out_name_traversal(self):
        # real input file present, so the ONLY reason for 400 is the bad out_name
        with TemporaryDirectory() as d, \
             mock.patch.object(service.job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(ws, "RUNS_DIR", Path(d)):
            src = Path(d) / "job1" / "results"; src.mkdir(parents=True)
            (src / "a.mp4").write_bytes(b"clip")
            httpd, port = self._serve()
            try:
                r = post(port, "/api/compose",
                         {"video": "job1/results/a.mp4", "title": "x", "out_name": "../escape.mp4"})
                self.assertEqual(r.status, 400)
            finally:
                httpd.shutdown()

    def test_success_titles_and_is_retrievable(self):
        with TemporaryDirectory() as d, \
             mock.patch.object(service.job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(ws, "RUNS_DIR", Path(d)):
            src = Path(d) / "job1" / "results"; src.mkdir(parents=True)
            (src / "a.mp4").write_bytes(b"clip")

            def fake_title(input_path, out_path, title, **kw):
                Path(out_path).parent.mkdir(parents=True, exist_ok=True)
                Path(out_path).write_bytes(b"titled"); return Path(out_path)

            with mock.patch.object(service, "add_title_card", side_effect=fake_title):
                httpd, port = self._serve()
                try:
                    r = post(port, "/api/compose",
                             {"video": "job1/results/a.mp4", "title": "环境公益", "out_name": "promo.mp4"})
                    self.assertEqual(r.status, 200)
                    body = json.loads(r.read())
                    c = HTTPConnection("127.0.0.1", port)
                    c.request("GET", f"/api/results/{body['job_id']}/promo.mp4")
                    self.assertEqual(c.getresponse().status, 200)
                finally:
                    httpd.shutdown()

    def test_compose_surfaces_service_error_as_400(self):
        # e.g. no CJK font on server -> add_title_card raises RuntimeError -> 400 with message
        with TemporaryDirectory() as d, \
             mock.patch.object(service.job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(ws, "RUNS_DIR", Path(d)):
            src = Path(d) / "job1" / "results"; src.mkdir(parents=True)
            (src / "a.mp4").write_bytes(b"clip")
            with mock.patch.object(service, "add_title_card",
                                   side_effect=RuntimeError("未找到中文字体，请设置 FONT_PATH")):
                httpd, port = self._serve()
                try:
                    r = post(port, "/api/compose", {"video": "job1/results/a.mp4", "title": "标题"})
                    self.assertEqual(r.status, 400)
                    self.assertIn("字体", json.loads(r.read()).get("error", ""))
                finally:
                    httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
