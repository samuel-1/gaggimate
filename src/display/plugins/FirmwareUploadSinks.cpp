#include "FirmwareUploadSinks.h"

#include <display/core/Controller.h>
#include <esp_err.h>

namespace {

constexpr size_t STORAGE_MARGIN = 16 * 1024; // LittleFS room left for profiles and shot notes

std::string espError(const char *what, esp_err_t err) { return std::string(what) + ": " + esp_err_to_name(err); }

} // namespace

OtaPartitionSink::~OtaPartitionSink() { discard(); }

std::string OtaPartitionSink::open(size_t total) {
    discard();
    partition = esp_ota_get_next_update_partition(nullptr);
    if (partition == nullptr)
        return "No firmware partition available";
    if (total > partition->size)
        return "The file is larger than the firmware partition";
    watchdogRelax.reset(new OtaWatchdogRelax());
    // Erases sector by sector as the data arrives; erasing the whole partition up front would stall the AsyncTCP
    // task for seconds.
    const esp_err_t err = esp_ota_begin(partition, OTA_WITH_SEQUENTIAL_WRITES, &handle);
    if (err != ESP_OK) {
        handle = 0;
        watchdogRelax.reset();
        return espError("Could not start the update", err);
    }
    return "";
}

std::string OtaPartitionSink::write(const uint8_t *data, size_t len) {
    const esp_err_t err = esp_ota_write(handle, data, len);
    return err == ESP_OK ? "" : espError("Writing the firmware failed", err);
}

std::string OtaPartitionSink::commit() {
    // esp_ota_end verifies the complete image (header, checksum, appended SHA-256) and frees the handle either way.
    esp_err_t err = esp_ota_end(handle);
    handle = 0;
    watchdogRelax.reset();
    if (err != ESP_OK)
        return espError("The firmware image is damaged", err);
    err = esp_ota_set_boot_partition(partition);
    return err == ESP_OK ? "" : espError("Could not activate the new firmware", err);
}

void OtaPartitionSink::discard() {
    if (handle != 0)
        esp_ota_abort(handle);
    handle = 0;
    watchdogRelax.reset();
}

ControllerFileSink::~ControllerFileSink() {
    if (file)
        file.close();
}

std::string ControllerFileSink::open(size_t total) {
    discard();
    NimBLEClient *client = controller->getClientController()->getClient();
    if (client == nullptr || !client->isConnected())
        return "The controller is not connected";
    const size_t used = LittleFS.usedBytes();
    const size_t freeBytes = LittleFS.totalBytes() > used ? LittleFS.totalBytes() - used : 0;
    if (total + STORAGE_MARGIN > freeBytes)
        return "Not enough free storage for the controller firmware";
    watchdogRelax.reset(new OtaWatchdogRelax());
    file = LittleFS.open(CONTROLLER_FIRMWARE_PATH, FILE_WRITE, true);
    if (!file) {
        watchdogRelax.reset();
        return "Could not store the controller firmware";
    }
    return "";
}

std::string ControllerFileSink::write(const uint8_t *data, size_t len) {
    return file.write(data, len) == len ? "" : "Could not store the controller firmware";
}

std::string ControllerFileSink::commit() {
    file.close();
    watchdogRelax.reset();
    return "";
}

void ControllerFileSink::discard() {
    if (file)
        file.close();
    LittleFS.remove(CONTROLLER_FIRMWARE_PATH);
    watchdogRelax.reset();
}
