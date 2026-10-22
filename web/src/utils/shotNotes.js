import { msg } from '@lingui/core/macro';

// Helpers for the per-shot notes (schema/shot_notes.json) shared by the Shot Review page,
// the share card and the Visualizer upload.

// Half stars (0-10) from saved notes. Older notes only have whole stars in `rating`, and
// Shot History / Shot Analyzer edit `rating` without touching `ratingHalf`, so a half-star
// value only counts while it still rounds up to the stored whole stars.
export function halfStarsOf(notes) {
  const whole = Number(notes?.rating) || 0;
  const half = Number(notes?.ratingHalf);
  return Number.isFinite(half) && half > 0 && Math.ceil(half / 2) === whole ? half : whole * 2;
}

// Roast levels as stored in `roastLevel` (the schema enum lists the same ids): swatch
// color, translatable label, and the English name sent to Visualizer.
export const ROAST_LEVELS = [
  {
    id: 'light',
    color: '#D9B98C',
    name: 'Light',
    label: msg({ message: 'Light', context: 'roast level' }),
  },
  {
    id: 'medium-light',
    color: '#BC8A57',
    name: 'Medium-light',
    label: msg({ message: 'Medium-light', context: 'roast level' }),
  },
  {
    id: 'medium',
    color: '#94623A',
    name: 'Medium',
    label: msg({ message: 'Medium', context: 'roast level' }),
  },
  {
    id: 'medium-dark',
    color: '#6B4026',
    name: 'Medium-dark',
    label: msg({ message: 'Medium-dark', context: 'roast level' }),
  },
  {
    id: 'dark',
    color: '#3E2416',
    name: 'Dark',
    label: msg({ message: 'Dark', context: 'roast level' }),
  },
];

export const roastLevel = id => ROAST_LEVELS.find(level => level.id === id) || null;

export const roastColor = id => roastLevel(id)?.color || '#8A5A3C';

export function beanAgeDays(roastDate) {
  if (!roastDate) return null;
  const days = Math.floor((Date.now() - new Date(roastDate).getTime()) / 86400000);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

// A bean as the UI handles it. In the notes it is spread over beanType (the name), roaster,
// roastDate and roastLevel.
export const EMPTY_BEAN = { name: '', roaster: '', roastDate: '', roastLevel: '' };

// Just the bean fields of `bean` (bean list entries also carry usage data).
export function beanOnly(bean) {
  return Object.fromEntries(Object.keys(EMPTY_BEAN).map(key => [key, bean?.[key] || '']));
}

export function beanFromNotes(notes) {
  const name = notes?.beanType?.trim();
  if (!name) return null;
  return {
    name,
    roaster: notes.roaster || '',
    roastDate: notes.roastDate || '',
    roastLevel: notes.roastLevel || '',
  };
}

export function beanToNotes(bean) {
  return {
    beanType: bean.name,
    roaster: bean.roaster || '',
    roastDate: bean.roastDate || '',
    roastLevel: bean.roastLevel || '',
  };
}

// Two shots used the same bean when name and roaster match (case and spacing ignored).
export function beanKey(bean) {
  const norm = s =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return `${norm(bean?.roaster)}|${norm(bean?.name)}`;
}
