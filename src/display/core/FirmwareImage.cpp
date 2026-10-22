#include "FirmwareImage.h"

#include "../../firmware_id.h"

#include <cstring>

namespace firmware_image {

namespace {

constexpr char PREFIX[] = FIRMWARE_ID_PREFIX;
constexpr size_t PREFIX_LEN = sizeof(PREFIX) - 1;

bool isEnvChar(char c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_'; }

} // namespace

bool isAppImageHeader(const uint8_t *data, size_t len, uint16_t chipId) {
    if (data == nullptr || len < HEADER_BYTES || data[0] != ESP_IMAGE_MAGIC)
        return false;
    // esp_image_header_t: chip_id is the little-endian uint16 at offset 12.
    const uint16_t imageChip = static_cast<uint16_t>(data[12] | (data[13] << 8));
    return imageChip == chipId;
}

bool parseTarget(const std::string &name, Target &target) {
    if (name == "display")
        target = Target::Display;
    else if (name == "controller")
        target = Target::Controller;
    else
        return false;
    return true;
}

void IdScanner::feed(const uint8_t *data, size_t len) {
    if (found() || data == nullptr || len == 0)
        return;
    std::string buf = carry_;
    buf.append(reinterpret_cast<const char *>(data), len);

    for (size_t pos = buf.find(PREFIX); pos != std::string::npos; pos = buf.find(PREFIX, pos + 1)) {
        size_t end = pos + PREFIX_LEN;
        while (end < buf.size() && end - pos - PREFIX_LEN <= MAX_ENV && isEnvChar(buf[end]))
            end++;
        if (end == buf.size())
            break; // may continue in the next chunk; the carry below keeps it
        const size_t envLen = end - pos - PREFIX_LEN;
        if (buf[end] == ':' && envLen > 0 && envLen <= MAX_ENV) {
            env_ = buf.substr(pos + PREFIX_LEN, envLen);
            carry_.clear();
            return;
        }
        // e.g. the bare FIRMWARE_ID_PREFIX literal of this very scanner, followed by a NUL
    }
    // Long enough to hold the start of any marker that is still incomplete.
    const size_t keep = PREFIX_LEN + MAX_ENV + 1;
    carry_ = buf.size() > keep ? buf.substr(buf.size() - keep) : buf;
}

void IdScanner::reset() {
    carry_.clear();
    env_.clear();
}

std::string rejectReason(const IdScanner &scanner, Target target, const std::string &runningEnv, bool force) {
    if (!scanner.found())
        return force ? "" : "This file has no GaggiMate firmware id, so its board can't be checked";
    const std::string &env = scanner.env();
    if (target == Target::Controller) {
        if (env != "controller")
            return "This firmware is for '" + env + "', not the controller";
        return "";
    }
    if (env != runningEnv)
        return "This firmware is for '" + env + "', but this display runs '" + runningEnv + "'";
    return "";
}

} // namespace firmware_image
