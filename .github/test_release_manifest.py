import base64
from pathlib import Path
import runpy
import unittest

build = runpy.run_path(str(Path(__file__).with_name("release-manifest.py")))["build"]

class ManifestTest(unittest.TestCase):
    def test_every_native_installer_and_signature_is_required(self):
        names = ["Carbon_0.8.0_x64-setup.exe", "Carbon_universal.app.tar.gz", "Carbon_0.8.0_universal.dmg",
                 "Carbon_0.8.0_aarch64.dmg", "Carbon_0.8.0_x64.dmg", "Carbon_0.8.0_amd64.AppImage",
                 "Carbon_0.8.0_aarch64.AppImage", "Carbon_0.8.0_amd64.deb", "Carbon_0.8.0_arm64.deb",
                 "Carbon-0.8.0-1.x86_64.rpm", "Carbon-0.8.0-1.aarch64.rpm"]
        base = "https://github.com/pealz1/carbon/releases/download/v0.8.0/"
        release = {"tagName":"v0.8.0","repository":"pealz1/carbon","isDraft":True,"createdAt":"2026-11-19T00:00:00Z",
                   "body":"Added music providers","assets":[{"name":n,"url":base+n} for n in names]}
        signatures = {n+".sig":base64.b64encode(b"untrusted comment: fixture").decode() for n in names}
        platforms = build(release, signatures)["platforms"]
        self.assertEqual(len(platforms),10)
        self.assertEqual(platforms["darwin-aarch64"],platforms["darwin-x86_64"])
        self.assertNotEqual(platforms["linux-x86_64"]["url"],platforms["linux-aarch64"]["url"])
        with self.assertRaises(KeyError):
            build(release, {})
        release["assets"].pop()
        with self.assertRaises(ValueError):
            build(release,signatures)

if __name__=="__main__":
    unittest.main()
