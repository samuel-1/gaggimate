// Host shim for esp_ota_ops.h: the simulator has no flash. Writes are accepted and dropped, so the web UI
// firmware upload can be exercised end to end (a "successful" display upload restarts, i.e. exits, the sim).
#pragma once

#include "esp_err.h"
#include "esp_partition.h"
#include <stddef.h>
#include <stdint.h>

typedef uint32_t esp_ota_handle_t;

#define OTA_SIZE_UNKNOWN 0xffffffff
#define OTA_WITH_SEQUENTIAL_WRITES 0xfffffffe

static inline const esp_partition_t *esp_ota_get_next_update_partition(const esp_partition_t *start_from) {
    (void)start_from;
    static const esp_partition_t ota1 = {ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_ANY, 0x650000, 0x640000, "app1",
                                         false};
    return &ota1;
}
static inline esp_err_t esp_ota_begin(const esp_partition_t *partition, size_t image_size, esp_ota_handle_t *out_handle) {
    (void)partition;
    (void)image_size;
    *out_handle = 1;
    return ESP_OK;
}
static inline esp_err_t esp_ota_write(esp_ota_handle_t handle, const void *data, size_t size) {
    (void)handle;
    (void)data;
    (void)size;
    return ESP_OK;
}
static inline esp_err_t esp_ota_end(esp_ota_handle_t handle) {
    (void)handle;
    return ESP_OK;
}
static inline esp_err_t esp_ota_abort(esp_ota_handle_t handle) {
    (void)handle;
    return ESP_OK;
}
static inline esp_err_t esp_ota_set_boot_partition(const esp_partition_t *partition) {
    (void)partition;
    return ESP_OK;
}
