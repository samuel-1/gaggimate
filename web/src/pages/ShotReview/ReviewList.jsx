import { useEffect, useState } from 'preact/hooks';
import { Trans, useLingui } from '@lingui/react/macro';
import { BeanDot } from './BeanPicker.jsx';
import { HalfStarRating } from './HalfStarRating.jsx';
import { halfStarsOf } from '../../utils/shotNotes.js';
import { fetchNotes, formatShotTime } from './shotData.js';

const PAGE = 20;

// Reviewed shots at a glance. Notes are fetched one at a time (the machine serves one
// request at a time anyway) and only for the shots on screen.
export function ReviewList({ shots, currentId, onOpen, notesCache, apiService }) {
  const { t } = useLingui();
  const [count, setCount] = useState(PAGE);
  const [, bump] = useState(0);
  const visible = shots.slice(0, count);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const s of visible) {
        if (cancelled) return;
        if (notesCache.has(s.id)) continue;
        try {
          notesCache.set(s.id, await fetchNotes(apiService, s.id));
        } catch {
          notesCache.set(s.id, {});
        }
        if (!cancelled) bump(n => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [count, shots]);

  const halfOf = s =>
    notesCache.has(s.id) ? halfStarsOf(notesCache.get(s.id)) : (s.rating || 0) * 2;
  const rated = shots.map(halfOf).filter(Boolean);
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length / 2 : 0;
  const best = rated.length ? Math.max(...rated) / 2 : 0;

  return (
    <>
      <div className='mb-3 grid grid-cols-3 gap-2'>
        {[
          [shots.length, t`Shots`],
          [avg ? avg.toFixed(1) : '–', t`Average`],
          [best || '–', t`Best`],
        ].map(([v, label]) => (
          <div key={label} className='bg-base-100 rounded-box review-card px-3 py-2'>
            <div className='text-2xl font-bold tabular-nums'>{v}</div>
            <div className='text-base-content/60 text-xs'>{label}</div>
          </div>
        ))}
      </div>
      <ul className='bg-base-100 rounded-box review-card divide-base-content/10 divide-y px-3'>
        {visible.map(s => {
          const n = notesCache.get(s.id);
          const half = halfOf(s);
          const meta = [
            formatShotTime(s.timestamp),
            n?.grindSetting && `${t`Grind`} ${n.grindSetting}`,
            n?.doseIn && s.volume ? `${n.doseIn}→${s.volume.toFixed(1)} g` : '',
            s.duration ? `${Math.round(s.duration / 1000)} s` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={s.id}>
              <button
                type='button'
                className={`flex w-full items-center gap-3 py-3 text-left ${s.id === currentId ? 'text-accent' : ''}`}
                onClick={() => onOpen(s.id)}
              >
                <BeanDot level={n?.roastLevel} />
                <span className='min-w-0 grow'>
                  <span className='block truncate font-semibold'>
                    {n?.beanType || s.profile || t`Unknown Profile`}
                  </span>
                  <span className='text-base-content/60 block truncate text-xs'>{meta}</span>
                </span>
                <span className='flex shrink-0 flex-col items-end'>
                  <span className='text-lg leading-none font-bold tabular-nums'>
                    {half ? half / 2 : '–'}
                  </span>
                  <HalfStarRating value={half} readOnly size='xs' />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {count < shots.length && (
        <button
          type='button'
          className='btn btn-ghost bg-base-100 mt-3 w-full'
          onClick={() => setCount(c => c + PAGE)}
        >
          <Trans>Show more</Trans>
        </button>
      )}
    </>
  );
}
