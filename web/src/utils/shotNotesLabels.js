import { useMemo } from 'preact/hooks';
import { useLingui } from '@lingui/react/macro';
import { ROAST_LEVELS } from './shotNotes.js';

// Translated labels for shot notes values. Lingui rebuilds `i18n` and `t` only when the
// locale changes, so these stay the same object between renders and are safe as hook
// dependencies.

// { [roastLevel id]: label }
export function useRoastLabels() {
  const { i18n } = useLingui();
  return useMemo(
    () => Object.fromEntries(ROAST_LEVELS.map(level => [level.id, i18n._(level.label)])),
    [i18n],
  );
}

// One word per half-star step (index = half stars, 0-10).
export function useRatingWords() {
  const { t } = useLingui();
  return useMemo(
    () => [
      t`Not rated`,
      t`Undrinkable`,
      t`Poor`,
      t`Poor`,
      t`Meh`,
      t`Okay`,
      t`Decent`,
      t`Good`,
      t`Very good`,
      t`Great`,
      t`Excellent`,
    ],
    [t],
  );
}
