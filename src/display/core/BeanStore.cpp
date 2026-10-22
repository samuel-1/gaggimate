#include "BeanStore.h"

#include <cstring>

namespace bean_store {

namespace {

bool isIdChar(char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
}

bool validId(const char *id) {
    if (id == nullptr)
        return false;
    const size_t len = strlen(id);
    if (len == 0 || len > MAX_ID)
        return false;
    for (size_t i = 0; i < len; i++)
        if (!isIdChar(id[i]))
            return false;
    return true;
}

// An optional text field: absent, null or a string of at most `max` bytes.
bool validText(JsonVariantConst v, size_t max) {
    if (v.isNull())
        return true;
    const char *s = v.as<const char *>();
    return v.is<const char *>() && strlen(s) <= max;
}

// "" or YYYY-MM-DD.
bool validDate(JsonVariantConst v) {
    if (v.isNull())
        return true;
    if (!v.is<const char *>())
        return false;
    const char *s = v.as<const char *>();
    const size_t len = strlen(s);
    if (len == 0)
        return true;
    if (len != 10 || s[4] != '-' || s[7] != '-')
        return false;
    for (size_t i = 0; i < len; i++)
        if (i != 4 && i != 7 && (s[i] < '0' || s[i] > '9'))
            return false;
    return true;
}

bool hasName(JsonVariantConst v) {
    if (!v.is<const char *>())
        return false;
    for (const char *s = v.as<const char *>(); *s; s++)
        if (*s != ' ' && *s != '\t')
            return true;
    return false;
}

void copyText(JsonObject to, JsonVariantConst from, const char *key) {
    const char *s = from[key].as<const char *>();
    to[key] = s != nullptr ? s : "";
}

} // namespace

void normalize(JsonDocument &store) {
    if (!store.is<JsonObject>())
        store.to<JsonObject>();
    if (!store["beans"].is<JsonArray>())
        store["beans"].to<JsonArray>();
}

const char *upsert(JsonDocument &store, JsonVariantConst bean) {
    if (!bean.is<JsonObjectConst>())
        return "Not a bean";
    const char *id = bean["id"].as<const char *>();
    if (!validId(id))
        return "Invalid bean id";
    if (!hasName(bean["name"]) || !validText(bean["name"], MAX_TEXT))
        return "The bean needs a name";
    if (!validText(bean["roaster"], MAX_TEXT) || !validText(bean["roastLevel"], MAX_TEXT))
        return "Bean details too long";
    if (!validDate(bean["roastDate"]))
        return "Invalid roast date";

    normalize(store);
    JsonArray beans = store["beans"].as<JsonArray>();
    JsonObject target;
    for (JsonObject b : beans) {
        const char *bid = b["id"].as<const char *>();
        if (bid != nullptr && strcmp(bid, id) == 0) {
            target = b;
            break;
        }
    }
    if (target.isNull()) {
        if (beans.size() >= MAX_BEANS)
            return "The bean library is full";
        target = beans.add<JsonObject>();
    } else {
        target.clear();
    }
    target["id"] = id;
    copyText(target, bean, "name");
    copyText(target, bean, "roaster");
    copyText(target, bean, "roastDate");
    copyText(target, bean, "roastLevel");
    target["archived"] = bean["archived"].as<bool>();
    return nullptr;
}

bool remove(JsonDocument &store, const char *id) {
    normalize(store);
    JsonArray beans = store["beans"].as<JsonArray>();
    for (size_t i = 0; i < beans.size(); i++) {
        const char *bid = beans[i]["id"].as<const char *>();
        if (id != nullptr && bid != nullptr && strcmp(bid, id) == 0) {
            beans.remove(i);
            return true;
        }
    }
    return false;
}

} // namespace bean_store
