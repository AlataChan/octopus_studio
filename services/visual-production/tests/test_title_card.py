import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from octopus_visual_production import service


class TestFontResolver(unittest.TestCase):
    def setUp(self):
        os.environ.pop("FONT_PATH", None)

    def test_font_path_arg_wins_when_it_exists(self):
        with mock.patch("os.path.exists", lambda p: p == "/my/font.otf"):
            self.assertEqual(service.resolve_cjk_font("/my/font.otf"), "/my/font.otf")

    def test_env_override(self):
        with mock.patch.dict(os.environ, {"FONT_PATH": "/env/font.ttf"}), \
             mock.patch("os.path.exists", lambda p: p == "/env/font.ttf"):
            self.assertEqual(service.resolve_cjk_font(), "/env/font.ttf")

    def test_falls_through_to_candidate(self):
        cand = service.CJK_FONT_CANDIDATES[0]
        with mock.patch("os.path.exists", lambda p: p == cand):
            self.assertEqual(service.resolve_cjk_font(), cand)

    def test_none_when_nothing_exists(self):
        with mock.patch("os.path.exists", lambda p: False):
            self.assertIsNone(service.resolve_cjk_font())

    def test_has_cjk_font(self):
        with mock.patch.object(service, "resolve_cjk_font", return_value="/f"):
            self.assertTrue(service.has_cjk_font())
        with mock.patch.object(service, "resolve_cjk_font", return_value=None):
            self.assertFalse(service.has_cjk_font())


class TestProbe(unittest.TestCase):
    def _run(self, payload):
        return mock.Mock(stdout=json.dumps(payload), returncode=0)

    def test_parses_dims_fps_audio(self):
        payload = {"streams": [
            {"codec_type": "video", "width": 1280, "height": 720, "r_frame_rate": "24/1"},
            {"codec_type": "audio"},
        ], "format": {"duration": "5.0"}}
        with mock.patch("subprocess.run", return_value=self._run(payload)):
            info = service.probe_video(Path("x.mp4"))
        self.assertEqual((info["width"], info["height"]), (1280, 720))
        self.assertAlmostEqual(info["fps"], 24.0)
        self.assertEqual(info["fps_str"], "24/1")
        self.assertTrue(info["has_audio"])

    def test_no_audio_and_fractional_fps(self):
        payload = {"streams": [
            {"codec_type": "video", "width": 1080, "height": 1920, "r_frame_rate": "30000/1001"},
        ]}
        with mock.patch("subprocess.run", return_value=self._run(payload)):
            info = service.probe_video(Path("x.mp4"))
        self.assertFalse(info["has_audio"])
        self.assertAlmostEqual(info["fps"], 29.97, places=2)
        self.assertEqual(info["fps_str"], "30000/1001")  # raw fraction preserved for -r


def _join(cmds):
    return "\n".join(" ".join(str(x) for x in c) for c in cmds)


def _has_dims(text, w, h):
    return (f"{w}x{h}" in text) or (f"{w}:{h}" in text)


class TestHasPillow(unittest.TestCase):
    def test_true_when_importable(self):
        self.assertTrue(service.has_pillow())  # Pillow is a declared dependency


class TestRenderTitlePng(unittest.TestCase):
    @unittest.skipIf(service.resolve_cjk_font() is None, "no CJK font available")
    def test_real_render(self):
        font = service.resolve_cjk_font()
        with TemporaryDirectory() as d:
            p = Path(d) / "t.png"
            service.render_title_png("环境公益 AI 赋能实战营", "30秒宣传片", 1280, 720, font, p)
            from PIL import Image
            im = Image.open(p)
            self.assertEqual(im.size, (1280, 720))
            self.assertEqual(im.mode, "RGBA")
            self.assertGreater(im.getextrema()[3][1], 0)  # some non-transparent (text) pixels


