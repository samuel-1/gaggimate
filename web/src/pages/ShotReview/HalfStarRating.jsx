import { useId } from 'preact/hooks';
import { useLingui } from '@lingui/react/macro';

const SIZES = { xs: 'rating-xs', sm: 'rating-sm', md: 'rating-md', lg: 'rating-lg' };

// DaisyUI half-star rating. `value` counts half stars: 0-10 (9 = 4.5 stars).
export function HalfStarRating({ value = 0, onChange, readOnly = false, size = 'md' }) {
  const { t } = useLingui();
  const group = useId();
  const current = Math.max(0, Math.min(10, Math.round(value || 0)));
  const stars = current / 2;

  return (
    <div
      className={`rating rating-half ${SIZES[size] || SIZES.md}`}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? t`${stars} of 5 stars` : t`Rating`}
    >
      {!readOnly && (
        <input
          type='radio'
          name={group}
          className='rating-hidden'
          checked={current === 0}
          onChange={() => onChange?.(0)}
          aria-label={t`No rating`}
        />
      )}
      {Array.from({ length: 10 }, (_, i) => {
        const v = i + 1;
        const cls = `mask mask-star-2 ${v % 2 ? 'mask-half-1' : 'mask-half-2'} bg-[var(--review-star,#f59e0b)]`;
        if (readOnly) {
          return <div key={v} className={cls} aria-current={v === current ? 'true' : undefined} />;
        }
        const label = v / 2;
        return (
          <input
            key={v}
            type='radio'
            name={group}
            className={cls}
            checked={v === current}
            onChange={() => onChange?.(v)}
            aria-label={t`${label} stars`}
          />
        );
      })}
    </div>
  );
}
