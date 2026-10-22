#
# PlatformIO pre-build hook (display envs).
#
# The web UI is embedded into the firmware app image (GM-106). The bundle is
# produced by scripts/build_webui.py (npm build -> gzip -> embed_webui.py) and
# lands, git-ignored, in src/display/webassets/. CI runs it explicitly through
# scripts/build_webui.sh.
#
# This hook rebuilds the bundle whenever web/ changed since it was made (or it is missing
# or an empty stub), so a firmware build never ships a stale UI. Without Node.js,
# or with GAGGIMATE_SKIP_WEBUI_BUILD=1, it keeps the existing bundle and, if there
# is none, drops in an empty stub so a bare `pio run -e display` still links.
#
import os
import sys

Import("env")  # noqa: F821 -- provided by PlatformIO/SCons

project_dir = env["PROJECT_DIR"]  # noqa: F821
out_dir = os.path.join(project_dir, "src", "display", "webassets")
blob_bin = os.path.join(out_dir, "web_ui.bin")

sys.path.insert(0, os.path.join(project_dir, "scripts"))
import build_webui  # noqa: E402

build_webui.ensure_fresh(project_dir, tag="embed_webui_pre")

# web_ui_blob.S only .incbin's web_ui.bin; without this, a rebuilt bundle updates
# the manifest (recompiled) but not the assembled blob (stale .S.o).
if os.path.isfile(blob_bin):
    blob_obj = os.path.join(env.subst("$BUILD_DIR"), "src", "display", "webassets", "web_ui_blob.S.o")
    env.Depends(blob_obj, blob_bin)  # noqa: F821
