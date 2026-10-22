#ifndef FIRMWAREUPLOADSINKS_H
#define FIRMWAREUPLOADSINKS_H

#include "GitHubOTA.h"
#include <LittleFS.h>
#include <display/core/FirmwareUpload.h>
#include <esp_ota_ops.h>
#include <memory>

class Controller;

// The device side of a web UI firmware upload (firmware_image::UploadSession decides what happens when).

// Writes an uploaded display image straight into the next OTA partition, as GitHubOTA does with a download.
class OtaPartitionSink : public firmware_image::UploadSink {
  public:
    ~OtaPartitionSink() override;
    std::string open(size_t total) override;
    std::string write(const uint8_t *data, size_t len) override;
    std::string commit() override;
    void discard() override;

  private:
    const esp_partition_t *partition = nullptr;
    esp_ota_handle_t handle = 0;
    std::unique_ptr<OtaWatchdogRelax> watchdogRelax;
};

// Stores an uploaded controller image where ControllerOTA sends updates from; WebUIPlugin then flashes it over BLE.
class ControllerFileSink : public firmware_image::UploadSink {
  public:
    explicit ControllerFileSink(Controller *controller) : controller(controller) {}
    ~ControllerFileSink() override;
    std::string open(size_t total) override;
    std::string write(const uint8_t *data, size_t len) override;
    std::string commit() override;
    void discard() override;

  private:
    Controller *controller;
    File file;
    std::unique_ptr<OtaWatchdogRelax> watchdogRelax; // LittleFS writes erase flash just like an OTA write
};

#endif // FIRMWAREUPLOADSINKS_H
