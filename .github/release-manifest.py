"""Assemble a single updater manifest after all native runners upload their signed assets."""
import base64
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote

def build(release, signatures):
    tag = release["tagName"]
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag) or not release["isDraft"]:
        raise ValueError("Expected a stable-version draft")
    # GitHub gives draft downloads temporary URLs. Installed apps need the permanent tag URL.
    base_url = f"https://github.com/{release['repository']}/releases/download/{tag}/"
    assets = {item["name"] for item in release["assets"]}
    platforms = {}
    def only(pattern):
        matches = [name for name in assets if re.fullmatch(pattern, name, re.I)]
        if len(matches) != 1:
            raise ValueError(f"Expected one asset for {pattern}, found {matches}")
        return matches[0]
    def register(name, keys):
        sig = signatures[name + ".sig"].strip()
        raw = base64.b64decode(sig, validate=True)
        if not raw.startswith(b"untrusted comment:"):
            raise ValueError(f"Invalid updater signature for {name}")
        for key in keys:
            platforms[key] = {"signature": sig, "url": base_url + quote(name, safe="")}
    register(only(r".*_x64-setup\.exe"), ["windows-x86_64","windows-x86_64-nsis"])
    register(only(r".*_universal\.app\.tar\.gz"), ["darwin-x86_64","darwin-aarch64","darwin-x86_64-app","darwin-aarch64-app"])
    for key, pattern in [("x86_64",r"(?:amd64|x86_64|x64)"),("aarch64",r"(?:arm64|aarch64)")]:
        register(only(r".*_"+pattern+r"\.AppImage"),["linux-"+key,"linux-"+key+"-appimage"])
        register(only(r".*[_-]"+pattern+r"\.deb"), ["linux-"+key+"-deb"])
        register(only(r".*\."+pattern+r"\.rpm"), ["linux-"+key+"-rpm"])
        only(r".*_"+pattern+r"\.dmg")
    only(r".*_universal\.dmg")
    return {"version":tag[1:],"notes":release["body"],"pub_date":release["createdAt"],"platforms":platforms}

if __name__=="__main__":
    tag,repository=sys.argv[1:]
    info=json.loads(subprocess.check_output(["gh","release","view",tag,"--repo",repository,"--json","assets,tagName,isDraft,body,createdAt"]))
    info["repository"]=repository
    subprocess.run(["gh","release","download",tag,"--repo",repository,"--pattern","*.sig","--dir","signatures","--clobber"],check=True)
    signatures={p.name:p.read_text(encoding="utf8") for p in Path("signatures").glob("*.sig")}
    Path("latest.json").write_text(json.dumps(build(info,signatures),indent=2)+"\n",encoding="utf8")
