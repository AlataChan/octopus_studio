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


class TestStitchEndpoint(unittest.TestCase):
    def test_rejects_out_name_traversal(self):
        httpd = ws.make_server("127.0.0.1", 0, cfg.load_config())
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True); t.start()
        try:
            r = post(port, "/api/stitch", {"inputs": [], "out_name": "../escape.mp4"})
            self.assertEqual(r.status, 400)
            r2 = post(port, "/api/stitch", {"inputs": [], "out_name": "/etc/x.mp4"})
            self.assertEqual(r2.status, 400)
        finally:
            httpd.shutdown()

    def test_rejects_inputs_outside_runs(self):
        httpd = ws.make_server("127.0.0.1", 0, cfg.load_config())
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True); t.start()
        try:
            r = post(port, "/api/stitch", {"inputs": ["../../etc/passwd"], "out_name": "ok.mp4"})
            self.assertEqual(r.status, 400)
        finally:
            httpd.shutdown()

    def test_success_writes_output_and_is_retrievable(self):
        with TemporaryDirectory() as d, \
             mock.patch.object(service.job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(ws, "RUNS_DIR", Path(d)):
            # one real input under runs/, and stitch stubbed to just create the output file
            src_dir = Path(d) / "job1" / "results"; src_dir.mkdir(parents=True)
            (src_dir / "result-01.mp4").write_bytes(b"clip")
            def fake_stitch(inputs, out_path):
                Path(out_path).parent.mkdir(parents=True, exist_ok=True)
                Path(out_path).write_bytes(b"stitched"); return Path(out_path)
            with mock.patch.object(service, "stitch_videos", side_effect=fake_stitch):
                httpd = ws.make_server("127.0.0.1", 0, cfg.load_config())
                port = httpd.server_address[1]
                threading.Thread(target=httpd.serve_forever, daemon=True).start()
                try:
                    r = post(port, "/api/stitch",
                             {"inputs": ["job1/results/result-01.mp4"], "out_name": "promo.mp4"})
                    self.assertEqual(r.status, 200)
                    body = json.loads(r.read())
                    self.assertIn("job_id", body)
                    c = HTTPConnection("127.0.0.1", port)
                    c.request("GET", f"/api/results/{body['job_id']}/promo.mp4")
                    self.assertEqual(c.getresponse().status, 200)
                finally:
                    httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
