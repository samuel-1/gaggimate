import { beanFromNotes, beanKey, beanOnly } from '../../utils/beanNotes.js';
import { fetchNotes, saveNotes } from './shotData.js';

// The bean library is a table on the machine (req:history:beans:*, display/core/BeanStore.h). A shot's
// notes refer to their bean by beanId and keep a copy of its fields (beanType, roaster, roastDate,
// roastLevel) from when the shot was reviewed, which is what Shot History and the exports read.
// No UI or translations in here so it is unit tested with `npm test` (beans.test.js).

const SCAN_LIMIT = 50;

// The shots whose notes the page reads for the library (`shots` is newest first).
const recentShots = shots => shots.slice(0, SCAN_LIMIT);

// A new bean's id: unique enough for one machine, short, and only [a-z0-9-] (the firmware checks).
export function newBeanId() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// The id a bean from notes older than the library gets: the same for the same name and roaster, so
// two pages migrating at once write one bean, not two.
export function legacyBeanId(bean) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const ch of beanKey(bean)) {
    const c = ch.codePointAt(0);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x5bd1e995) >>> 0;
  }
  return `l-${h1.toString(36)}${h2.toString(36)}`;
}

async function beanRequest(apiService, message) {
  const response = await apiService.request(message);
  if (response?.error) throw new Error(response.error);
  return response;
}

// Rejects when the machine refuses (e.g. during an update), so an unreadable library never looks empty.
export async function fetchBeanTable(apiService) {
  const response = await beanRequest(apiService, { tp: 'req:history:beans:list' });
  return Array.isArray(response?.beans) ? response.beans : [];
}

// Adds or replaces `bean` (with its id) in the table on the machine.
export function saveBean(apiService, bean) {
  return beanRequest(apiService, {
    tp: 'req:history:beans:save',
    bean: { id: bean.id, ...beanOnly(bean), archived: !!bean.archived },
  });
}

export function deleteBean(apiService, id) {
  return beanRequest(apiService, { tp: 'req:history:beans:delete', id });
}

// Reads the notes of the recent shots into `notesCache`. Notes that can't be read are left out (and
// tried again next time) rather than cached as empty.
export async function scanRecentNotes(shots, notesCache, apiService, signal) {
  for (const shot of recentShots(shots)) {
    if (signal?.aborted) return;
    if (notesCache.has(shot.id)) continue;
    // Over the websocket rather than /api/history/<id>.json: the firmware only renames legacy
    // unpadded notes files when they are read this way.
    let notes;
    try {
      notes = await fetchNotes(apiService, shot.id);
    } catch {
      continue;
    }
    if (signal?.aborted) return;
    notesCache.set(shot.id, notes);
  }
}

// The beans named in notes from before the library existed (no beanId), each with the shots naming
// it: [{ bean, shotIds }].
export function legacyBeans(shots, notesCache) {
  const found = new Map();
  for (const shot of recentShots(shots)) {
    const notes = notesCache.get(shot.id);
    const bean = beanFromNotes(notes);
    if (!bean || notes.beanId) continue;
    const key = beanKey(bean);
    if (!found.has(key)) found.set(key, { bean, shotIds: [] });
    found.get(key).shotIds.push(shot.id);
  }
  return [...found.values()];
}

// Takes the beans of notes from before the library into it: a bean the table doesn't have yet is added
// (under legacyBeanId), and the notes get its beanId, so each is taken over once. A bean that fails
// stays for next time; the others go ahead. Resolves with whether anything changed.
export async function migrateLegacyBeans(apiService, table, shots, notesCache, signal) {
  let changed = false;
  for (const { bean, shotIds } of legacyBeans(shots, notesCache)) {
    if (signal?.aborted) break;
    try {
      const known = table.find(b => beanKey(b) === beanKey(bean));
      const id = known?.id ?? legacyBeanId(bean);
      if (!known) await saveBean(apiService, { ...bean, id });
      changed = true;
      for (const shotId of shotIds) {
        const notes = { ...notesCache.get(shotId), beanId: id };
        await saveNotes(apiService, shotId, notes);
        notesCache.set(shotId, notes);
      }
    } catch (e) {
      console.warn(`Could not move "${bean.name}" into the bean library`, e);
    }
  }
  return changed;
}

// The library as the picker shows it: the table's beans, each with `key` and `uses` (the recent shots
// with it, newest first; matched by beanId, or by name and roaster for notes from before the library).
// Most recently used first, beans not used yet (new ones, newest first) before them, archived ones last.
export function buildLibrary(table, shots, notesCache) {
  const byId = new Map(table.map(b => [b.id, { ...b, key: beanKey(b), uses: [] }]));
  const byKey = new Map();
  for (const b of byId.values()) if (!byKey.has(b.key)) byKey.set(b.key, b);
  for (const shot of recentShots(shots)) {
    const notes = notesCache.get(shot.id);
    const ref = beanFromNotes(notes);
    if (!ref) continue;
    const bean = ref.id ? byId.get(ref.id) : byKey.get(beanKey(ref));
    bean?.uses.push({ shotId: shot.id, grind: notes.grindSetting || '', dose: notes.doseIn || '' });
  }
  const rank = b =>
    (b.archived ? 0 : 2 ** 52) + (b.uses.length ? Number(b.uses[0].shotId) : 2 ** 51);
  // Stable sort over the table reversed (it appends new beans): ties stay newest first.
  return [...byId.values()].reverse().sort((a, b) => rank(b) - rank(a));
}

// The bean's latest use before `shotId` (or its latest use at all without one).
export function previousUse(bean, shotId) {
  const uses = bean?.uses;
  if (!uses?.length) return null;
  if (shotId == null) return uses[0];
  return uses.find(u => Number(u.shotId) < Number(shotId)) || null;
}
