import { useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMinus } from '@fortawesome/free-solid-svg-icons/faMinus';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders';
import { Trans, useLingui } from '@lingui/react/macro';
import { readPref, writePref } from '../../utils/localPrefs.js';

const RANGE_KEY = 'gaggimate.review.grindRange';
const DEFAULT_RANGE = { min: 0, max: 30, step: 0.1 };

function loadRange() {
  const r = readPref(RANGE_KEY, null);
  return r && r.max > r.min && r.step > 0 ? r : DEFAULT_RANGE;
}

const decimals = step => (String(step).split('.')[1] || '').length;

// Grind setting as a slider with fine-step buttons. The value stays a string in the
// shot notes (grindSetting), so older free-text entries still display.
export function GrindSlider({ value, onChange }) {
  const { t } = useLingui();
  const [range, setRange] = useState(loadRange);
  const [showRange, setShowRange] = useState(false);
  const numeric = value !== '' && value != null && Number.isFinite(Number(value));
  const v = numeric ? Number(value) : null;
  const d = decimals(range.step);

  const set = next => {
    const clamped = Math.max(range.min, Math.min(range.max, Number(next)));
    onChange(clamped.toFixed(d));
  };
  const nudge = dir => set((v ?? (range.min + range.max) / 2) + dir * range.step);

  const updateRange = (key, raw) => {
    const next = { ...range, [key]: Number(raw) };
    if (!(next.max > next.min) || !(next.step > 0)) return;
    setRange(next);
    writePref(RANGE_KEY, next);
  };

  return (
    <div>
      <div className='flex items-center gap-2'>
        <span className='text-sm font-medium'>
          <Trans>Grind Setting</Trans>
        </span>
        <button
          type='button'
          className='btn btn-ghost btn-xs btn-circle'
          onClick={() => setShowRange(s => !s)}
          aria-expanded={showRange}
          aria-label={t`Slider range`}
        >
          <FontAwesomeIcon icon={faSliders} />
        </button>
        <span className='ml-auto text-xl font-semibold tabular-nums'>
          {numeric ? v.toFixed(d) : value || '—'}
        </span>
      </div>
      <div className='mt-1 flex items-center gap-2'>
        <button
          type='button'
          className='btn btn-sm btn-circle btn-ghost bg-base-200'
          onClick={() => nudge(-1)}
          aria-label={t`Finer`}
        >
          <FontAwesomeIcon icon={faMinus} />
        </button>
        <input
          type='range'
          className={`range range-sm range-accent grow ${numeric ? '' : 'opacity-50'}`}
          min={range.min}
          max={range.max}
          step={range.step}
          value={v ?? (range.min + range.max) / 2}
          onInput={e => set(e.target.value)}
          aria-label={t`Grind Setting`}
        />
        <button
          type='button'
          className='btn btn-sm btn-circle btn-ghost bg-base-200'
          onClick={() => nudge(1)}
          aria-label={t`Coarser`}
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>
      <div className='text-base-content/60 flex justify-between px-10 text-xs'>
        <span>
          <Trans>Fine</Trans> {range.min}
        </span>
        <span>
          {range.max} <Trans>Coarse</Trans>
        </span>
      </div>
      {showRange && (
        <div className='mt-2 grid grid-cols-3 gap-2'>
          {[
            ['min', t`Finest`],
            ['max', t`Coarsest`],
            ['step', t`Step`],
          ].map(([key, label]) => (
            <label key={key} className='form-control'>
              <span className='text-base-content/60 text-xs'>{label}</span>
              <input
                type='number'
                inputMode='decimal'
                className='input input-bordered input-sm w-full text-center text-base'
                defaultValue={range[key]}
                onChange={e => updateRange(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