class TestBuildTitleCardCommands(unittest.TestCase):
    AUDIO = {"width": 1280, "height": 720, "fps": 24.0, "fps_str": "24/1", "has_audio": True}
    NOAUDIO = {"width": 1080, "height": 1920, "fps": 30.0, "fps_str": "30/1", "has_audio": False}

    def _no_0v_reuse(self, cmds):
        for c in cmds:
            cs = [str(x) for x in c]
            if "-filter_complex" in cs:
                fc = cs[cs.index("-filter_complex") + 1]
                self.assertLessEqual(fc.count("[0:v]"), 1)

    def test_blur_audio(self):
        cmds = service.build_title_card_commands(
            Path("in.mp4"), Path("out.mp4"), Path("/wd/title.png"), Path("/wd/frame.png"),
            2.5, "blur", self.AUDIO, Path("/wd"))
        j = _join(cmds)
        self.assertIn("overlay", j)
        self.assertIn("concat", j)
        self.assertIn("gblur", j)
        self.assertIn("-loop", j)               # looped image input(s)
        self.assertIn("title.png", j)
        self.assertIn("frame.png", j)
        self.assertTrue(any("-frames:v" in " ".join(str(x) for x in c)
                            and "frame.png" in " ".join(str(x) for x in c) for c in cmds))
        self.assertTrue(_has_dims(j, 1280, 720))
        self.assertIn("2.5", j)
        self.assertIn("24/1", j)
        self.assertIn("anullsrc", j)
        self.assertIn("aac", j)
        self.assertEqual(str(cmds[-1][-1]), "out.mp4")
        self._no_0v_reuse(cmds)

    def test_solid_noaudio(self):
        cmds = service.build_title_card_commands(
            Path("in.mp4"), Path("out.mp4"), Path("/wd/title.png"), Path("/wd/frame.png"),
            2.0, "solid", self.NOAUDIO, Path("/wd"))
        j = _join(cmds)
        self.assertIn("overlay", j)
        self.assertIn("concat", j)
        self.assertTrue(("color=" in j) or ("color:" in j))
        self.assertIn("EA580C", j.upper())
        self.assertTrue(_has_dims(j, 1080, 1920))
        self.assertNotIn("anullsrc", j)
        self.assertNotIn("aac", j)
        self.assertNotIn("gblur", j)
        self.assertFalse(any("-frames:v" in " ".join(str(x) for x in c) for c in cmds))
        self._no_0v_reuse(cmds)


class TestAddTitleCard(unittest.TestCase):
    def setUp(self):
        os.environ.pop("FONT_PATH", None)

    def test_orchestrates_runs_postprobe_cleanup(self):
        probe = {"streams": [
            {"codec_type": "video", "width": 1280, "height": 720, "r_frame_rate": "24/1"},
            {"codec_type": "audio"},
        ], "format": {"duration": "5.0"}}
        runs, rendered, rendered_paths = [], [], []

        def fake_run(cmd, *a, **k):
            runs.append([str(x) for x in cmd])
            if str(cmd[0]) == "ffprobe":
                return mock.Mock(stdout=json.dumps(probe), returncode=0)
            Path(cmd[-1]).write_bytes(b"x")
            return mock.Mock(stdout="", stderr="", returncode=0)

        def fake_render(title, subtitle, w, h, font, out_png):
            rendered.append((title, subtitle, w, h))
            rendered_paths.append(Path(out_png))
            Path(out_png).parent.mkdir(parents=True, exist_ok=True)
            Path(out_png).write_bytes(b"png")
            return Path(out_png)

        with TemporaryDirectory() as d, \
             mock.patch.object(service, "has_pillow", return_value=True), \
             mock.patch.object(service, "resolve_cjk_font", return_value="/font/PingFang.ttc"), \
             mock.patch.object(service, "render_title_png", side_effect=fake_render), \
             mock.patch("shutil.which", return_value="/usr/bin/x"), \
             mock.patch("subprocess.run", side_effect=fake_run):
            inp = Path(d) / "in.mp4"; inp.write_bytes(b"v")
            out = Path(d) / "out.mp4"
            res = service.add_title_card(inp, out, "环境公益", subtitle="30秒", duration=2.5, bg="blur")
            self.assertEqual(res, out)
            self.assertTrue(out.exists())
        self.assertTrue(any(r[0] == "环境公益" and r[2:] == (1280, 720) for r in rendered))
        self.assertGreaterEqual(sum(1 for c in runs if c[0] == "ffprobe"), 2)
        # temp workdir (the rendered PNG) was cleaned up
        self.assertTrue(rendered_paths and all(not p.exists() for p in rendered_paths))

    def test_raises_without_pillow(self):
        with mock.patch.object(service, "has_pillow", return_value=False), \
             mock.patch("shutil.which", return_value="/usr/bin/x"), \
             mock.patch.object(service, "resolve_cjk_font", return_value="/f"):
            with self.assertRaises(RuntimeError) as ctx:
                service.add_title_card(Path("in.mp4"), Path("out.mp4"), "标题")
            self.assertIn("Pillow", str(ctx.exception))

    def test_raises_without_font(self):
        with mock.patch.object(service, "has_pillow", return_value=True), \
             mock.patch.object(service, "resolve_cjk_font", return_value=None), \
             mock.patch("shutil.which", return_value="/usr/bin/x"):
            with self.assertRaises(RuntimeError) as ctx:
                service.add_title_card(Path("in.mp4"), Path("out.mp4"), "标题")
            self.assertIn("字体", str(ctx.exception))

    def test_raises_when_ffmpeg_missing(self):
        with mock.patch("shutil.which", return_value=None):
            with self.assertRaises(RuntimeError):
                service.add_title_card(Path("in.mp4"), Path("out.mp4"), "标题")

    def test_raises_on_empty_title(self):
        with mock.patch.object(service, "has_pillow", return_value=True), \
             mock.patch.object(service, "resolve_cjk_font", return_value="/f"), \
             mock.patch("shutil.which", return_value="/usr/bin/x"):
            with self.assertRaises(ValueError):
                service.add_title_card(Path("in.mp4"), Path("out.mp4"), "   ")


