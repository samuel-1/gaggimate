// Unit tests: the web UI firmware upload flow (UploadSession behind POST /api/ota/upload).
// Host-side, no ESP32/Arduino runtime — pio test -e native -f test_firmware_upload.

#include <unity.h>

#include <algorithm>
#include <string>
#include <vector>

#include "display/core/FirmwareImage.cpp"
#include "display/core/FirmwareUpload.cpp"

using namespace firmware_image;

// Records what the session does with it; each step can be made to fail.
struct FakeSink : UploadSink {
    std::string openError, writeError, commitError;
    size_t failWriteAfter = SIZE_MAX; // writeError once this many bytes were written
    size_t opened = 0;                // total passed to open(), 0 = never opened
    std::string written;
    int commits = 0;
    int discards = 0;

    std::string open(size_t total) override {
        opened = total;
        written.clear();
        return openError;
    }
    std::string write(const uint8_t *data, size_t len) override {
        if (written.size() + len > failWriteAfter)
            return writeError;
        written.append(reinterpret_cast<const char *>(data), len);
        return "";
    }
    std::string commit() override {
        if (!commitError.empty())
            return commitError;
        commits++;
        return "";
    }
    void discard() override { discards++; }
};

static const std::string RUNNING_ENV = "display-headless";

// An ESP32-S3 image header, filler and the "GMFW1:<env>:" marker (none for an empty env).
static std::string image(const std::string &env, size_t size = 20000, uint8_t magic = 0xE9) {
    std::string img(24, '\0');
    img[0] = static_cast<char>(magic);
    img[12] = 9; // ESP32-S3
    img += std::string(size / 2, '\x11');
    if (!env.empty())
        img += "GMFW1:" + env + ":";
    img += std::string(size / 2, '\x22');
    return img;
}

struct Rig {
    FakeSink display, controller;
    UploadSession session{RUNNING_ENV, display, controller};
    uint32_t now = 100000; // millis()

    // Feeds `img` in chunks as the web server would; returns the rejection of the first chunk, if any.
    std::string send(UploadTicket &ticket, const std::string &target, const std::string &img, size_t chunk = 4096,
                     bool force = false, UploadConditions conditions = {}, size_t stopAfter = SIZE_MAX,
                     size_t from = 0) {
        for (size_t i = from; i < img.size() && i < stopAfter; i += chunk) {
            const size_t n = std::min(chunk, img.size() - i);
            session.chunk(ticket, target, force, reinterpret_cast<const uint8_t *>(img.data() + i), n, i, img.size(),
                          conditions, now);
            now += 10;
        }
        return ticket.rejection != nullptr ? ticket.rejection : "";
    }
};

static void expectFailed(Rig &rig, UploadTicket &ticket, FakeSink &sink, const char *fragment);

// A chunk of `img` fed straight to the session, for tests that need exact chunk boundaries.
static void feed(Rig &rig, UploadTicket &ticket, const std::string &img, size_t from, size_t n,
                 const std::string &target = "display") {
    rig.session.chunk(ticket, target, false, reinterpret_cast<const uint8_t *>(img.data() + from), n, from,
                      img.size(), {}, rig.now);
}

// ---- Accepted uploads ----

void test_display_upload_is_written_committed_and_restarts() {
    Rig rig;
    UploadTicket a;
    const std::string img = image(RUNNING_ENV);
    TEST_ASSERT_EQUAL_STRING("", rig.send(a, "display", img).c_str());
    TEST_ASSERT_EQUAL(img.size(), rig.display.opened);
    TEST_ASSERT_TRUE(rig.display.written == img);
    TEST_ASSERT_EQUAL(1, rig.display.commits);
    TEST_ASSERT_EQUAL(0, rig.display.discards);
    TEST_ASSERT_EQUAL(0, rig.controller.opened);
    TEST_ASSERT_TRUE(rig.session.busy()); // complete; the machine holds still until the reply

    UploadReply r = rig.session.reply(a);
    TEST_ASSERT_TRUE(r.ok);
    TEST_ASSERT_EQUAL(200, r.status);
    TEST_ASSERT_EQUAL_STRING("restarting", r.text.c_str());
    TEST_ASSERT_TRUE(r.next == UploadReply::Next::RestartDisplay);
    TEST_ASSERT_FALSE(rig.session.busy());
}

