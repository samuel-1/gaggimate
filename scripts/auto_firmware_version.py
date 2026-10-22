import subprocess
import datetime

Import("env")

def get_firmware_specifier_build_flag():
    # Only v* release tags count; nightly, db and one-off release tags (scripts/release.sh) must not leak into the version.
    ret = subprocess.run(["git", "describe", "--tags", "--dirty", "--match", "v*"], stdout=subprocess.PIPE, text=True)
    build_version = ret.stdout.strip()
    build_flag = "#define BUILD_GIT_VERSION \"" + build_version + "\""
    print ("Build version: " + build_version)
    return build_flag

def get_time_specifier_build_flag():
    build_timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    build_flag = "#define BUILD_TIMESTAMP \"" + build_timestamp + "\""
    print ("Build date: " + build_timestamp)
    return build_flag

def get_env_specifier_build_flag():
    # The PlatformIO env this image is built for; the web UI firmware upload checks it (src/firmware_id.h).
    build_env = env["PIOENV"]
    build_flag = "#define BUILD_ENV \"" + build_env + "\""
    print ("Build env: " + build_env)
    return build_flag

with open('src/version.h', 'w') as f:
    f.write(
        '#pragma once\n' +
        '#ifndef GIT_VERSION_H\n' +
        '#define GIT_VERSION_H\n' +
        get_firmware_specifier_build_flag() + '\n' +
        get_time_specifier_build_flag() + '\n' +
        get_env_specifier_build_flag() + '\n'
        '#endif\n'
    )
