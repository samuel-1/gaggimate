/* global globalThis */

// Per-browser UI preferences (fold state, last used options). Values are stored as JSON;
// storage can be missing or throw (private mode, blocked site data), so reads fall back
// and writes are best effort.

export function readPref(key, fallback) {
  try {
    const raw = globalThis.window?.localStorage?.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) ?? fallback);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    globalThis.window?.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // the preference just won't stick
  }
}