void test_controller_upload_is_stored_and_flashed() {
    Rig rig;
    UploadTicket a;
    const std::string img = image("controller");
    rig.send(a, "controller", img);
    TEST_ASSERT_TRUE(rig.controller.written == img);
    TEST_ASSERT_EQUAL(1, rig.controller.commits);
    TEST_ASSERT_EQUAL(0, rig.display.opened);

    UploadReply r = rig.session.reply(a);
    TEST_ASSERT_TRUE(r.ok);
    TEST_ASSERT_EQUAL(202, r.status);
    TEST_ASSERT_TRUE(r.next == UploadReply::Next::FlashController);
}

void test_single_chunk_and_tiny_chunks_both_work() {
    for (size_t chunk : {size_t(1) << 20, size_t(1), size_t(37), size_t(24)}) {
        Rig rig;
        UploadTicket a;
        const std::string img = image(RUNNING_ENV, 3000);
        rig.send(a, "display", img, chunk);
        TEST_ASSERT_TRUE_MESSAGE(rig.display.written == img, std::to_string(chunk).c_str());
        TEST_ASSERT_TRUE_MESSAGE(rig.session.reply(a).ok, std::to_string(chunk).c_str());
    }
}

void test_header_split_over_the_first_chunks_is_accepted() {
    // The first body chunk is whatever followed the HTTP headers in the first TCP segment: maybe a few bytes.
    Rig rig;
    UploadTicket a;
    const std::string img = image(RUNNING_ENV, 5000);
    feed(rig, a, img, 0, 5);   // 5 header bytes
    feed(rig, a, img, 5, 10);  // 15
    feed(rig, a, img, 15, 30); // header complete inside this chunk
    feed(rig, a, img, 45, img.size() - 45);
    TEST_ASSERT_TRUE(rig.display.written == img); // written once, in order
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

void test_header_exactly_one_chunk_is_accepted() {
    Rig rig;
    UploadTicket a;
    const std::string img = image(RUNNING_ENV, 5000);
    feed(rig, a, img, 0, HEADER_BYTES);
    TEST_ASSERT_EQUAL(HEADER_BYTES, rig.display.written.size()); // checked and written as soon as it is complete
    feed(rig, a, img, HEADER_BYTES, img.size() - HEADER_BYTES);
    TEST_ASSERT_TRUE(rig.display.written == img);
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

void test_marker_split_across_chunk_boundaries_is_found() {
    const std::string img = image("controller", 4000);
    const size_t at = img.find("GMFW1:");
    for (size_t cut = at; cut <= at + 17; cut++) { // every cut through "GMFW1:controller:"
        Rig rig;
        UploadTicket a;
        feed(rig, a, img, 0, cut, "controller");
        feed(rig, a, img, cut, img.size() - cut, "controller");
        TEST_ASSERT_TRUE_MESSAGE(rig.session.reply(a).ok, std::to_string(cut).c_str());
    }
}

void test_marker_in_the_held_back_header_is_found() {
    // A marker that starts inside the first 24 bytes (held back until the header is complete) still counts.
    std::string img = image("", 3000);
    img.replace(16, 17, "GMFW1:controller:");
    Rig rig;
    UploadTicket a;
    feed(rig, a, img, 0, 10, "controller");
    feed(rig, a, img, 10, 20, "controller");
    feed(rig, a, img, 30, img.size() - 30, "controller");
    TEST_ASSERT_TRUE(rig.controller.written == img);
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

void test_file_shorter_than_a_header_is_refused_without_writing() {
    for (size_t chunk : {size_t(4), size_t(100)}) {
        Rig rig;
        UploadTicket a;
        rig.send(a, "display", image(RUNNING_ENV).substr(0, 20), chunk);
        TEST_ASSERT_EQUAL(0, rig.display.written.size());
        expectFailed(rig, a, rig.display, "Not an ESP32-S3 firmware image");
    }
}

void test_force_accepts_an_image_without_firmware_id() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image(""), 4096, /*force=*/true);
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

// ---- Rejected images (nothing gets activated) ----

static void expectFailed(Rig &rig, UploadTicket &ticket, FakeSink &sink, const char *fragment) {
    TEST_ASSERT_FALSE(rig.session.busy()); // the machine is released as soon as the upload fails
    UploadReply r = rig.session.reply(ticket);
    TEST_ASSERT_FALSE(r.ok);
    TEST_ASSERT_EQUAL(400, r.status);
    TEST_ASSERT_TRUE_MESSAGE(r.text.find(fragment) != std::string::npos, r.text.c_str());
    TEST_ASSERT_TRUE(r.next == UploadReply::Next::Nothing);
    TEST_ASSERT_EQUAL(0, sink.commits);
    TEST_ASSERT_TRUE(sink.discards > 0);
}

void test_non_esp_file_is_refused() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image(RUNNING_ENV, 20000, 0x50)); // e.g. a .zip
    TEST_ASSERT_EQUAL(0, rig.display.written.size());        // refused before the first write
    expectFailed(rig, a, rig.display, "Not an ESP32-S3 firmware image");
}

