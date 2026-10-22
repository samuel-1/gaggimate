# The simulator embeds src/display/webassets/web_ui.bin through a static .S with .incbin, a dependency
# SCons cannot see. Declare it explicitly, and drop a blob object that is older than the .bin as a safety net
# (SCons decides by content signature, so merely touching the .S does not rebuild it).
import os
import sys

Import("env")

PROJECT_DIR = env["PROJECT_DIR"]

# Rebuild the bundle first when web/ changed since it was made (see scripts/build_webui.py).
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts"))
import build_webui  # noqa: E402

build_webui.ensure_fresh(PROJECT_DIR, tag="sim_webui_dep")

WEB_UI_BIN = os.path.join(PROJECT_DIR, "src", "display", "webassets", "web_ui.bin")
BLOB_OBJ = os.path.join(env.subst("$BUILD_DIR"), "sim", "web", "web_ui_blob_sim.o")

env.Depends(BLOB_OBJ, WEB_UI_BIN)

if os.path.exists(BLOB_OBJ) and os.path.exists(WEB_UI_BIN) and os.path.getmtime(WEB_UI_BIN) > os.path.getmtime(BLOB_OBJ):
    os.remove(BLOB_OBJ)
    print("sim_webui_dep: web_ui.bin changed, re-embedding the WebUI blob")
