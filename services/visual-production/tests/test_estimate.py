import unittest
from octopus_visual_production import service

BUDGET = {"usd_cny_rate": 7.2}


def model(price, unit, currency="CNY"):
    return {"pricing": {"price": price, "unit": unit, "currency": currency}}


class TestEstimateCost(unittest.TestCase):
    def test_per_second_uses_duration(self):
        self.assertAlmostEqual(service.estimate_cost(model(0.30, "second"), {"duration": 5}, BUDGET)["cny"], 1.5)

    def test_per_second_default_duration_5(self):
        self.assertAlmostEqual(service.estimate_cost(model(0.30, "second"), {}, BUDGET)["cny"], 1.5)

    def test_per_image_uses_n(self):
        self.assertAlmostEqual(service.estimate_cost(model(0.20, "image"), {"n": 3}, BUDGET)["cny"], 0.6)

    def test_per_generation_flat(self):
        self.assertAlmostEqual(service.estimate_cost(model(0.50, "generation"), {}, BUDGET)["cny"], 0.5)

    def test_usd_converts_to_cny(self):
        out = service.estimate_cost(model(0.005, "second", "USD"), {"duration": 10}, BUDGET)
        self.assertAlmostEqual(out["cny"], 0.005 * 10 * 7.2)
        self.assertEqual(out["currency"], "USD")

    def test_agnes_zero_is_zero_not_none(self):
        self.assertEqual(service.estimate_cost(model(0, "second"), {"duration": 5}, BUDGET)["cny"], 0)

    def test_missing_pricing_is_none(self):
        self.assertIsNone(service.estimate_cost({}, {"duration": 5}, BUDGET)["cny"])


if __name__ == "__main__":
    unittest.main()
