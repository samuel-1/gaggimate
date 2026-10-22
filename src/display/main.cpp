#include "main.h"

#ifndef GAGGIMATE_HEADLESS
#include <lvgl.h>
#endif

Controller controller;

// Lets the web UI firmware upload recognise images built for this board (see firmware_id.h).
static const char *const firmwareId = FIRMWARE_ID(BUILD_ENV);

void setup() {
    Serial.begin(115200);
    FIRMWARE_ID_KEEP(firmwareId);
    ESP_LOGI("main", "Firmware %s %s", BUILD_GIT_VERSION, firmwareId);
    controller.setup();
}

void loop() {
    controller.loop();
    delay(50);
}
