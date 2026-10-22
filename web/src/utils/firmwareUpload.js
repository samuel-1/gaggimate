/* global globalThis */
// Uploads a firmware image to the machine (POST /api/ota/upload, see WebUIPlugin on the device).
// No UI or translations in here so it is unit tested with `npm test` (firmwareUpload.test.js).

export const UPLOAD_TARGETS = ['display', 'controller'];

// Query string the device expects; `force` lets an image without a GaggiMate firmware id through.
export function uploadPath(target, force) {
  if (!UPLOAD_TARGETS.includes(target)) throw new Error(`Unknown upload target: ${target}`);
  return `/api/ota/upload?target=${target}${force ? '&force=1' : ''}`;
}

// What the device answered: { ok, next: 'restarting' | 'flashing-controller' | null, error }.
export function parseUploadReply(status, bodyText) {
  let body = {};
  try {
    body = JSON.parse(bodyText || '{}') || {};
  } catch {
    // e.g. an HTML error page from something in between
  }
  if (status === 200 || status === 202) {
    return {
      ok: true,
      next: body.result || (status === 200 ? 'restarting' : 'flashing-controller'),
      error: null,
    };
  }
  return { ok: false, next: null, error: body.error || (status ? `HTTP ${status}` : null) };
}

// Sends `file` and resolves with parseUploadReply()'s result; `error` is null when the connection itself failed.
// onProgress(0..100) reports the upload. XHR rather than fetch: only XHR reports upload progress, but it also
// bypasses the app's fetch rewrite, so `toUrl` maps the API path to the machine (machineApiUrl in the app).
export function uploadFirmware({
  file,
  target,
  force = false,
  toUrl = path => path,
  onProgress,
  Xhr = globalThis.XMLHttpRequest,
}) {
  return new Promise(resolve => {
    const xhr = new Xhr();
    xhr.open('POST', toUrl(uploadPath(target, force)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable && e.total > 0)
          onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
    }
    xhr.onload = () => resolve(parseUploadReply(xhr.status, xhr.responseText));
    xhr.onerror = () => resolve({ ok: false, next: null, error: null });
    xhr.onabort = () => resolve({ ok: false, next: null, error: null });
    xhr.send(file);
  });
}
