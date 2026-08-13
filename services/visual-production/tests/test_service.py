import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from octopus_visual_production import service, config as cfg, http_client, job_store


class TestRedact(unittest.TestCase):
    def test_redacts_keys_and_bearer(self):
        out = service.redact({"AGNES_API_KEY": "secret", "h": {"Authorization": "Bearer abc.def"},
                              "ok": "plain"})
        self.assertEqual(out["AGNES_API_KEY"], "***")
        self.assertEqual(out["h"]["Authorization"], "***")
        self.assertEqual(out["ok"], "plain")


class TestSafeJobSummary(unittest.TestCase):
    def test_progress_from_last_poll_result(self):
        summary = service.safe_job_summary({
            "status": "in_progress",
            "last_poll_result": {"progress": 42},
            "downloaded_files": [],
        })
        self.assertEqual(summary["progress"], 42)

    def test_missing_progress_is_none(self):
        summary = service.safe_job_summary({
            "status": "queued",
            "downloaded_files": [],
        })
        self.assertIsNone(summary["progress"])


class TestSubmitAndRun(unittest.TestCase):
    def setUp(self):
        import os
        for k in ("AGNES_API_KEY", "ARK_API_KEY", "DASHSCOPE_API_KEY"):
            os.environ.pop(k, None)

    def test_submit_writes_job_without_secrets_and_sync_downloads(self):
        c = cfg.load_config()
        with TemporaryDirectory() as d, \
             mock.patch.object(job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(http_client, "download_url") as dl, \
             mock.patch.object(http_client, "request_json") as rj:
            # Agnes image: synchronous completed in submit. download is stubbed (no network).
            rj.return_value = {"data": [{"url": "https://x/y.png"}]}
            dl.side_effect = lambda url, output, timeout=300: Path(output).write_bytes(b"x")
            job = service.submit_job(
                c, "image.poster.final", {"prompt": "p", "size": "1024*768"},
                api_keys={"AGNES_API_KEY": "supersecretkey"},
            )
            raw = Path(job["job_path"]).read_text(encoding="utf-8")
            self.assertNotIn("supersecretkey", raw)         # no key material on disk
            self.assertEqual(job["status"], "completed")
            done = service.run_job_to_completion(
                c, Path(job["job_path"]), poll_interval=0, timeout=5,
                api_keys={"AGNES_API_KEY": "supersecretkey"},
            )
            self.assertEqual(done["status"], "completed")
            self.assertIn("https://x/y.png", done["result_urls"])
            self.assertTrue(done["downloaded_files"])        # sync image still downloaded media
            self.assertTrue(dl.called)

    def test_background_run_captures_exception_as_failed(self):
        c = cfg.load_config()
        with TemporaryDirectory() as d, \
             mock.patch.object(job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(http_client, "request_json") as rj:
            rj.return_value = {"data": [{"url": "https://x/y.png"}]}
            job = service.submit_job(
                c, "image.poster.final", {"prompt": "p", "size": "1024*768"},
                api_keys={"AGNES_API_KEY": "k"},
            )
            with mock.patch.object(service, "run_job_to_completion", side_effect=RuntimeError("boom")):
                service.run_job_background(c, Path(job["job_path"]), api_keys={"AGNES_API_KEY": "k"})
            after = json.loads(Path(job["job_path"]).read_text(encoding="utf-8"))
            self.assertEqual(after["status"], "failed")
            self.assertIn("boom", after["error"])

    def test_submit_truncates_data_uri_only_in_stored_request(self):
        c = cfg.load_config()
        data_uri = "data:image/png;base64," + ("A" * 5000)
        captured = {}

        def fake_request_json(method, url, headers=None, body=None, timeout=60):
            captured["body"] = body
            return {"data": [{"url": "https://x/y.png"}]}

        with TemporaryDirectory() as d, \
             mock.patch.object(job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(http_client, "download_url") as dl, \
             mock.patch.object(http_client, "request_json", side_effect=fake_request_json):
            dl.side_effect = lambda url, output, timeout=300: Path(output).write_bytes(b"x")
            job = service.submit_job(
                c,
                "image.poster.final",
                {"prompt": "p", "image_urls": [data_uri], "size": "1024x768"},
                model_id="agnes.image_flash",
                api_keys={"AGNES_API_KEY": "k"},
            )

            self.assertIn(data_uri, json.dumps(captured["body"]))
            stored_raw = Path(job["job_path"]).read_text(encoding="utf-8")
            self.assertNotIn("A" * 5000, stored_raw)
            stored = json.loads(stored_raw)
            stored_image = stored["request"]["image_urls"][0]
            self.assertTrue(stored_image.startswith("data:image/png;base64,"))
            self.assertIn("local upload", stored_image)
            self.assertEqual(job["status"], "completed")
            done = service.run_job_to_completion(
                c,
                Path(job["job_path"]),
                poll_interval=0,
                timeout=5,
                api_keys={"AGNES_API_KEY": "k"},
            )
            self.assertEqual(done["status"], "completed")
            self.assertTrue(done["downloaded_files"])


class TestSubmitEstimate(unittest.TestCase):
    def setUp(self):
        import os
        for k in ("AGNES_API_KEY", "ARK_API_KEY", "DASHSCOPE_API_KEY"):
            os.environ.pop(k, None)

    def test_submit_job_stores_estimate(self):
        c = cfg.load_config()
        with TemporaryDirectory() as d, \
             mock.patch.object(job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(http_client, "request_json") as rj:
            rj.return_value = {"data": [{"url": "https://x/y.png"}]}  # agnes image sync
            job = service.submit_job(
                c, "image.poster.final", {"prompt": "p", "size": "1024*768"},
                api_keys={"AGNES_API_KEY": "k"},
            )
            self.assertIn("estimate", job)
            # agnes image price is 0 -> cny 0 (free)
            self.assertEqual(job["estimate"]["cny"], 0)
            # matches estimate_cost directly
            model = c["models"][job["model_id"]]
            expect = service.estimate_cost(model, {"prompt": "p", "size": "1024*768"}, cfg.get_budget(c))
            self.assertEqual(job["estimate"]["cny"], expect["cny"])

    def test_cli_submit_prints_estimate(self):
        import io, contextlib, os
        from octopus_visual_production import cli
        c = cfg.load_config()
        with TemporaryDirectory() as d, \
             mock.patch.object(job_store, "RUNS_DIR", Path(d)), \
             mock.patch.object(http_client, "request_json", return_value={"data": [{"url": "https://x/y.png"}]}), \
             mock.patch.dict(os.environ, {"AGNES_API_KEY": "k"}):
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = cli.main(["submit", "--task", "image.poster.final", "--prompt", "p"])
            self.assertEqual(rc, 0)
            self.assertIn("estimated cost", buf.getvalue())


class TestStitchArgs(unittest.TestCase):
    def test_stitch_invokes_ffmpeg_concat(self):
        with mock.patch("subprocess.run") as sub, mock.patch("shutil.which", return_value="/usr/bin/ffmpeg"):
            service.stitch_videos([Path("a.mp4"), Path("b.mp4")], Path("out.mp4"))
            args = sub.call_args[0][0]
            self.assertEqual(args[0], "ffmpeg")
            self.assertIn("concat=n=2:v=1:a=1[v][a]", " ".join(args))


if __name__ == "__main__":
    unittest.main()
