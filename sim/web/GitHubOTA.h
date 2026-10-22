// Host shim for GitHubOTA: firmware OTA is unavailable in the simulator. flashControllerFile() pretends to
// send an uploaded controller image, reporting the same phases and progress as the device.
#pragma once

#include "WString.h"
#include <cstdint>
#include <functional>

class NimBLEClient;

constexpr uint8_t PHASE_IDLE = 0;
constexpr uint8_t PHASE_DISPLAY_FW = 1;
constexpr uint8_t PHASE_DISPLAY_FS = 2;
constexpr uint8_t PHASE_CONTROLLER_FW = 3;
constexpr uint8_t PHASE_FINISHED = 4;
constexpr uint8_t PHASE_FAILED = 5;

constexpr char CONTROLLER_FIRMWARE_PATH[] = "/board-firmware.bin";

using phase_callback_t = std::function<void(uint8_t phase)>;
using progress_callback_t = std::function<void(uint8_t phase, int progress)>;

struct OtaWatchdogRelax {};

class GitHubOTA {
  public:
    GitHubOTA(const String &display_version, const String &controller_version, const String &release_url,
              phase_callback_t phase = nullptr, progress_callback_t progress = nullptr, const String & = "firmware.bin",
              const String & = "filesystem.bin", const String & = "controller.bin")
        : _version(display_version), _phase(std::move(phase)), _progress(std::move(progress)) {}

    void init() {}
    void checkForUpdates() {}
    bool isUpdateAvailable(bool = false) const { return false; }
    String getCurrentVersion() const { return _version; }
    void update(bool = true, bool = true, NimBLEClient * = nullptr) {}
    void setReleaseUrl(const String &) {}
    void setControllerVersion(const String &) {}
    bool flashControllerFile(NimBLEClient *) {
        if (_phase)
            _phase(PHASE_CONTROLLER_FW);
        for (int p = 50; p <= 100 && _progress; p += 10)
            _progress(PHASE_CONTROLLER_FW, p);
        if (_phase)
            _phase(PHASE_FINISHED);
        return true;
    }

  private:
    String _version;
    phase_callback_t _phase;
    progress_callback_t _progress;
};
