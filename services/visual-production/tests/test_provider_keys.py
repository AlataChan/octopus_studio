import os
import unittest

from octopus_visual_production import providers


CFG = {"env_key": "ARK_API_KEY", "submit_url": "x", "poll_url": "y"}


class TestProviderKeys(unittest.TestCase):
    def test_override_takes_priority_over_env(self):
        os.environ["ARK_API_KEY"] = "env-key"
        try:
            p = providers.provider_for("volcengine_ark", CFG, api_keys={"ARK_API_KEY": "hdr-key"})
            self.assertEqual(p.api_key(), "hdr-key")
        finally:
            del os.environ["ARK_API_KEY"]

    def test_falls_back_to_env_when_no_override(self):
        os.environ["ARK_API_KEY"] = "env-key"
        try:
            p = providers.provider_for("volcengine_ark", CFG, api_keys={})
            self.assertEqual(p.api_key(), "env-key")
        finally:
            del os.environ["ARK_API_KEY"]

    def test_raises_when_no_key_anywhere(self):
        os.environ.pop("ARK_API_KEY", None)
        p = providers.provider_for("volcengine_ark", CFG, api_keys={})
        with self.assertRaises(RuntimeError):
            p.api_key()


if __name__ == "__main__":
    unittest.main()
