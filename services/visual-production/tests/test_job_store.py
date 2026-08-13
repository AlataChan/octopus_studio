import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from octopus_visual_production import job_store


class TestJobStore(unittest.TestCase):
    def test_write_then_read_roundtrip(self):
        with TemporaryDirectory() as d:
            p = Path(d) / "sub" / "job.json"
            job_store.write_json(p, {"a": 1, "中文": "ok"})
            self.assertEqual(job_store.read_json(p), {"a": 1, "中文": "ok"})

    def test_write_is_atomic_no_tmp_left(self):
        with TemporaryDirectory() as d:
            p = Path(d) / "job.json"
            job_store.write_json(p, {"x": 1})
            leftovers = [q.name for q in Path(d).iterdir() if q.name != "job.json"]
            self.assertEqual(leftovers, [])

    def test_read_recovers_from_transient_partial_then_valid(self):
        # Simulate: first read sees truncated file, retry sees full file.
        with TemporaryDirectory() as d:
            p = Path(d) / "job.json"
            p.write_text('{"partial": ', encoding="utf-8")  # invalid JSON
            calls = {"n": 0}
            real_loads = json.loads

            def flaky_loads(s, *a, **k):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise json.JSONDecodeError("boom", s, 0)
                return {"ok": True}

            json.loads = flaky_loads
            try:
                self.assertEqual(job_store.read_json(p), {"ok": True})
                self.assertGreaterEqual(calls["n"], 2)
            finally:
                json.loads = real_loads

    def test_make_run_dir_no_collision_same_second(self):
        from unittest import mock
        with TemporaryDirectory() as d, mock.patch.object(job_store, "RUNS_DIR", Path(d)):
            dirs = {job_store.make_run_dir("p") for _ in range(20)}
            self.assertEqual(len(dirs), 20)  # all unique even within one second


if __name__ == "__main__":
    unittest.main()