void test_controller_image_is_refused_for_the_display() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image("controller"));
    expectFailed(rig, a, rig.display, "'controller'");
}

void test_display_image_is_refused_for_the_controller() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "controller", image(RUNNING_ENV));
    expectFailed(rig, a, rig.controller, "not the controller");
}

void test_image_for_another_display_build_is_refused_even_with_force() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image("display"), 4096, /*force=*/true); // screen build on a headless display
    expectFailed(rig, a, rig.display, "this display runs 'display-headless'");
}

void test_image_without_firmware_id_needs_force() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "controller", image(""));
    expectFailed(rig, a, rig.controller, "no GaggiMate firmware id");
}

// ---- Sink errors ----

void test_open_error_is_reported_and_later_chunks_ignored() {
    Rig rig;
    UploadTicket a;
    rig.controller.openError = "The controller is not connected";
    rig.send(a, "controller", image("controller"));
    TEST_ASSERT_EQUAL(0, rig.controller.written.size());
    expectFailed(rig, a, rig.controller, "not connected");
}

void test_write_error_stops_the_upload() {
    Rig rig;
    UploadTicket a;
    rig.display.failWriteAfter = 8000;
    rig.display.writeError = "Writing the firmware failed: ESP_ERR_FLASH_OP_FAIL";
    rig.send(a, "display", image(RUNNING_ENV));
    TEST_ASSERT_TRUE(rig.display.written.size() <= 8000);
    expectFailed(rig, a, rig.display, "ESP_ERR_FLASH_OP_FAIL");
}

void test_commit_error_means_failure() {
    Rig rig;
    UploadTicket a;
    rig.display.commitError = "The firmware image is damaged: ESP_ERR_OTA_VALIDATE_FAILED";
    rig.send(a, "display", image(RUNNING_ENV));
    expectFailed(rig, a, rig.display, "damaged");
}

// ---- Requests that can't start an upload ----

static void expectRejected(Rig &rig, UploadTicket &ticket, const std::string &rejection, const char *fragment) {
    TEST_ASSERT_TRUE_MESSAGE(rejection.find(fragment) != std::string::npos, rejection.c_str());
    UploadReply r = rig.session.reply(ticket);
    TEST_ASSERT_EQUAL(409, r.status);
    TEST_ASSERT_FALSE(r.ok);
    TEST_ASSERT_EQUAL_STRING(rejection.c_str(), r.text.c_str());
    TEST_ASSERT_EQUAL(0, rig.display.opened + rig.controller.opened);
    TEST_ASSERT_FALSE(rig.session.busy()); // the machine is never told to hold still
}

void test_refused_while_an_update_runs() {
    Rig rig;
    UploadTicket a;
    UploadConditions c;
    c.updateRunning = true;
    expectRejected(rig, a, rig.send(a, "display", image(RUNNING_ENV), 4096, false, c), "already running");
}

void test_refused_while_brewing() {
    Rig rig;
    UploadTicket a;
    UploadConditions c;
    c.processActive = true;
    expectRejected(rig, a, rig.send(a, "controller", image("controller"), 4096, false, c), "brew");
}

void test_unknown_target_and_empty_file_are_refused() {
    Rig rig;
    UploadTicket a, b;
    expectRejected(rig, a, rig.send(a, "filesystem", image(RUNNING_ENV)), "Unknown update target");
    rig.session.chunk(b, "display", false, nullptr, 0, 0, 0, {}, rig.now);
    expectRejected(rig, b, b.rejection, "empty");
}

void test_request_without_body_gets_no_firmware_received() {
    Rig rig;
    UploadTicket a;
    UploadReply r = rig.session.reply(a);
    TEST_ASSERT_EQUAL(400, r.status);
    TEST_ASSERT_EQUAL_STRING("No firmware received", r.text.c_str());
}

// ---- Several uploads ----