@unittest.skipIf(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe")
    or service.resolve_cjk_font() is None or not service.has_pillow(),
    "ffmpeg / ffprobe / CJK font / Pillow not all available",
)
class TestRealEndToEnd(unittest.TestCase):
    """Runs REAL ffmpeg — this is the safeguard that catches filtergraph failures
    (mocked tests cannot). Skipped automatically if the toolchain isn't present."""

    def _clip(self, d, audio):
        inp = Path(d) / ("a.mp4" if audio else "na.mp4")
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=24"]
        if audio:
            cmd += ["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest"]
        cmd += ["-c:v", "libx264"] + (["-c:a", "aac"] if audio else []) + [str(inp)]
        subprocess.run(cmd, check=True, capture_output=True)
        return inp

    def test_blur_audio(self):
        with TemporaryDirectory() as d:
            out = Path(d) / "o.mp4"
            service.add_title_card(self._clip(d, True), out, "环境公益 AI", subtitle="测试", duration=1.0, bg="blur")
            self.assertTrue(out.exists() and out.stat().st_size > 0)
            self.assertGreater(service.probe_video(out)["width"], 0)

    def test_solid_audio(self):
        with TemporaryDirectory() as d:
            out = Path(d) / "o.mp4"
            service.add_title_card(self._clip(d, True), out, "纯色测试", duration=1.0, bg="solid")
            self.assertTrue(out.exists() and out.stat().st_size > 0)

    def test_blur_no_audio(self):
        with TemporaryDirectory() as d:
            out = Path(d) / "o.mp4"
            service.add_title_card(self._clip(d, False), out, "无音轨", duration=1.0, bg="blur")
            self.assertTrue(out.exists() and out.stat().st_size > 0)


class TestCliTitle(unittest.TestCase):
    def test_title_subcommand_calls_service(self):
        from octopus_visual_production import cli
        with mock.patch("octopus_visual_production.service.add_title_card",
                        return_value=Path("b.mp4")) as ac:
            rc = cli.main(["title", "--in", "a.mp4", "--out", "b.mp4",
                           "--title", "标题", "--subtitle", "副标题",
                           "--duration", "3", "--bg", "solid"])
        self.assertEqual(rc, 0)
        args, kwargs = ac.call_args
        self.assertEqual(str(args[0]), "a.mp4")   # input path
        self.assertEqual(str(args[1]), "b.mp4")   # output path
        self.assertEqual(args[2], "标题")          # title
        self.assertEqual(kwargs.get("subtitle"), "副标题")
        self.assertEqual(kwargs.get("duration"), 3.0)
        self.assertEqual(kwargs.get("bg"), "solid")
        self.assertIsNone(kwargs.get("font_path"))  # --font-path not given


if __name__ == "__main__":
    unittest.main()
