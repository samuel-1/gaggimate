import { parseBinaryIndex, indexToShotList } from '../ShotHistory/parseBinaryIndex.js';
import { parseBinaryShot } from '../ShotHistory/parseBinaryShot.js';

// Same data the Shot History page reads: the binary index, one .slog per shot, and
// the shot notes over the websocket. The review page only adds fields to the notes.

export async function fetchShotList(signal) {
  const response = await fetch('/api/history/index.bin', { signal });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return indexToShotList(parseBinaryIndex(await response.arrayBuffer()));
}

export async function fetchShot(id, signal) {
  const response = await fetch(`/api/history/${String(id).padStart(6, '0')}.slog`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseBinaryShot(await response.arrayBuffer(), String(id));
}

export async function fetchNotes(apiService, id) {
  const response = await apiService.request({ tp: 'req:history:notes:get', id });
  let notes = response?.notes;
  if (typeof notes === 'string') {
    try {
      notes = JSON.parse(notes);
    } catch {
      notes = {};
    }
  }
  return notes && typeof notes === 'object' ? notes : {};
}

export function saveNotes(apiService, id, notes) {
  return apiService.request({ tp: 'req:history:notes:save', id, notes });
}

// Fields the Shot History notes editor expects; kept so both pages read the same record.
export function baseNotes(id) {
  return {
    id,
    rating: 0,
    beanType: '',
    doseIn: '',
    doseOut: '',
    ratio: '',
    grindSetting: '',
    balanceTaste: 'balanced',
    notes: '',
  };
}

export function ratioOf(doseIn, doseOut) {
  const i = parseFloat(doseIn);
  const o = parseFloat(doseOut);
  return i > 0 && o > 0 ? (o / i).toFixed(2) : '';
}

export function formatShotTime(timestamp) {
  if (!timestamp || timestamp < 10000) return '';
  return new Date(timestamp * 1000).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
