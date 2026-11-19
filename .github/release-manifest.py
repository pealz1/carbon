"""Assemble a single updater manifest after all native runners upload their signed assets."""
import base64
import json
from pathlib import Path
import re
import subprocess
import sys

def build(release, signatures):
    tag = release["tagName"]
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag) or not release["isDraft"]:
        raise ValueError("Expected a stable-version draft")
    assets = {item["name"]: item["url"] for item in release["assets"]}
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
            platforms[key] = {"signature": sig, "url": assets[name]}
    register(only(r".*_x64-setup\.exe"), ["windows-x86_64","windows-x86_64-nsis"])
    register(only(r".*_universal\.app\.tar\.gz"), ["darwin-x86_64","darwin-aarch64","darwin-x86_64-app","darwin-aarch64-app"])
    for key, pattern in [("x86_64",r"(?:amd64|x86_64|x64)"),("aarch64",r"(?:arm64|aarch64)")]:
        register(only(r".*_"+pattern+r"\.AppImage"),["linux-"+key,"linux-"+key+"-appimage"])
        only(r".*[_-]"+pattern+r"\.deb")
        only(r".*\."+pattern+r"\.rpm")
        only(r".*_"+pattern+r"\.dmg")
    only(r".*_universal\.dmg")
    if any(not entry["url"].startswith("https://github.com/"+release["repository"]+"/releases/download/"+tag+"/") for entry in platforms.values()):
        raise ValueError("Unexpected update location")
    return {"version":tag[1:],"notes":release["body"],"pub_date":release["createdAt"],"platforms":platforms}

if __name__=="__main__":
    tag,repository=sys.argv[1:]
    info=json.loads(subprocess.check_output(["gh","release","view",tag,"--repo",repository,"--json","assets,tagName,isDraft,body,createdAt"]))
    info["repository"]=repository
    subprocess.run(["gh","release","download",tag,"--repo",repository,"--pattern","*.sig","--dir","signatures","--clobber"],check=True)
    signatures={p.name:p.read_text(encoding="utf8") for p in Path("signatures").glob("*.sig")}
    Path("latest.json").write_text(json.dumps(build(info,signatures),indent=2)+"\n",encoding="utf8")
