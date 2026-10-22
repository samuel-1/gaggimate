#include "FirmwareUpload.h"

#include <algorithm>
#include <utility>

namespace firmware_image {

namespace {
constexpr char NOT_AN_IMAGE[] = "Not an ESP32-S3 firmware image (.bin)";
} // namespace

UploadSession::UploadSession(std::string runningEnv, UploadSink &displaySink, UploadSink &controllerSink)
    : runningEnv_(std::move(runningEnv)), displaySink_(displaySink), controllerSink_(controllerSink) {}

void UploadSession::chunk(UploadTicket &ticket, const std::string &target, bool force, const uint8_t *data,
                          size_t len, size_t index, size_t total, const UploadConditions &conditions, uint32_t now) {
    if (index == 0) {
        ticket.rejection = begin(target, force, total, conditions, now);
        ticket.upload = ticket.rejection == nullptr ? current_ : 0;
    }
    if (ticket.upload == 0 || ticket.upload != current_ || !error_.empty() || complete_)
        return;
    lastChunkAt_ = now;
    scanner_.feed(data, len);
    const bool last = index + len == total;

    // The first chunk can be shorter than the image header (it is whatever followed the HTTP headers in the
    // first TCP segment), so hold the header back until it is complete and checked: a file that is no ESP32-S3
    // image never gets a byte written.
    if (header_.size() < HEADER_BYTES) {
        const size_t take = std::min(HEADER_BYTES - header_.size(), len);
        header_.append(reinterpret_cast<const char *>(data), take);
        data += take;
        len -= take;
        if (header_.size() < HEADER_BYTES) {
            if (last)
                fail(NOT_AN_IMAGE);
            return;
        }
        if (!isAppImageHeader(reinterpret_cast<const uint8_t *>(header_.data()), header_.size())) {
            fail(NOT_AN_IMAGE);
            return;
        }
        if (!write(reinterpret_cast<const uint8_t *>(header_.data()), header_.size()))
            return;
    }
    if (len > 0 && !write(data, len))
        return;
    if (last)
        finish();
}

bool UploadSession::write(const uint8_t *data, size_t len) {
    const std::string err = sink_->write(data, len);
    if (err.empty())
        return true;
    fail(err);
    return false;
}

const char *UploadSession::begin(const std::string &target, bool force, size_t total,
                                 const UploadConditions &conditions, uint32_t now) {
    if (busy()) {
        // An accepted image still waiting for its reply, or an upload that is still receiving.
        if (complete_ || now - lastChunkAt_ < STALL_MS)
            return "Another firmware upload is in progress";
        fail("Upload stalled"); // the previous browser went away mid-upload; this one takes over
    }
    if (conditions.updateRunning)
        return "An update is already running";
    if (conditions.processActive)
        return "Finish the running brew, steam or water process first";
    Target parsed;
    if (!parseTarget(target, parsed))
        return "Unknown update target";
    if (total == 0)
        return "The file is empty";

    current_ = ++lastId_;
    if (current_ == 0) // wrapped
        current_ = lastId_ = 1;
    sink_ = parsed == Target::Display ? &displaySink_ : &controllerSink_;
    target_ = parsed;
    force_ = force;
    complete_ = false;
    error_.clear();
    header_.clear();
    scanner_.reset();
    lastChunkAt_ = now;
    const std::string err = sink_->open(total);
    if (!err.empty())
        fail(err);
    return nullptr;
}

void UploadSession::finish() {
    const std::string reason = rejectReason(scanner_, target_, runningEnv_, force_);
    if (!reason.empty()) {
        fail(reason);
        return;
    }
    const std::string err = sink_->commit();
    if (!err.empty()) {
        fail(err);
        return;
    }
    complete_ = true;
}

void UploadSession::fail(const std::string &reason) {
    if (error_.empty())
        error_ = reason;
    if (sink_ != nullptr)
        sink_->discard();
}

UploadReply UploadSession::reply(const UploadTicket &ticket) {
    UploadReply r;
    if (ticket.rejection != nullptr) {
        r.status = 409;
        r.text = ticket.rejection;
        return r;
    }
    if (ticket.upload == 0) {
        r.text = "No firmware received";
        return r;
    }
    if (ticket.upload != current_) {
        r.text = "Upload stalled"; // a newer upload took over
        return r;
    }
    if (error_.empty() && !complete_)
        fail("The upload ended early");
    current_ = 0; // the session is free for the next upload
    if (!error_.empty()) {
        r.text = error_;
        return r;
    }
    r.ok = true;
    if (target_ == Target::Display) {
        r.status = 200;
        r.text = "restarting";
        r.next = UploadReply::Next::RestartDisplay;
    } else {
        r.status = 202;
        r.text = "flashing-controller";
        r.next = UploadReply::Next::FlashController;
    }
    return r;
}

bool UploadSession::failIfStalled(uint32_t now) {
    if (!active() || now - lastChunkAt_ <= STALL_MS)
        return false;
    fail("Upload stalled");
    return true;
}

} // namespace firmware_image