void test_second_upload_is_refused_while_the_first_runs() {
    Rig rig;
    UploadTicket a, b;
    const std::string img = image(RUNNING_ENV);
    rig.send(a, "display", img, 4096, false, {}, /*stopAfter=*/8192); // A is half way
    const std::string rejection = rig.send(b, "display", img);           // all of B's chunks
    TEST_ASSERT_EQUAL_STRING("Another firmware upload is in progress", rejection.c_str());
    TEST_ASSERT_EQUAL(409, rig.session.reply(b).status);

    // A carries on undisturbed: none of B's chunks got in.
    rig.send(a, "display", img, 4096, false, {}, SIZE_MAX, /*from=*/8192);
    TEST_ASSERT_TRUE(rig.display.written == img);
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

void test_refused_request_never_feeds_the_running_upload() {
    // A's browser went away mid-upload; the web server freed A without a reply and may allocate the retry B at
    // the same address. B is refused (A has not stalled yet), and its later chunks must not land in A's image,
    // which would otherwise be completed with B's tail and reported to B as a success.
    Rig rig;
    UploadTicket a;
    const std::string img = image("controller");
    rig.send(a, "controller", img, 4096, false, {}, 8192);
    UploadTicket b; // a fresh ticket, whatever the request's address
    const std::string rejection = rig.send(b, "controller", img);
    TEST_ASSERT_EQUAL_STRING("Another firmware upload is in progress", rejection.c_str());
    TEST_ASSERT_EQUAL(8192, rig.controller.written.size()); // only A's own chunks
    TEST_ASSERT_EQUAL(0, rig.controller.commits);
    UploadReply r = rig.session.reply(b);
    TEST_ASSERT_FALSE(r.ok);
    TEST_ASSERT_EQUAL(409, r.status);
    TEST_ASSERT_TRUE(rig.session.active()); // A still owns the session until it stalls
}

void test_accepted_image_awaiting_its_reply_is_not_taken_over() {
    Rig rig;
    UploadTicket a, b;
    rig.send(a, "display", image(RUNNING_ENV));
    rig.now += UploadSession::STALL_MS * 2; // even long after
    const std::string rejection = rig.send(b, "display", image(RUNNING_ENV));
    TEST_ASSERT_EQUAL_STRING("Another firmware upload is in progress", rejection.c_str());
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

void test_stalled_upload_is_taken_over_by_a_new_one() {
    Rig rig;
    UploadTicket a, b;
    const std::string img = image(RUNNING_ENV);
    rig.send(a, "display", img, 4096, false, {}, 8192); // A's browser went away
    rig.now += UploadSession::STALL_MS + 1;
    TEST_ASSERT_EQUAL_STRING("", rig.send(b, "display", img, 4096, false, {}, 8192).c_str());
    TEST_ASSERT_TRUE(rig.display.discards > 0); // A's partial image was dropped
    TEST_ASSERT_TRUE(rig.session.busy());       // the machine stays held, now for B
    rig.send(a, "display", img, 4096, false, {}, SIZE_MAX, 8192); // late chunks of A are ignored
    TEST_ASSERT_EQUAL(8192, rig.display.written.size());
    rig.send(b, "display", img, 4096, false, {}, SIZE_MAX, 8192);
    TEST_ASSERT_TRUE(rig.display.written == img);
    TEST_ASSERT_TRUE(rig.session.reply(b).ok); // B completes
    UploadReply late = rig.session.reply(a);   // A's late reply is not a success
    TEST_ASSERT_FALSE(late.ok);
    TEST_ASSERT_EQUAL_STRING("Upload stalled", late.text.c_str());
}

void test_next_upload_works_after_one_finished() {
    Rig rig;
    UploadTicket a, b;
    rig.send(a, "controller", image("controller"));
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
    rig.send(b, "display", image(RUNNING_ENV));
    TEST_ASSERT_TRUE(rig.session.reply(b).ok);
}

void test_next_upload_works_after_one_failed() {
    Rig rig;
    UploadTicket a, b;
    rig.send(a, "display", image("controller"));
    TEST_ASSERT_FALSE(rig.session.reply(a).ok);
    rig.send(b, "display", image(RUNNING_ENV));
    TEST_ASSERT_TRUE(rig.session.reply(b).ok);
}

void test_failed_upload_without_a_reply_does_not_block_the_next() {
    Rig rig;
    UploadTicket a, b;
    rig.send(a, "display", image("controller")); // fails, and A's browser goes away before the reply
    TEST_ASSERT_EQUAL_STRING("", rig.send(b, "display", image(RUNNING_ENV)).c_str());
    TEST_ASSERT_TRUE(rig.session.reply(b).ok);
}

// ---- Abandoned uploads ----

void test_upload_that_ends_early_fails() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image(RUNNING_ENV), 4096, false, {}, 8192);
    TEST_ASSERT_TRUE(rig.session.busy());
    UploadReply r = rig.session.reply(a);
    TEST_ASSERT_FALSE(r.ok);
    TEST_ASSERT_TRUE_MESSAGE(r.text.find("ended early") != std::string::npos, r.text.c_str());
    TEST_ASSERT_TRUE(rig.display.discards > 0);
    TEST_ASSERT_FALSE(rig.session.busy());
}

