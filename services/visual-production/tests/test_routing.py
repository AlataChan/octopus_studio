import os
import unittest

from octopus_visual_production import config as cfg


def load():
    return cfg.load_config()


class TestRouting(unittest.TestCase):
    def setUp(self):
        for k in ("AGNES_API_KEY", "ARK_API_KEY", "DASHSCOPE_API_KEY"):
            os.environ.pop(k, None)

    def test_agnes_is_first_when_it_has_a_key(self):
        c = load()
        choice = cfg.select_model(c, "video.final", api_keys={"AGNES_API_KEY": "k"})
        self.assertEqual(choice.model_id, "agnes.video_v2")

    def test_skips_agnes_when_no_agnes_key_falls_back(self):
        c = load()
        choice = cfg.select_model(c, "video.final", api_keys={"ARK_API_KEY": "k"})
        self.assertEqual(choice.provider_id, "volcengine_ark")

    def test_raises_when_no_provider_has_key(self):
        c = load()
        with self.assertRaises(ValueError) as ctx:
            cfg.select_model(c, "video.final", api_keys={})
        self.assertIn("key", str(ctx.exception).lower())

    def test_request_aware_skips_agnes_for_video_refs(self):
        c = load()
        choice = cfg.select_model(
            c, "video.multimodal",
            api_keys={"AGNES_API_KEY": "k", "ARK_API_KEY": "k"},
            request={"video_urls": ["https://x/v.mp4"], "audio_urls": []},
        )
        self.assertNotEqual(choice.provider_id, "agnes")

    def test_explicit_model_id_bypasses_key_aware_skip(self):
        c = load()
        choice = cfg.select_model(c, "video.final", model_id="agnes.video_v2", api_keys={})
        self.assertEqual(choice.model_id, "agnes.video_v2")

    def test_models_json_is_valid(self):
        self.assertEqual(cfg.validate_config(load()), [])


class TestBudgetAndPricingConfig(unittest.TestCase):
    def test_get_budget_defaults_and_override(self):
        self.assertEqual(cfg.get_budget({})["usd_cny_rate"], 7.2)
        self.assertEqual(cfg.get_budget({"budget": {"usd_cny_rate": 7.0}})["usd_cny_rate"], 7.0)
        # untouched defaults remain
        self.assertEqual(cfg.get_budget({"budget": {"usd_cny_rate": 7.0}})["session_cap_cny"], 10.0)

    def test_models_json_pricing_is_valid(self):
        c = cfg.load_config()
        self.assertEqual(cfg.validate_config(c), [])
        # every model carries a pricing block
        for mid, m in c["models"].items():
            self.assertIn("pricing", m, mid)

    def test_validate_flags_bad_pricing(self):
        bad = {
            "providers": {"agnes": {"env_key": "AGNES_API_KEY", "base_url": "x"}},
            "models": {"m": {"provider": "agnes", "adapter": "agnes_image",
                              "pricing": {"price": "free", "unit": "second", "currency": "CNY"}}},
            "routes": {},
        }
        problems = cfg.validate_config(bad)
        self.assertTrue(any("price" in p for p in problems))

    def test_validate_flags_unknown_unit_and_currency(self):
        bad = {
            "providers": {"agnes": {"env_key": "AGNES_API_KEY", "base_url": "x"}},
            "models": {"m": {"provider": "agnes", "adapter": "agnes_image",
                              "pricing": {"price": 1, "unit": "minute", "currency": "EUR"}}},
            "routes": {},
        }
        problems = cfg.validate_config(bad)
        self.assertTrue(any("unit" in p for p in problems))
        self.assertTrue(any("currency" in p for p in problems))

    def test_validate_flags_bad_budget_fields(self):
        bad = {
            "providers": {}, "models": {}, "routes": {},
            "budget": {"usd_cny_rate": "seven", "confirm_threshold_cny": 1.0, "session_cap_cny": 10.0},
        }
        problems = cfg.validate_config(bad)
        self.assertTrue(any("usd_cny_rate" in p or "budget" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
