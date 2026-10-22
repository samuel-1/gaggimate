#ifndef FIRMWAREIMAGE_H
#define FIRMWAREIMAGE_H

#include <cstddef>
#include <cstdint>
#include <string>

// Checks for a firmware image uploaded through the web UI (WebUIPlugin::handleFirmwareUpload).
// STL only, so it is unit tested on the host (test/test_firmware_image).

namespace firmware_image {

constexpr uint8_t ESP_IMAGE_MAGIC = 0xE9;
constexpr uint16_t CHIP_ID_ESP32S3 = 9; // esp_chip_id_t; every GaggiMate board is an ESP32-S3
constexpr size_t HEADER_BYTES = 24;     // sizeof(esp_image_header_t)

// True when `data` starts with an ESP app image header for `chipId`.
bool isAppImageHeader(const uint8_t *data, size_t len, uint16_t chipId = CHIP_ID_ESP32S3);

// The part of the machine an upload is meant for.
enum class Target { Display, Controller };

// "display" or "controller", as the web UI sends it. False for anything else.
bool parseTarget(const std::string &name, Target &target);

// Finds the "GMFW1:<env>:" marker (firmware_id.h) in an image that arrives in chunks of
// any size; a marker split across two chunks is still found. The first marker wins.
class IdScanner {
  public:
    void feed(const uint8_t *data, size_t len);
    bool found() const { return !env_.empty(); }
    // The env named by the marker, e.g. "display-headless"; empty if none was seen.
    const std::string &env() const { return env_; }
    void reset();

  private:
    static constexpr size_t MAX_ENV = 40;
    std::string carry_; // tail of the previous chunk that could still start a marker
    std::string env_;
};

// Why an image may not be flashed as `target` on a display
// running `runningEnv`, or empty when it may. `force` accepts an image without a marker
// (e.g. an official release built before markers existed), never one marked for another env.
std::string rejectReason(const IdScanner &scanner, Target target, const std::string &runningEnv, bool force);

} // namespace firmware_image

#endif // FIRMWAREIMAGE_H