void test_stall_check_releases_the_machine() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image(RUNNING_ENV), 4096, false, {}, 8192);
    TEST_ASSERT_TRUE(rig.session.active());
    TEST_ASSERT_FALSE(rig.session.failIfStalled(rig.now + UploadSession::STALL_MS - 1000));
    TEST_ASSERT_TRUE(rig.session.failIfStalled(rig.now + UploadSession::STALL_MS + 1000));
    TEST_ASSERT_FALSE(rig.session.active());
    TEST_ASSERT_FALSE(rig.session.busy());
    TEST_ASSERT_TRUE(rig.display.discards > 0);
    TEST_ASSERT_FALSE(rig.session.failIfStalled(rig.now + UploadSession::STALL_MS * 3)); // only once
}

void test_finished_upload_never_counts_as_stalled() {
    Rig rig;
    UploadTicket a;
    rig.send(a, "display", image(RUNNING_ENV));
    TEST_ASSERT_FALSE(rig.session.failIfStalled(rig.now + UploadSession::STALL_MS * 10));
    TEST_ASSERT_TRUE(rig.session.reply(a).ok);
}

void test_millis_rollover_does_not_stall_a_running_upload() {
    Rig rig;
    UploadTicket a;
    rig.now = 0xFFFFFFFFu - 15; // 32-bit millis() wraps while the chunks arrive (10 ms apart)
    const std::string img = image(RUNNING_ENV);
    rig.send(a, "display", img, 4096, false, {}, 8192);
    TEST_ASSERT_TRUE(rig.now < 100); // wrapped
    TEST_ASSERT_FALSE(rig.session.failIfStalled(rig.now));
    TEST_ASSERT_TRUE(rig.session.active());
    TEST_ASSERT_TRUE(rig.session.failIfStalled(rig.now + UploadSession::STALL_MS + 1)); // a real stall still counts
}

void setUp() {}
void tearDown() {}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_display_upload_is_written_committed_and_restarts);
    RUN_TEST(test_controller_upload_is_stored_and_flashed);
    RUN_TEST(test_single_chunk_and_tiny_chunks_both_work);
    RUN_TEST(test_header_split_over_the_first_chunks_is_accepted);
    RUN_TEST(test_header_exactly_one_chunk_is_accepted);
    RUN_TEST(test_marker_split_across_chunk_boundaries_is_found);
    RUN_TEST(test_marker_in_the_held_back_header_is_found);
    RUN_TEST(test_file_shorter_than_a_header_is_refused_without_writing);
    RUN_TEST(test_force_accepts_an_image_without_firmware_id);
    RUN_TEST(test_non_esp_file_is_refused);
    RUN_TEST(test_controller_image_is_refused_for_the_display);
    RUN_TEST(test_display_image_is_refused_for_the_controller);
    RUN_TEST(test_image_for_another_display_build_is_refused_even_with_force);
    RUN_TEST(test_image_without_firmware_id_needs_force);
    RUN_TEST(test_open_error_is_reported_and_later_chunks_ignored);
    RUN_TEST(test_write_error_stops_the_upload);
    RUN_TEST(test_commit_error_means_failure);
    RUN_TEST(test_refused_while_an_update_runs);
    RUN_TEST(test_refused_while_brewing);
    RUN_TEST(test_unknown_target_and_empty_file_are_refused);
    RUN_TEST(test_request_without_body_gets_no_firmware_received);
    RUN_TEST(test_second_upload_is_refused_while_the_first_runs);
    RUN_TEST(test_refused_request_never_feeds_the_running_upload);
    RUN_TEST(test_accepted_image_awaiting_its_reply_is_not_taken_over);
    RUN_TEST(test_stalled_upload_is_taken_over_by_a_new_one);
    RUN_TEST(test_next_upload_works_after_one_finished);
    RUN_TEST(test_next_upload_works_after_one_failed);
    RUN_TEST(test_failed_upload_without_a_reply_does_not_block_the_next);
    RUN_TEST(test_upload_that_ends_early_fails);
    RUN_TEST(test_stall_check_releases_the_machine);
    RUN_TEST(test_finished_upload_never_counts_as_stalled);
    RUN_TEST(test_millis_rollover_does_not_stall_a_running_upload);
    return UNITY_END();
}
