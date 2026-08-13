import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from octopus_visual_production import webserver as ws


class TestSafeSubpath(unittest.TestCase):
    def test_allows_in_tree(self):
        with TemporaryDirectory() as d:
            base = Path(d)
            (base / "results").mkdir()
            (base / "results" / "a.mp4").write_text("x")
            p = ws.safe_subpath(base, "results", "a.mp4")
            self.assertIsNotNone(p)

    def test_blocks_traversal(self):
        with TemporaryDirectory() as d:
            base = Path(d) / "runs"
            base.mkdir()
            self.assertIsNone(ws.safe_subpath(base, "..", "etc", "passwd"))
            self.assertIsNone(ws.safe_subpath(base, "/etc/passwd"))
            self.assertIsNone(ws.safe_subpath(base, "x", "..", "..", "y"))


class TestHeaderKeys(unittest.TestCase):
    def test_maps_only_present_headers(self):
        class H:  # minimal mapping-like
            def __init__(self, d): self._d = d
            def get(self, k, default=None): return self._d.get(k, default)
        keys = ws.api_keys_from_headers(H({"X-Agnes-Key": "k", "X-Ark-Key": ""}))
        self.assertEqual(keys, {"AGNES_API_KEY": "k"})


if __name__ == "__main__":
    unittest.main()
