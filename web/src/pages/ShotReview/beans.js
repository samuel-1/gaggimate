import { beanFromNotes, beanKey } from '../../utils/shotNotes.js';
import { fetchNotes } from './shotData.js';

// Beans live in the shot notes (beanType, roaster, roastDate, roastLevel), so there is no
// bean store of its own: the list is gathered from the notes of recent shots on the machine.

const SCAN_LIMIT = 50;

// Beans from the newest `SCAN_LIMIT` shots, most recently used first. A bean's details come
// from the newest shot that used it; `uses` lists every scanned shot with that bean, newest
// first. `shots` is newest first.
export async function loadRecentBeans(shots, notesCache, apiService, signal) {
  const beans = new Map();
  for (const shot of shots.slice(0, SCAN_LIMIT)) {
    if (signal?.aborted) break;
    let notes = notesCache.get(shot.id);
    if (!notes) {
      // Over the websocket rather than /api/history/<id>.json: the firmware only renames
      // legacy unpadded notes files when they are read this way.
      try {
        notes = await fetchNotes(apiService, shot.id);
      } catch {
        notes = {};
      }
      if (signal?.aborted) break;
      notesCache.set(shot.id, notes);
    }
    const bean = beanFromNotes(notes);
    if (!bean) continue;
    const key = beanKey(bean);
    if (!beans.has(key)) beans.set(key, { ...bean, key, uses: [] });
    beans.get(key).uses.push({
      shotId: shot.id,
      grind: notes.grindSetting || '',
      dose: notes.doseIn || '',
    });
  }
  return [...beans.values()];
}

// The bean's latest use before `shotId` (or its latest use at all without one). A bean just
// entered in the picker has no `uses` yet.
export function previousUse(bean, shotId) {
  const uses = bean?.uses;
  if (!uses?.length) return null;
  if (shotId == null) return uses[0];
  return uses.find(u => Number(u.shotId) < Number(shotId)) || null;
}
