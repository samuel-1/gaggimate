// Unit tests: checks on firmware images uploaded through the web UI (FirmwareImage).
// Host-side, no ESP32/Arduino runtime — pio test -e native -f test_firmware_image.

#include <unity.h>

#include <string>
#include <vector>

#include "display/core/FirmwareImage.cpp"

using firmware_image::IdScanner;
using firmware_image::isAppImageHeader;
using firmware_image::parseTarget;
using firmware_image::rejectReason;
using firmware_image::Target;

static std::vector<uint8_t> header(uint8_t magic, uint16_t chip) {
    std::vector<uint8_t> h(24, 0);
    h[0] = magic;
    h[12] = chip & 0xFF;
    h[13] = chip >> 8;
    return h;
}

// A fake image: filler, the scanner's own bare prefix literal, then the real marker.
static std::string image(const std::string &env) {
    std::string img(5000, '\x01');
    img += std::string("GMFW1:") + '\0' + "other strings";
    img += std::string(3000, '\x02');
    img += "GMFW1:" + env + ":";
    img += std::string(4000, '\x03');
    return img;
}

static IdScanner scanChunks(const std::string &img, size_t chunk) {
    IdScanner s;
    for (size_t i = 0; i < img.size(); i += chunk) {
        const size_t n = std::min(chunk, img.size() - i);
        s.feed(reinterpret_cast<const uint8_t *>(img.data() + i), n);
    }
    return s;
}

void test_header_accepts_esp32s3_image() {
    auto h = header(0xE9, 9);
    TEST_ASSERT_TRUE(isAppImageHeader(h.data(), h.size()));
}

void test_header_rejects_wrong_magic_chip_or_short_data() {
    auto badMagic = header(0x7F, 9);
    auto otherChip = header(0xE9, 0); // classic ESP32
    auto ok = header(0xE9, 9);
    TEST_ASSERT_FALSE(isAppImageHeader(badMagic.data(), badMagic.size()));
    TEST_ASSERT_FALSE(isAppImageHeader(otherChip.data(), otherChip.size()));
    TEST_ASSERT_FALSE(isAppImageHeader(ok.data(), 10));
    TEST_ASSERT_FALSE(isAppImageHeader(nullptr, 0));
}

void test_scanner_finds_marker_in_one_chunk() {
    IdScanner s = scanChunks(image("display-headless"), 1 << 20);
    TEST_ASSERT_TRUE(s.found());
    TEST_ASSERT_EQUAL_STRING("display-headless", s.env().c_str());
}

void test_scanner_finds_marker_split_at_every_boundary() {
    const std::string img = image("controller");
    const size_t at = img.find("GMFW1:controller:");
    // Split the image in two at every byte of the marker (and around it).
    for (size_t cut = at - 2; cut <= at + 20; cut++) {
        IdScanner s;
        s.feed(reinterpret_cast<const uint8_t *>(img.data()), cut);
        s.feed(reinterpret_cast<const uint8_t *>(img.data() + cut), img.size() - cut);
        TEST_ASSERT_EQUAL_STRING_MESSAGE("controller", s.env().c_str(), std::to_string(cut).c_str());
    }
}

void test_scanner_finds_marker_in_tiny_chunks() {
    TEST_ASSERT_EQUAL_STRING("display", scanChunks(image("display"), 1).env().c_str());
    TEST_ASSERT_EQUAL_STRING("display", scanChunks(image("display"), 7).env().c_str());
}

void test_scanner_ignores_bare_prefix_and_invalid_markers() {
    std::string img = std::string("GMFW1:") + '\0' + "GMFW1:UPPER:" + "GMFW1::" + "GMFW1:no-colon";
    IdScanner s = scanChunks(img, 3);
    TEST_ASSERT_FALSE(s.found());
}

void test_scanner_keeps_first_marker() {
    IdScanner s = scanChunks(std::string("GMFW1:controller:...GMFW1:display:"), 4);
    TEST_ASSERT_EQUAL_STRING("controller", s.env().c_str());
}

void test_reject_reason_rules() {
    IdScanner display = scanChunks(image("display-headless"), 512);
    IdScanner controller = scanChunks(image("controller"), 512);
    IdScanner none = scanChunks(std::string(2000, '\x05'), 512);

    // Matching images pass.
    TEST_ASSERT_EQUAL_STRING("", rejectReason(display, Target::Display, "display-headless", false).c_str());
    TEST_ASSERT_EQUAL_STRING("", rejectReason(controller, Target::Controller, "display-headless", false).c_str());
    // Wrong board, even with force.
    TEST_ASSERT_TRUE(rejectReason(controller, Target::Display, "display-headless", true).size() > 0);
    TEST_ASSERT_TRUE(rejectReason(display, Target::Controller, "display-headless", true).size() > 0);
    TEST_ASSERT_TRUE(rejectReason(display, Target::Display, "display", true).size() > 0); // headless image, screen display
    // No marker: only with force.
    TEST_ASSERT_TRUE(rejectReason(none, Target::Display, "display", false).size() > 0);
    TEST_ASSERT_EQUAL_STRING("", rejectReason(none, Target::Display, "display", true).c_str());
    TEST_ASSERT_EQUAL_STRING("", rejectReason(none, Target::Controller, "display", true).c_str());
}

void test_parse_target() {
    Target t = Target::Controller;
    TEST_ASSERT_TRUE(parseTarget("display", t));
    TEST_ASSERT_TRUE(t == Target::Display);
    TEST_ASSERT_TRUE(parseTarget("controller", t));
    TEST_ASSERT_TRUE(t == Target::Controller);
    for (const char *bad : {"", "filesystem", "Display", "display "})
        TEST_ASSERT_FALSE_MESSAGE(parseTarget(bad, t), bad);
}

void setUp() {}
void tearDown() {}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_header_accepts_esp32s3_image);
    RUN_TEST(test_header_rejects_wrong_magic_chip_or_short_data);
    RUN_TEST(test_scanner_finds_marker_in_one_chunk);
    RUN_TEST(test_scanner_finds_marker_split_at_every_boundary);
    RUN_TEST(test_scanner_finds_marker_in_tiny_chunks);
    RUN_TEST(test_scanner_ignores_bare_prefix_and_invalid_markers);
    RUN_TEST(test_scanner_keeps_first_marker);
    RUN_TEST(test_reject_reason_rules);
    RUN_TEST(test_parse_target);
    return UNITY_END();
}
