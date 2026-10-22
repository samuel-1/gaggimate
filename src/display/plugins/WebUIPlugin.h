#ifndef WEBUIPLUGIN_H
#define WEBUIPLUGIN_H

#define ELEGANTOTA_USE_ASYNC_WEBSERVER 1

#include <DNSServer.h>

#include "GitHubOTA.h"
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include <atomic>
#include <display/core/FirmwareUpload.h>
#include <display/core/Plugin.h>
#include <display/plugins/WebSocketHandler.h>
#include <display/util/PsramAllocator.h>
#include <memory>
#include <mutex>

constexpr size_t UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;
constexpr size_t DNS_PERIOD = 50;

const String LOCAL_URL = "http://4.4.4.1/";
const String RELEASE_URL = "https://github.com/jniebuhr/gaggimate/releases/";
// Headless builds must pull their own release assets; the screen firmware would not boot on them.
#ifdef GAGGIMATE_HEADLESS
#define OTA_DISPLAY_FIRMWARE "display-headless-firmware.bin"
#define OTA_DISPLAY_FILESYSTEM "display-headless-filesystem.bin"
#else
#define OTA_DISPLAY_FIRMWARE "display-firmware.bin"
#define OTA_DISPLAY_FILESYSTEM "display-filesystem.bin"
#endif

class ProfileManager;

class WebUIPlugin : public Plugin {
  public:
    WebUIPlugin();
    void setup(Controller *controller, PluginManager *pluginManager) override;
    void loop() override;

  private:
    void setupServer();
    void start();
    void stop();

    // OTA requests arrive over the WebSocket but are executed here, where GitHubOTA lives
    void handleOTASettings(JsonDocument &request);
    void handleOTAStart(JsonDocument &request);

    // HTTP handlers
    // Serves the web UI from the firmware-embedded, memory-mapped flash blob
    // (catch-all for any path not claimed by an explicit route). [GM-106]
    void serveWebAsset(AsyncWebServerRequest *request);
    void handleSettings(AsyncWebServerRequest *request) const;
    void handleBLEScaleList(AsyncWebServerRequest *request);
    void handleBLEScaleScan(AsyncWebServerRequest *request);
    void handleBLEScaleConnect(AsyncWebServerRequest *request);
    void handleBLEScaleInfo(AsyncWebServerRequest *request);
    void handleBLEScaleForget(AsyncWebServerRequest *request);
    void updateOTAStatus(const String &version);
    void updateOTAProgress(uint8_t phase, int progress);

    // Core dump download
    void handleCoreDumpDownload(AsyncWebServerRequest *request);

    // Profile images on the SD card (pre-converted 300x300 RGB565 from the web UI)
    void handleProfileImage(AsyncWebServerRequest *request);
    void handleProfileImageBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total);

    // Firmware upload from the web UI: POST /api/ota/upload?target=display|controller[&force=1], body = the .bin.
    // The flow lives in firmware_image::UploadSession (unit tested); these feed it and act on its outcome.
    void handleFirmwareUpload(AsyncWebServerRequest *request);
    void handleFirmwareUploadBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index,
                                  size_t total);
    void loopFirmwareUpload(uint32_t now);

    GitHubOTA *ota = nullptr;
    AsyncWebServer server;
    WebSocketHandler wsHandler;
    Controller *controller = nullptr;
    PluginManager *pluginManager = nullptr;
    DNSServer *dnsServer = nullptr;
    ProfileManager *profileManager = nullptr;

    long lastUpdateCheck = 0;
    long lastDns = 0;
    bool updating = false;
    bool apMode = false;
    bool serverRunning = false;
    bool pluginHooksRegistered = false;
    String updateComponent = "";

    // One upload at a time; a new upload takes over a stale one whose client went away.
    AsyncWebServerRequest *imageUploadRequest = nullptr;
    File imageUploadFile;
    String imageUploadError;

    // Firmware upload: the session is fed from the AsyncTCP task, loop() reads it only under fwMutex.
    std::mutex fwMutex;
    std::unique_ptr<firmware_image::UploadSink> fwDisplaySink;
    std::unique_ptr<firmware_image::UploadSink> fwControllerSink;
    std::unique_ptr<firmware_image::UploadSession> fwSession;
    // Handed to loop(): the controller flash and the restart must not run in the AsyncTCP task.
    std::atomic<bool> fwFlashController{false};
    std::atomic<uint32_t> fwRestartAt{0};
    // The machine's state for the AsyncTCP task, refreshed by loop().
    std::atomic<bool> fwProcessActive{false};
    std::atomic<bool> fwControllerUpdating{false};
    bool fwHolding = false; // loop() told the machine to hold still for an upload
};

#endif // WEBUIPLUGIN_H
