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
                   "body":"Added music providers","assets":[{"name":n,"url":base.replace("v0.8.0", "untagged-ac2821")+n} for n in names]}
        signatures = {n+".sig":base64.b64encode(b"untrusted comment: fixture").decode() for n in names}
        platforms = build(release, signatures)["platforms"]
        self.assertEqual(len(platforms),14)
        for arch, deb, rpm in [("x86_64","amd64","x86_64"),("aarch64","arm64","aarch64")]:
            self.assertEqual(platforms["linux-"+arch+"-deb"]["url"],base+"Carbon_0.8.0_"+deb+".deb")
            self.assertEqual(platforms["linux-"+arch+"-rpm"]["url"],base+"Carbon-0.8.0-1."+rpm+".rpm")
        self.assertTrue(all(row["url"].startswith(base) for row in platforms.values()))
        without_rpm = dict(signatures)
        del without_rpm["Carbon-0.8.0-1.aarch64.rpm.sig"]
        with self.assertRaises(KeyError):
            build(release, without_rpm)
        self.assertEqual(platforms["darwin-aarch64"],platforms["darwin-x86_64"])
        self.assertNotEqual(platforms["linux-x86_64"]["url"],platforms["linux-aarch64"]["url"])
        with self.assertRaises(KeyError):
            build(release, {})
        release["assets"].pop()
        with self.assertRaises(ValueError):
            build(release,signatures)

if __name__=="__main__":
    unittest.main()
