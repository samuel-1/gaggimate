#include "main.h"
#include "ControllerConfig.h"
#include "GaggiMateController.h"

GaggiMateController controller(BUILD_GIT_VERSION);

// Lets the display's firmware upload recognise images built for the controller (see firmware_id.h).
static const char *const firmwareId = FIRMWARE_ID(BUILD_ENV);

void setup() {
    Serial.begin(115200);
    FIRMWARE_ID_KEEP(firmwareId);
    ESP_LOGI("main", "Firmware %s %s", BUILD_GIT_VERSION, firmwareId);
    controller.setup();
}

void loop() { controller.loop(); }
