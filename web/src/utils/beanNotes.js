export function beanAgeDays(roastDate) {
  if (!roastDate) return null;
  const days = Math.floor((Date.now() - new Date(roastDate).getTime()) / 86400000);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

// A bean as the UI handles it; the bean library on the machine adds `id` and `archived`. A shot's
// notes refer to it by beanId and keep a copy of it in beanType (the name), roaster, roastDate and
// roastLevel, the fields everything else reads.
export const EMPTY_BEAN = { name: '', roaster: '', roastDate: '', roastLevel: '' };

// Just the bean fields of `bean` (bean list entries also carry usage data).
export function beanOnly(bean) {
  return Object.fromEntries(Object.keys(EMPTY_BEAN).map(key => [key, bean?.[key] || '']));
}

export function beanFromNotes(notes) {
  const name = notes?.beanType?.trim();
  if (!name) return null;
  return {
    id: notes.beanId || '',
    name,
    roaster: notes.roaster || '',
    roastDate: notes.roastDate || '',
    roastLevel: notes.roastLevel || '',
  };
}

export function beanToNotes(bean) {
  return {
    beanId: bean.id || '',
    beanType: bean.name,
    roaster: bean.roaster || '',
    roastDate: bean.roastDate || '',
    roastLevel: bean.roastLevel || '',
  };
}

// Two shots used the same bean when name and roaster match (case and spacing ignored); for notes from
// before the bean library, which have no beanId.
export function beanKey(bean) {
  const norm = s =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return `${norm(bean?.roaster)}|${norm(bean?.name)}`;
}

// Is the library bean `bean` the one a shot's bean `ref` (see beanFromNotes) means? By id when the
// notes have one, else by name and roaster.
export function sameBean(bean, ref) {
  if (!bean || !ref) return false;
  return ref.id ? bean.id === ref.id : beanKey(bean) === beanKey(ref);
}
