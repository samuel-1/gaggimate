// Unit tests: the bean library table (BeanStore).
// Host-side, no ESP32/Arduino runtime — pio test -e native -f test_bean_store.

#include <unity.h>

#include <string>

#include "display/core/BeanStore.cpp"

static JsonDocument parse(const char *json) {
    JsonDocument doc;
    deserializeJson(doc, json);
    return doc;
}

static std::string dump(const JsonDocument &doc) {
    std::string out;
    serializeJson(doc, out);
    return out;
}

static const char *upsertJson(JsonDocument &store, const char *beanJson) {
    JsonDocument bean = parse(beanJson);
    return bean_store::upsert(store, bean.as<JsonVariantConst>());
}

void test_normalize_makes_an_empty_table_from_anything() {
    for (const char *json : {"", "null", "[]", "{\"beans\":5}", "{\"other\":1}"}) {
        JsonDocument store = parse(json);
        bean_store::normalize(store);
        TEST_ASSERT_TRUE_MESSAGE(store["beans"].is<JsonArray>(), json);
        TEST_ASSERT_EQUAL_MESSAGE(0, store["beans"].size(), json);
    }
    JsonDocument kept = parse("{\"beans\":[{\"id\":\"a\",\"name\":\"A\"}]}");
    bean_store::normalize(kept);
    TEST_ASSERT_EQUAL(1, kept["beans"].size());
}

void test_new_beans_are_appended_with_known_fields_only() {
    JsonDocument store;
    TEST_ASSERT_NULL(upsertJson(store, R"({"id":"b-1","name":"Dickason","roaster":"Peet's",
        "roastDate":"2026-10-01","roastLevel":"medium-dark","price":12})"));
    TEST_ASSERT_NULL(upsertJson(store, R"({"id":"b-2","name":"Guji"})"));
    TEST_ASSERT_EQUAL_STRING(
        R"({"beans":[{"id":"b-1","name":"Dickason","roaster":"Peet's","roastDate":"2026-10-01",)"
        R"("roastLevel":"medium-dark","archived":false},{"id":"b-2","name":"Guji","roaster":"",)"
        R"("roastDate":"","roastLevel":"","archived":false}]})",
        dump(store).c_str());
}

void test_saving_an_existing_id_replaces_it_in_place() {
    JsonDocument store;
    upsertJson(store, R"({"id":"a","name":"A","roaster":"R"})");
    upsertJson(store, R"({"id":"b","name":"B"})");
    TEST_ASSERT_NULL(upsertJson(store, R"({"id":"a","name":"A2","archived":true})"));
    TEST_ASSERT_EQUAL(2, store["beans"].size());
    TEST_ASSERT_EQUAL_STRING("a", store["beans"][0]["id"]);
    TEST_ASSERT_EQUAL_STRING("A2", store["beans"][0]["name"]);
    TEST_ASSERT_EQUAL_STRING("", store["beans"][0]["roaster"]); // a save is the whole bean
    TEST_ASSERT_TRUE(store["beans"][0]["archived"].as<bool>());
    TEST_ASSERT_EQUAL_STRING("b", store["beans"][1]["id"]);
}

void test_invalid_beans_are_refused_and_change_nothing() {
    JsonDocument store;
    upsertJson(store, R"({"id":"a","name":"A"})");
    const std::string before = dump(store);
    const char *bad[] = {
        R"("just a string")",
        R"({"name":"No id"})",
        R"({"id":"","name":"Empty id"})",
        R"({"id":"has space","name":"X"})",
        R"({"id":"../beans","name":"X"})",
        R"({"id":"0123456789012345678901234567890123","name":"Id too long"})",
        R"({"id":"a"})",
        R"({"id":"a","name":"   "})",
        R"({"id":"a","name":7})",
        R"({"id":"a","name":"X","roastDate":"1.10.2026"})",
        R"({"id":"a","name":"X","roastDate":"2026-1-01"})",
        R"({"id":"a","name":"X","roaster":5})",
    };
    for (const char *json : bad) {
        TEST_ASSERT_NOT_NULL_MESSAGE(upsertJson(store, json), json);
        TEST_ASSERT_EQUAL_STRING_MESSAGE(before.c_str(), dump(store).c_str(), json);
    }
    const std::string longName(bean_store::MAX_TEXT + 1, 'x');
    JsonDocument bean;
    bean["id"] = "z";
    bean["name"] = longName;
    TEST_ASSERT_NOT_NULL(bean_store::upsert(store, bean.as<JsonVariantConst>()));
}

void test_empty_roast_date_and_null_fields_are_fine() {
    JsonDocument store;
    TEST_ASSERT_NULL(upsertJson(store, R"({"id":"a","name":"A","roastDate":"","roaster":null})"));
    TEST_ASSERT_EQUAL_STRING("", store["beans"][0]["roaster"]);
}

void test_the_library_has_a_size_limit() {
    JsonDocument store;
    for (size_t i = 0; i < bean_store::MAX_BEANS; i++) {
        JsonDocument bean;
        bean["id"] = "b" + std::to_string(i);
        bean["name"] = "Bean";
        TEST_ASSERT_NULL(bean_store::upsert(store, bean.as<JsonVariantConst>()));
    }
    TEST_ASSERT_EQUAL_STRING("The bean library is full", upsertJson(store, R"({"id":"new","name":"N"})"));
    TEST_ASSERT_NULL(upsertJson(store, R"({"id":"b7","name":"Edit still works"})"));
}

void test_remove() {
    JsonDocument store;
    upsertJson(store, R"({"id":"a","name":"A"})");
    upsertJson(store, R"({"id":"b","name":"B"})");
    TEST_ASSERT_FALSE(bean_store::remove(store, "zzz"));
    TEST_ASSERT_FALSE(bean_store::remove(store, nullptr));
    TEST_ASSERT_TRUE(bean_store::remove(store, "a"));
    TEST_ASSERT_EQUAL(1, store["beans"].size());
    TEST_ASSERT_EQUAL_STRING("b", store["beans"][0]["id"]);
    TEST_ASSERT_FALSE(bean_store::remove(store, "a"));
}

void setUp() {}
void tearDown() {}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_normalize_makes_an_empty_table_from_anything);
    RUN_TEST(test_new_beans_are_appended_with_known_fields_only);
    RUN_TEST(test_saving_an_existing_id_replaces_it_in_place);
    RUN_TEST(test_invalid_beans_are_refused_and_change_nothing);
    RUN_TEST(test_empty_roast_date_and_null_fields_are_fine);
    RUN_TEST(test_the_library_has_a_size_limit);
    RUN_TEST(test_remove);
    return UNITY_END();
}
