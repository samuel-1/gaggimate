#ifndef FIRMWARE_ID_H
#define FIRMWARE_ID_H

// Every firmware image carries one marker string "GMFW1:<env>:", where <env> is the
// PlatformIO env it was built for (BUILD_ENV from version.h, e.g. "display-headless" or
// "controller"). The web UI firmware upload (WebUIPlugin, display/core/FirmwareImage.h)
// scans an uploaded image for it and refuses one built for another board, so a controller
// image can't be flashed onto the display and the other way round. All boards are ESP32-S3,
// so the image header's chip id alone can't tell them apart.
#define FIRMWARE_ID_PREFIX "GMFW1:"
#define FIRMWARE_ID(env) FIRMWARE_ID_PREFIX env ":"

// Keeps the marker string `id` in the image whatever else references it (a log line may be compiled out at a
// lower log level): the empty asm statement takes its address, so neither the compiler nor the linker drops it.
#define FIRMWARE_ID_KEEP(id) __asm__ __volatile__("" : : "r"(id))

#endif // FIRMWARE_ID_H
