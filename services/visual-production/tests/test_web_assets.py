import re
import unittest

from octopus_visual_production import webserver as ws


class TestWebAssets(unittest.TestCase):
    def test_assets_exist(self):
        for name in ("index.html", "app.js", "styles.css"):
            self.assertTrue((ws.WEB_DIR / name).is_file(), name)

    def test_app_js_avoids_unsafe_html_sinks(self):
        src = (ws.WEB_DIR / "app.js").read_text(encoding="utf-8")
        # Ban assignment to innerHTML/outerHTML and insertAdjacentHTML / document.write.
        self.assertIsNone(re.search(r"\b(inner|outer)HTML\s*=", src), "use textContent")
        self.assertNotIn("insertAdjacentHTML", src)
        self.assertNotIn("document.write", src)

    def test_html_i18n_keys_exist_in_both_language_tables(self):
        html = (ws.WEB_DIR / "index.html").read_text(encoding="utf-8")
        src = (ws.WEB_DIR / "app.js").read_text(encoding="utf-8")
        html_keys = set(re.findall(r'data-i18n(?:-placeholder)?="([^"]+)"', html))
        self.assertGreater(len(html_keys), 20)

        def language_keys(lang):
            match = re.search(rf"\b{lang}\s*:\s*\{{(?P<body>.*?)\n\s*\}}(?:,|\n)", src, re.S)
            self.assertIsNotNone(match, f"missing I18N.{lang}")
            return set(re.findall(r"\b([a-zA-Z][a-zA-Z0-9_]*)\s*:", match.group("body")))

        zh_keys = language_keys("zh")
        en_keys = language_keys("en")
        self.assertFalse(html_keys - zh_keys, f"missing zh keys: {sorted(html_keys - zh_keys)}")
        self.assertFalse(html_keys - en_keys, f"missing en keys: {sorted(html_keys - en_keys)}")


if __name__ == "__main__":
    unittest.main()
