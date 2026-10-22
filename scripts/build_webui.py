#!/usr/bin/env python3
"""Build the web UI and embed it into the display firmware (GM-106).

    npm ci (optional) -> npm run build -> gzip assets in place -> embed_webui.py

scripts/build_webui.sh runs this with --install (CI and fresh checkouts). The
PlatformIO pre-build hooks (embed_webui_pre.py, sim_webui_dep.py) call
ensure_fresh() so a firmware build never ships a web UI older than web/.

Usage:
    build_webui.py [--install]      # always rebuild
    build_webui.py --if-stale       # rebuild only when web/ changed since the last bundle
"""

import argparse
import gzip
import hashlib
import os
import shutil
import subprocess
import sys

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)

sys.path.insert(0, SCRIPTS_DIR)
import embed_webui  # noqa: E402

# Everything under web/ that ends up in the firmware bundle (a production-mode Vite build); adding, editing or
# deleting any of these makes it stale.
WEB_INPUTS = [
    "src",
    "public",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "lingui.config.js",
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
]

SKIP_ENV = "GAGGIMATE_SKIP_WEBUI_BUILD"


def _paths(project_dir):
    web = os.path.join(project_dir, "web")
    out = os.path.join(project_dir, "src", "display", "webassets")
    return web, out, os.path.join(out, "web_ui.bin"), os.path.join(out, "web_ui_manifest.h")


def _stamp_path(project_dir):
    return os.path.join(_paths(project_dir)[1], "web_ui.inputs")


def input_fingerprint(web_dir):
    """Hash of the names and contents of every input file. Content, not mtimes: a deleted file or one
    copied in with an old timestamp changes it, a mere touch or checkout doesn't."""
    files = []
    for name in WEB_INPUTS:
        path = os.path.join(web_dir, name)
        if os.path.isfile(path):
            files.append(path)
        for root, _, names in os.walk(path):
            files.extend(os.path.join(root, f) for f in names)
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(os.path.relpath(path, web_dir).replace(os.sep, "/").encode("utf-8") + b"\0")
        with open(path, "rb") as f:
            digest.update(hashlib.sha256(f.read()).digest())
    return digest.hexdigest()


def bundle_state(project_dir=PROJECT_DIR):
    """'missing', 'stub' (empty placeholder), 'stale' (web/ changed since) or 'fresh'."""
    web, _, blob, manifest = _paths(project_dir)
    if not (os.path.isfile(blob) and os.path.isfile(manifest)):
        return "missing"
    with open(manifest, encoding="utf-8") as f:
        if "WEB_ASSETS_COUNT = 0u" in f.read():
            return "stub"
    try:
        with open(_stamp_path(project_dir), encoding="utf-8") as f:
            built_from = f.read().strip()
    except OSError:
        return "stale"  # built before the stamp existed, or by hand
    return "fresh" if built_from == input_fingerprint(web) else "stale"


def _gzip_in_place(path):
    # Fixed mtime and no file name in the header, so identical input gives an identical bundle.
    with open(path, "rb") as src, open(path + ".gz", "wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", compresslevel=9, fileobj=raw, mtime=0) as dst:
            shutil.copyfileobj(src, dst)
    os.remove(path)


def _output_encoding():
    """The encoding our output must survive. Under PlatformIO, a reader thread re-prints the
    build's output in the Windows ANSI code page (e.g. GBK on a Chinese Windows), whatever
    encoding our own stdout claims."""
    if os.name == "nt":
        try:
            import ctypes

            return "cp%d" % ctypes.windll.kernel32.GetACP()
        except (AttributeError, OSError):
            pass
    return getattr(sys.stdout, "encoding", None) or "utf-8"


def _run(cmd, cwd):
    """Runs cmd and relays its output line by line, with characters the console can't show
    replaced. PlatformIO's output relay dies on such a character (daisyUI prints an emoji),
    after which nobody drains the pipe and npm blocks forever. stdin is closed so nothing
    can wait for input."""
    encoding = _output_encoding()
    proc = subprocess.Popen(
        cmd, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
    )
    with proc.stdout:
        for raw in proc.stdout:
            line = raw.decode("utf-8", "replace")
            line = line.encode(encoding, "replace").decode(encoding)
            out = getattr(sys.stdout, "encoding", None) or "utf-8"
            sys.stdout.write(line.encode(out, "replace").decode(out))
            sys.stdout.flush()
    if proc.wait() != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd)


def build(project_dir=PROJECT_DIR, install=False):
    web, out, _, _ = _paths(project_dir)
    fingerprint = input_fingerprint(web)  # of what this build starts from, not of edits made while it runs
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm not found; install Node.js to build the web UI")

    if install or not os.path.isdir(os.path.join(web, "node_modules")):
        _run([npm, "ci"], web)
    _run([npm, "run", "build"], web)

    # The compressible assets are served with Content-Encoding: gzip.
    dist = os.path.join(web, "dist")
    assets = os.path.join(dist, "assets")
    for f in os.listdir(assets):
        if f.endswith((".js", ".css")):
            _gzip_in_place(os.path.join(assets, f))
    for f in os.listdir(dist):
        if f.endswith(".html"):
            _gzip_in_place(os.path.join(dist, f))

    if embed_webui.main(["--src", dist, "--out", out]) != 0:
        raise RuntimeError("embed_webui failed")
    with open(_stamp_path(project_dir), "w", encoding="utf-8") as f:
        f.write(fingerprint + "\n")


def ensure_fresh(project_dir=PROJECT_DIR, tag="build_webui"):
    """Rebuild the bundle when web/ changed since it was made. Never fails the firmware build:
    if the web build can't run, it keeps the existing bundle (or writes a stub) and says so."""
    state = bundle_state(project_dir)
    if state == "fresh":
        return
    if os.environ.get(SKIP_ENV):
        print("%s: web UI bundle is %s, not rebuilding (%s is set)" % (tag, state, SKIP_ENV))
    else:
        print("%s: web UI bundle is %s, rebuilding web/ (set %s=1 to skip)" % (tag, state, SKIP_ENV))
        try:
            build(project_dir)
            return
        except Exception as e:  # noqa: BLE001 -- a web build problem must not break the firmware build
            print("%s: WARNING: web UI build failed (%s); the firmware gets the %s bundle"
                  % (tag, e, "old" if state == "stale" else "empty"))
    if state == "missing":
        embed_webui.main(["--out", _paths(project_dir)[1], "--stub"])


def main(argv):
    parser = argparse.ArgumentParser(description="Build the web UI and embed it into the firmware.")
    parser.add_argument("--install", action="store_true", help="Run npm ci before building")
    parser.add_argument("--if-stale", action="store_true",
                        help="Only rebuild when web/ changed since the last bundle")
    args = parser.parse_args(argv)
    if args.if_stale and bundle_state() == "fresh":
        print("build_webui: web UI bundle is up to date")
        return 0
    build(install=args.install)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
