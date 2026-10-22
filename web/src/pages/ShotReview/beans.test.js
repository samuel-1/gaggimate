import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLibrary,
  fetchBeanTable,
  legacyBeanId,
  legacyBeans,
  migrateLegacyBeans,
  previousUse,
  scanRecentNotes,
} from './beans.js';

// A machine that keeps a bean table and shot notes and answers like the firmware.
function fakeMachine({ beans = [], notes = {}, refuse = null } = {}) {
  const state = { beans: beans.map(b => ({ ...b })), notes: { ...notes }, saves: 0 };
  state.request = async msg => {
    if (refuse && refuse(msg)) return { error: 'Update in progress' };
    switch (msg.tp) {
      case 'req:history:beans:list':
        return { beans: state.beans.map(b => ({ ...b })) };
      case 'req:history:beans:save': {
        state.saves++;
        const i = state.beans.findIndex(b => b.id === msg.bean.id);
        if (i >= 0) state.beans[i] = { ...msg.bean };
        else state.beans.push({ ...msg.bean });
        return { msg: 'Ok' };
      }
      case 'req:history:notes:get':
        return { notes: state.notes[msg.id] ?? null };
      case 'req:history:notes:save':
        state.notes[msg.id] = msg.notes;
        return { msg: 'Ok' };
      default:
        return { error: 'unknown' };
    }
  };
  return state;
}

const shots = ids => ids.map(id => ({ id: String(id) }));

test('fetchBeanTable rejects when the machine refuses, instead of returning an empty library', async () => {
  const machine = fakeMachine({ refuse: () => true });
  await assert.rejects(fetchBeanTable(machine), /Update in progress/);
});

test('legacyBeanId is stable per name and roaster, and only uses id characters', () => {
  const a = legacyBeanId({ name: 'Guji', roaster: 'Onyx' });
  assert.equal(a, legacyBeanId({ name: '  guji ', roaster: 'ONYX' }));
  assert.notEqual(a, legacyBeanId({ name: 'Guji', roaster: 'Other' }));
  assert.match(a, /^[a-z0-9-]{1,32}$/);
});

test('scanRecentNotes leaves out notes it could not read, so they are tried again', async () => {
  const cache = new Map();
  const machine = fakeMachine({ notes: { 2: { beanType: 'A' } } });
  machine.request = async msg => {
    if (msg.id === '1') throw new Error('timeout');
    return { notes: { beanType: 'A' } };
  };
  await scanRecentNotes(shots([2, 1]), cache, machine);
  assert.deepEqual([...cache.keys()], ['2']);
});

test('legacy beans are moved into the library once, and their notes get the beanId', async () => {
  const notes = {
    3: { id: '3', beanType: 'Guji', roaster: 'Onyx', grindSetting: '12' },
    2: { id: '2', beanType: 'guji', roaster: 'onyx' },
    1: { id: '1', beanType: 'Kenya', roaster: '' },
  };
  const machine = fakeMachine({ notes });
  const cache = new Map(Object.entries(notes));
  const list = shots([3, 2, 1]);

  assert.equal(legacyBeans(list, cache).length, 2);
  assert.equal(await migrateLegacyBeans(machine, [], list, cache), true);
  assert.equal(machine.beans.length, 2);
  const guji = machine.beans.find(b => b.name === 'Guji');
  assert.equal(guji.id, legacyBeanId(guji));
  assert.equal(machine.notes[3].beanId, guji.id);
  assert.equal(machine.notes[2].beanId, guji.id);
  assert.equal(machine.notes[3].grindSetting, '12'); // the rest of the notes is kept
  assert.equal(cache.get('2').beanId, guji.id);

  // Nothing left to move: a bean deleted from the library afterwards doesn't come back.
  assert.equal(legacyBeans(list, cache).length, 0);
  machine.beans = machine.beans.filter(b => b.id !== guji.id);
  assert.equal(await migrateLegacyBeans(machine, machine.beans, list, cache), false);
  assert.equal(machine.beans.length, 1);
});

test('two pages migrating at once write one bean', async () => {
  const notes = { 1: { id: '1', beanType: 'Guji', roaster: 'Onyx' } };
  const machine = fakeMachine({ notes });
  await Promise.all([
    migrateLegacyBeans(machine, [], shots([1]), new Map(Object.entries(notes))),
    migrateLegacyBeans(machine, [], shots([1]), new Map(Object.entries(notes))),
  ]);
  assert.equal(machine.beans.length, 1);
});

test('a legacy bean the library already has is linked, not added again', async () => {
  const notes = { 1: { id: '1', beanType: 'Guji', roaster: 'Onyx' } };
  const machine = fakeMachine({ beans: [{ id: 'b-1', name: 'GUJI', roaster: 'onyx' }], notes });
  await migrateLegacyBeans(machine, machine.beans, shots([1]), new Map(Object.entries(notes)));
  assert.equal(machine.beans.length, 1);
  assert.equal(machine.notes[1].beanId, 'b-1');
});

test('a bean the machine refuses stays for next time; the others still move', async () => {
  const long = 'x'.repeat(100);
  const notes = { 2: { id: '2', beanType: long }, 1: { id: '1', beanType: 'Kenya' } };
  const machine = fakeMachine({ notes, refuse: m => m.bean?.name === long });
  const cache = new Map(Object.entries(notes));
  await migrateLegacyBeans(machine, [], shots([2, 1]), cache);
  assert.deepEqual(
    machine.beans.map(b => b.name),
    ['Kenya'],
  );
  assert.equal(legacyBeans(shots([2, 1]), cache).length, 1);
});

test('buildLibrary orders by latest use, new beans first, archived last, and matches notes by id', () => {
  const table = [
    { id: 'old', name: 'Old' },
    { id: 'used', name: 'Used' },
    { id: 'arch', name: 'Archived', archived: true },
    { id: 'new1', name: 'New 1' },
    { id: 'new2', name: 'New 2' },
    { id: 'twin', name: 'Used' }, // same name and roaster as "used", another bag
  ];
  const cache = new Map([
    ['5', { beanId: 'used', beanType: 'Used', grindSetting: '10' }],
    ['4', { beanId: 'arch', beanType: 'Archived' }],
    ['3', { beanId: 'old', beanType: 'Renamed since' }],
    ['2', { beanId: 'twin', beanType: 'Used', grindSetting: '8' }],
    ['1', { beanType: 'Used', grindSetting: '7' }], // before the library: matched by name
  ]);
  const library = buildLibrary(table, shots([5, 4, 3, 2, 1]), cache);
  assert.deepEqual(
    library.map(b => b.id),
    ['new2', 'new1', 'used', 'old', 'twin', 'arch'],
  );
  const used = library.find(b => b.id === 'used');
  assert.deepEqual(
    used.uses.map(u => u.shotId),
    ['5', '1'],
  );
  assert.equal(previousUse(used, '5').grind, '7');
  assert.equal(library.find(b => b.id === 'twin').uses[0].grind, '8');
});
