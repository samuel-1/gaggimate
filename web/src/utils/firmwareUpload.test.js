// Unit tests for the firmware upload helpers: `npm test` (node --test, no extra dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUploadReply, uploadFirmware, uploadPath } from './firmwareUpload.js';

test('uploadPath names the target and adds force only when asked', () => {
  assert.equal(uploadPath('display', false), '/api/ota/upload?target=display');
  assert.equal(uploadPath('controller', true), '/api/ota/upload?target=controller&force=1');
  assert.throws(() => uploadPath('filesystem', false), /Unknown upload target/);
});

test('parseUploadReply: display accepted, the device restarts', () => {
  assert.deepEqual(parseUploadReply(200, '{"result":"restarting"}'), {
    ok: true,
    next: 'restarting',
    error: null,
  });
});

test('parseUploadReply: controller accepted, flashing over BLE follows', () => {
  assert.deepEqual(parseUploadReply(202, '{"result":"flashing-controller"}'), {
    ok: true,
    next: 'flashing-controller',
    error: null,
  });
});

test('parseUploadReply: refusals carry the device message', () => {
  assert.deepEqual(parseUploadReply(400, '{"error":"This firmware is for \'controller\'"}'), {
    ok: false,
    next: null,
    error: "This firmware is for 'controller'",
  });
  assert.equal(
    parseUploadReply(409, '{"error":"Another firmware upload is in progress"}').error,
    'Another firmware upload is in progress',
  );
});

test('parseUploadReply survives non-JSON bodies', () => {
  assert.deepEqual(parseUploadReply(502, '<html>Bad gateway</html>'), {
    ok: false,
    next: null,
    error: 'HTTP 502',
  });
  assert.equal(parseUploadReply(200, '').next, 'restarting'); // success is known from the status
  assert.equal(parseUploadReply(202, 'null').next, 'flashing-controller');
});

test('parseUploadReply: no status means the connection failed', () => {
  assert.equal(parseUploadReply(0, '').error, null);
});

// Minimal XMLHttpRequest stand-in: records the request and lets the test drive the outcome.
class FakeXhr {
  static last;
  constructor() {
    this.headers = {};
    this.upload = {};
    FakeXhr.last = this;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  send(body) {
    this.body = body;
  }
  progress(loaded, total, lengthComputable = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable });
  }
  respond(status, text) {
    this.status = status;
    this.responseText = text;
    this.onload();
  }
}

test('uploadFirmware posts the file as an octet stream and reports progress', async () => {
  const file = { name: 'firmware.bin', size: 1000 };
  const progress = [];
  const done = uploadFirmware({
    file,
    target: 'display',
    onProgress: p => progress.push(p),
    Xhr: FakeXhr,
  });
  const xhr = FakeXhr.last;
  assert.equal(xhr.method, 'POST');
  assert.equal(xhr.url, '/api/ota/upload?target=display');
  assert.equal(xhr.headers['Content-Type'], 'application/octet-stream');
  assert.equal(xhr.body, file); // the raw file, not form data: the device streams it straight to flash

  xhr.progress(0, 1000);
  xhr.progress(333, 1000);
  xhr.progress(500, 0, false); // unknown total: ignored
  xhr.progress(1000, 1000);
  xhr.respond(200, '{"result":"restarting"}');

  assert.deepEqual(progress, [0, 33, 100]);
  assert.deepEqual(await done, { ok: true, next: 'restarting', error: null });
});

test('uploadFirmware maps the API path to the machine (app mode)', async () => {
  const done = uploadFirmware({
    file: {},
    target: 'controller',
    force: true,
    toUrl: path => `http://gaggimate.local${path}`,
    Xhr: FakeXhr,
  });
  assert.equal(FakeXhr.last.url, 'http://gaggimate.local/api/ota/upload?target=controller&force=1');
  FakeXhr.last.respond(202, '{"result":"flashing-controller"}');
  assert.equal((await done).next, 'flashing-controller');
});

test('uploadFirmware resolves (never rejects) when the connection drops or is aborted', async () => {
  const dropped = uploadFirmware({ file: {}, target: 'display', Xhr: FakeXhr });
  FakeXhr.last.onerror();
  assert.deepEqual(await dropped, { ok: false, next: null, error: null });

  const aborted = uploadFirmware({ file: {}, target: 'display', Xhr: FakeXhr });
  FakeXhr.last.onabort();
  assert.deepEqual(await aborted, { ok: false, next: null, error: null });
});

test('uploadFirmware passes refusals through', async () => {
  const done = uploadFirmware({ file: {}, target: 'display', Xhr: FakeXhr });
  FakeXhr.last.respond(400, '{"error":"Not an ESP32-S3 firmware image (.bin)"}');
  assert.deepEqual(await done, {
    ok: false,
    next: null,
    error: 'Not an ESP32-S3 firmware image (.bin)',
  });
});
