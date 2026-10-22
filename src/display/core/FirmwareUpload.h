#ifndef FIRMWAREUPLOAD_H
#define FIRMWAREUPLOAD_H

#include "FirmwareImage.h"

#include <cstddef>
#include <cstdint>
#include <string>

// The firmware upload flow behind POST /api/ota/upload (WebUIPlugin), kept free of ESP and HTTP types so it is
// unit tested on the host (test/test_firmware_upload). WebUIPlugin feeds it the body chunks of each request and
// supplies the sinks that do the actual flash and file work.

namespace firmware_image {

// Where an accepted image goes: the display's next OTA partition, or the file the controller update is sent from.
// Every method returns an empty string on success, else the reason shown to the user.
class UploadSink {
  public:
    virtual ~UploadSink() = default;
    virtual std::string open(size_t total) = 0;
    virtual std::string write(const uint8_t *data, size_t len) = 0;
    // The whole image arrived and passed the id check: verify it and make it the one to use.
    virtual std::string commit() = 0;
    // Drop whatever was written (failed or abandoned upload).
    virtual void discard() = 0;
};

// What else is going on on the machine when an upload starts.
struct UploadConditions {
    bool updateRunning = false; // a GitHub update or an earlier upload's controller flash
    bool processActive = false; // brew, steam, water or grind
};

// What one request has to do with the session. It lives with the request (WebUIPlugin keeps it in the request's
// zero-initialised, free()d _tempObject, hence plain data) and starts out all zero. Requests are told apart by
// it, never by address: the web server frees a request whose browser went away without a reply, and the next
// request may well be allocated at the same address.
struct UploadTicket {
    uint32_t upload = 0;             // the upload this request feeds; 0 = none
    const char *rejection = nullptr; // why its first chunk could not start an upload (a string literal)
};

// The HTTP answer to one upload request.
struct UploadReply {
    enum class Next { Nothing, RestartDisplay, FlashController };
    int status = 400;
    bool ok = false;
    std::string text; // the result on success, the error otherwise
    Next next = Next::Nothing;
};

class UploadSession {
  public:
    // No data for this long: the browser went away mid-upload. Times are millis(), 32 bits on the device.
    static constexpr uint32_t STALL_MS = 30000;

    UploadSession(std::string runningEnv, UploadSink &displaySink, UploadSink &controllerSink);

    // A body chunk of the request holding `ticket`. The first chunk (index 0) starts an upload, or records on the
    // ticket why it can't (the session then keeps serving the upload it already has, and ignores the rest of
    // this request). `target` is the request's raw target parameter.
    void chunk(UploadTicket &ticket, const std::string &target, bool force, const uint8_t *data, size_t len,
               size_t index, size_t total, const UploadConditions &conditions, uint32_t now);

    // The request holding `ticket` finished (its body handler won't be called again).
    UploadReply reply(const UploadTicket &ticket);

    // Fails an upload whose browser stopped sending. True if it did.
    bool failIfStalled(uint32_t now);

    // An upload is receiving data.
    bool active() const { return busy() && !complete_; }
    // An upload is receiving data, or is complete and waiting for its reply: the machine should hold still.
    bool busy() const { return current_ != 0 && error_.empty(); }

  private:
    const char *begin(const std::string &target, bool force, size_t total, const UploadConditions &conditions,
                      uint32_t now);
    bool write(const uint8_t *data, size_t len);
    void finish();
    void fail(const std::string &reason);

    std::string runningEnv_;
    UploadSink &displaySink_;
    UploadSink &controllerSink_;

    uint32_t current_ = 0; // the upload being received or awaiting its reply; 0 = none
    uint32_t lastId_ = 0;
    UploadSink *sink_ = nullptr;
    Target target_ = Target::Display;
    bool force_ = false;
    bool complete_ = false;
    std::string error_;
    std::string header_; // the image header, held back until it is complete and checked
    IdScanner scanner_;
    uint32_t lastChunkAt_ = 0;
};

} // namespace firmware_image

#endif // FIRMWAREUPLOAD_H
