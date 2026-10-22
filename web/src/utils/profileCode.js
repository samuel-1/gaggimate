// Compact, QR-friendly encoding of a brew profile:
//   "GM1." + base64url(deflate-raw(JSON))
// A typical profile shrinks from 1-2 KB of JSON to ~250-300 bytes, which fits a
// ~65-69 module QR code. Uses the browser's native (De)CompressionStream, so no
// extra library is bundled; returns null where unsupported.

const PREFIX = 'GM1.';
const DROP_KEYS = ['id', 'selected', 'favorite', 'image'];

function supported() {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeProfileCode(profile) {
  if (!profile || !supported()) return null;
  try {
    const settings = { ...profile };
    DROP_KEYS.forEach(k => delete settings[k]);
    const json = new TextEncoder().encode(JSON.stringify(settings));
    return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  } catch (e) {
    console.warn('Profile code encoding failed', e);
    return null;
  }
}

export function containsProfileCode(text) {
  return /GM1\.[A-Za-z0-9_-]{8,}/.test(text || '');
}

// Returns the profile JSON string, or null when the text has no code.
export async function decodeProfileCode(text) {
  const match = (text || '').match(/GM1\.([A-Za-z0-9_-]+)/);
  if (!match) return null;
  if (!supported()) throw new Error('This browser cannot decode profile codes');
  const bytes = await pipe(fromBase64Url(match[1]), new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(bytes);
}
