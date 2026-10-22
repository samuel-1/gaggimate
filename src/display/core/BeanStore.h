#ifndef BEANSTORE_H
#define BEANSTORE_H

#include <ArduinoJson.h>

// The bean library: one table of beans on the machine ({"beans": [...]}, ShotHistoryPlugin keeps it in
// /h/beans.json). Shot notes refer to a bean by its id (beanId) and keep a copy of its fields from when the
// shot was reviewed. Only ArduinoJson, so it is unit tested on the host (test/test_bean_store).
//
// A bean: {"id": "b-lx2k9a", "name": "Dickason", "roaster": "Peet's", "roastDate": "2026-10-01",
//          "roastLevel": "medium-dark", "archived": false}. The web UI makes the ids.

namespace bean_store {

constexpr size_t MAX_BEANS = 200;
constexpr size_t MAX_ID = 32;
constexpr size_t MAX_TEXT = 80;

// Makes `store` a valid table: keeps the beans array if it has one, else starts an empty one.
void normalize(JsonDocument &store);

// Adds `bean`, or replaces the bean with its id in place. Only the known fields are kept. Returns nullptr on
// success, else why the bean was refused (the store is unchanged then).
const char *upsert(JsonDocument &store, JsonVariantConst bean);

// Removes the bean with `id`. False if there is none.
bool remove(JsonDocument &store, const char *id);

} // namespace bean_store

#endif // BEANSTORE_H
