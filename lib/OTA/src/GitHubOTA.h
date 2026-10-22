#ifndef ESP_GITHUB_OTA_H
#define ESP_GITHUB_OTA_H

#include "ControllerOTA.h"
#include <WiFiClientSecure.h>
#include <atomic>
#include <esp_task_wdt.h>
#include <sdkconfig.h>

#include "semver.h"

constexpr uint8_t PHASE_IDLE = 0;
constexpr uint8_t PHASE_DISPLAY_FW = 1;
constexpr uint8_t PHASE_DISPLAY_FS = 2;
constexpr uint8_t PHASE_CONTROLLER_FW = 3;
constexpr uint8_t PHASE_FINISHED = 4;
constexpr uint8_t PHASE_FAILED = 5;

using phase_callback_t = std::function<void(uint8_t phase)>;
using progress_callback_t = std::function<void(uint8_t phase, int progress)>;

extern const uint8_t x509_crt_imported_bundle_bin_start[] asm("_binary_x509_crt_bundle_start");

// Flash erases park core 0 and slow every other task, so IDLE0 and the AsyncTCP service task (both watched by
// the 5 s task watchdog) can miss their deadline mid-update (seen twice in field coredumps). Widen the timeout for
// the update instead of unsubscribing anyone: a real hang still reboots, just later. Counted, so overlapping
// holders (e.g. a web upload's file write and the flash that follows) restore the timeout only when the last ends.
struct OtaWatchdogRelax {
    static constexpr uint32_t UPDATE_TIMEOUT_S = 60;
    OtaWatchdogRelax() {
        if (holders().fetch_add(1) == 0)
            esp_task_wdt_init(UPDATE_TIMEOUT_S, true);
    }
    ~OtaWatchdogRelax() {
        if (holders().fetch_sub(1) == 1)
            esp_task_wdt_init(CONFIG_ESP_TASK_WDT_TIMEOUT_S, true);
    }
    OtaWatchdogRelax(const OtaWatchdogRelax &) = delete;
    OtaWatchdogRelax &operator=(const OtaWatchdogRelax &) = delete;

  private:
    static std::atomic<int> &holders() {
        static std::atomic<int> count{0};
        return count;
    }
};

class GitHubOTA {
  public:
    GitHubOTA(const String &display_version, const String &controller_version, const String &release_url,
              const phase_callback_t &phase_callback, const progress_callback_t &progress_callback,
              const String &firmware_name = "firmware.bin", const String &filesystem_name = "filesystem.bin",
              const String &controller_firmware_name = "controller.bin");

    void init();
    void checkForUpdates();
    bool isUpdateAvailable(bool controller = false) const;
    String getCurrentVersion() const;
    void update(bool controller = true, bool display = true, NimBLEClient *client = nullptr);
    // Flashes the controller from the image at CONTROLLER_FIRMWARE_PATH (web UI upload): no download and no
    // display restart; reports through the same phase/progress callbacks.
    bool flashControllerFile(NimBLEClient *client);
    void setReleaseUrl(const String &release_url);
    void setControllerVersion(const String &controller_version);

  private:
    bool flashDisplayFirmware(const String &url);
    void setPhase(uint8_t newPhase);

    uint8_t phase = PHASE_IDLE;
    semver_t _version;
    semver_t _controller_version;
    String _latest_version_string;
    semver_t _latest_version = {0, 0, 0, nullptr, nullptr};
    String _release_url;
    String _latest_url;
    String _firmware_name;
    String _filesystem_name;
    String _controller_firmware_name;
    WiFiClientSecure _wifi_client;
    ControllerOTA _controller_ota;
    phase_callback_t _phase_callback = nullptr;
    progress_callback_t _progress_callback = nullptr;
    bool _controller_update_required = false;
    bool _screen_update_required = false;
};

#endif
