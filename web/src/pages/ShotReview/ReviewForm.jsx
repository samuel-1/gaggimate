import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Trans, useLingui } from '@lingui/react/macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight';
import { faSeedling } from '@fortawesome/free-solid-svg-icons/faSeedling';
import { faWaveSquare } from '@fortawesome/free-solid-svg-icons/faWaveSquare';
import { faStar } from '@fortawesome/free-solid-svg-icons/faStar';
import { faMinus } from '@fortawesome/free-solid-svg-icons/faMinus';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faImage } from '@fortawesome/free-solid-svg-icons/faImage';
import { Spinner } from '../../components/Spinner.jsx';
import ShareCardModal from '../../components/ShareCard/ShareCardModal.jsx';
import { BeanPicker } from './BeanPicker.jsx';
import { beanKey, beanFromNotes, beanToNotes, halfStarsOf } from '../../utils/shotNotes.js';
import { useRatingWords } from '../../utils/shotNotesLabels.js';
import { readPref, writePref } from '../../utils/localPrefs.js';
import { previousUse } from './beans.js';
import { GrindSlider } from './GrindSlider.jsx';
import { HalfStarRating } from './HalfStarRating.jsx';
import { ReviewChart } from './ReviewChart.jsx';
import {
  baseNotes,
  fetchNotes,
  fetchShot,
  formatShotTime,
  ratioOf,
  saveNotes,
} from './shotData.js';

const FOLD_KEY = 'gaggimate.review.folded';
const NOTES_MAX = 200;

// The part of the shot notes this page edits; everything else in the notes is kept as is.
const REVIEW_KEYS = [
  'beanType',
  'roaster',
  'roastDate',
  'roastLevel',
  'doseIn',
  'grindSetting',
  'ratingHalf',
  'notes',
];

function draftFrom(notes) {
  const d = {};
  for (const k of REVIEW_KEYS) d[k] = notes[k] ?? '';
  d.ratingHalf = halfStarsOf(notes);
  return d;
}

// The bean whose previous use comes closest before `shotId`: what was in the grinder last.
function lastBeanBefore(beans, shotId) {
  let best = null;
  let bestId = -1;
  for (const b of beans) {
    const use = previousUse(b, shotId);
    if (use && Number(use.shotId) > bestId) {
      best = b;
      bestId = Number(use.shotId);
    }
  }
  return best;
}

export function ReviewForm({
  entry,
  isLatest,
  newerId,
  olderId,
  onNavigate,
  onSaved,
  notesCache,
  beans,
  apiService,
}) {
  const { t } = useLingui();
  const words = useRatingWords();
  const [shot, setShot] = useState(null);
  const [saved, setSaved] = useState(null); // notes as stored on the machine
  const [draft, setDraft] = useState(null);
  const prefilled = useRef(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [folded, setFolded] = useState(() => readPref(FOLD_KEY, {}));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, n] = await Promise.all([
        fetchShot(entry.id).catch(e => {
          console.warn('Shot data unavailable', e);
          return null;
        }),
        notesCache.has(entry.id)
          ? notesCache.get(entry.id)
          : fetchNotes(apiService, entry.id).catch(() => ({})),
      ]);
      if (cancelled) return;
      notesCache.set(entry.id, n);
      setShot(s);
      setSaved(n);
      setDraft(draftFrom(n));
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  // A fresh, unreviewed latest shot starts with the bean that was used before it.
  useEffect(() => {
    if (prefilled.current || !isLatest || !beans || !saved || saved.beanType) return;
    prefilled.current = true;
    const last = lastBeanBefore(beans, entry.id);
    if (last) applyBean(last);
  }, [beans, saved]);

  // Copy the bean into this shot; grind and dose start where the bean was last used.
  function applyBean(bean) {
    setJustSaved(false);
    const last = previousUse(bean, entry.id);
    setDraft(d => {
      const next = { ...d, ...beanToNotes(bean) };
      if (!d.grindSetting && last?.grind) next.grindSetting = last.grind;
      if (!d.doseIn && last?.dose) next.doseIn = last.dose;
      return next;
    });
  }

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    const base = draftFrom(saved);
    return REVIEW_KEYS.some(k => String(draft[k] ?? '') !== String(base[k] ?? ''));
  }, [draft, saved]);

  if (!draft) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner size={8} />
      </div>
    );
  }

  const set = (key, value) => {
    setJustSaved(false);
    setDraft(d => ({ ...d, [key]: value }));
  };

  const stepDose = dir => {
    const v = parseFloat(draft.doseIn);
    set('doseIn', Math.max(0, (Number.isFinite(v) ? v : 18) + dir * 0.1).toFixed(1));
  };

  const yieldG = entry.volume ?? shot?.volume ?? null;
  const doseOut = saved?.doseOut || (yieldG ? yieldG.toFixed(1) : '');
  const ratio = ratioOf(draft.doseIn, doseOut);
  const seconds = (shot?.duration ?? entry.duration ?? 0) / 1000;
  const peak = entry.maxPressure ?? null;

  // The notes record as both pages read it.
  const merged = {
    ...baseNotes(entry.id),
    ...saved,
    ...draft,
    id: entry.id,
    ratingHalf: draft.ratingHalf,
    rating: Math.ceil(draft.ratingHalf / 2), // whole stars for the machine's shot index
    doseOut,
    ratio,
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveNotes(apiService, entry.id, merged);
      setSaved(merged);
      setJustSaved(true);
      onSaved(entry.id, merged);
    } catch (e) {
      console.error('Saving review failed', e);
      alert(t`Couldn't save the review. Check the connection to the machine and try again.`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = id => {
    const next = { ...folded, [id]: !folded[id] };
    setFolded(next);
    writePref(FOLD_KEY, next);
  };

  const selectedBean = beanFromNotes(draft);
  const currentBean = selectedBean && beans?.find(b => b.key === beanKey(selectedBean));
  const lastGrind = previousUse(currentBean, entry.id)?.grind;
  const half = Number(draft.ratingHalf) || 0;

  const beanSummary =
    [
      draft.beanType,
      draft.doseIn && `${draft.doseIn} g`,
      draft.grindSetting && `${t`Grind`} ${draft.grindSetting}`,
    ]
      .filter(Boolean)
      .join(' · ') || t`No bean selected`;
  const curveSummary = [
    seconds ? `${seconds.toFixed(1)} s` : '',
    yieldG ? `${yieldG.toFixed(1)} g` : '',
    ratio && `1:${ratio}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className='bg-base-100 rounded-box review-card mb-3 flex items-center gap-1 p-1.5'>
        <button
          type='button'
          className='btn btn-ghost btn-sm btn-square'
          disabled={!olderId}
          onClick={() => onNavigate(olderId)}
          aria-label={t`Older shot`}
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <div className='min-w-0 grow text-center'>
          <div className='truncate text-sm font-semibold'>
            {entry.profile || t`Unknown Profile`}
            {isLatest && (
              <span className='badge badge-accent badge-sm ml-2 align-middle'>
                <Trans>Latest</Trans>
              </span>
            )}
          </div>
          <div className='text-base-content/60 text-xs'>
            #{entry.id} · {formatShotTime(entry.timestamp)}
          </div>
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-sm btn-square'
          disabled={!newerId}
          onClick={() => onNavigate(newerId)}
          aria-label={t`Newer shot`}
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <ReviewSection
        id='bean'
        icon={faSeedling}
        tone='var(--review-bean)'
        title={t`Coffee`}
        summary={beanSummary}
        folded={folded.bean}
        onToggle={toggle}
      >
        <BeanPicker beans={beans} selected={selectedBean} shotId={entry.id} onSelect={applyBean} />
        <div className='mt-3 flex items-center gap-2'>
          <span className='text-base-content/70 text-sm'>
            <Trans>Dose</Trans>
          </span>
          <button
            type='button'
            className='btn btn-sm btn-circle btn-ghost bg-base-200 ml-auto'
            onClick={() => stepDose(-1)}
            aria-label={t`Less dose`}
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <span className='flex w-24 items-baseline justify-center gap-1'>
            <input
              type='number'
              step='0.1'
              inputMode='decimal'
              className='w-16 bg-transparent text-right text-2xl font-bold tabular-nums outline-none'
              value={draft.doseIn}
              placeholder='18.0'
              onInput={e => set('doseIn', e.target.value)}
              aria-label={t`Dose In (g)`}
            />
            <span className='text-base-content/60 text-sm'>g</span>
          </span>
          <button
            type='button'
            className='btn btn-sm btn-circle btn-ghost bg-base-200'
            onClick={() => stepDose(1)}
            aria-label={t`More dose`}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
        <div className='mt-3'>
          <GrindSlider value={draft.grindSetting} onChange={v => set('grindSetting', v)} />
          <p className='text-warning mt-1 h-4 text-center text-xs'>
            {lastGrind && String(lastGrind) !== String(draft.grindSetting)
              ? t`Last time with this bean: ${lastGrind}`
              : ''}
          </p>
        </div>
      </ReviewSection>

      <ReviewSection
        id='curve'
        icon={faWaveSquare}
        tone='var(--review-press)'
        title={t`Extraction`}
        summary={curveSummary}
        folded={folded.curve}
        onToggle={toggle}
      >
        <div className='mb-3 grid grid-cols-3 gap-2'>
          <Stat label={t`Time`} value={seconds ? seconds.toFixed(1) : '–'} unit='s' />
          <Stat
            label={t`Yield`}
            value={yieldG ? yieldG.toFixed(1) : '–'}
            unit='g'
            hint={ratio ? `1:${ratio}` : ''}
          />
          <Stat label={t`Peak`} value={peak ? peak.toFixed(1) : '–'} unit='bar' />
        </div>
        {shot ? (
          <ReviewChart samples={shot.samples} />
        ) : (
          <p className='text-base-content/60 py-6 text-center text-sm'>
            <Trans>The shot's curve couldn't be loaded.</Trans>
          </p>
        )}
      </ReviewSection>

      <ReviewSection
        id='rating'
        icon={faStar}
        tone='var(--review-star)'
        title={t`Rating`}
        summary={half ? `${half / 2} / 5 · ${words[half]}` : t`Not rated`}
        folded={folded.rating}
        onToggle={toggle}
      >
        <div className='flex items-center gap-3'>
          <HalfStarRating value={half} onChange={v => set('ratingHalf', v)} size='lg' />
          <span className='ml-auto text-4xl font-bold tabular-nums'>
            {half / 2}
            <span className='text-base-content/50 text-sm font-normal'>/5</span>
          </span>
        </div>
        <p
          className={`mt-1 mb-3 h-5 text-sm font-semibold ${half ? 'text-warning' : 'text-base-content/50'}`}
        >
          {half ? words[half] : t`Tap the left half of a star for half a star`}
        </p>
        <textarea
          className='textarea textarea-bordered w-full text-base'
          rows='3'
          maxLength={NOTES_MAX}
          value={draft.notes}
          onInput={e => set('notes', e.target.value)}
          placeholder={t`Tasting notes: acidity, sweetness, body, finish…`}
        />
        <p className='text-base-content/50 text-right text-xs'>
          {String(draft.notes).length}/{NOTES_MAX}
        </p>
      </ReviewSection>

      {/* Leaves room for the floating menu button on phones. */}
      <div className='from-base-300 sticky bottom-0 z-10 -mx-4 mt-1 bg-gradient-to-t from-70% to-transparent px-4 pt-6 pb-4 pl-24 md:pl-4'>
        <div className='flex gap-2'>
          <button
            type='button'
            className='btn btn-lg bg-base-100 review-card shrink-0 border-0'
            onClick={() => setShareOpen(true)}
            aria-label={t`Create share card`}
            disabled={!shot}
          >
            <FontAwesomeIcon icon={faImage} />
          </button>
          <button
            type='button'
            className='btn btn-lg btn-primary grow'
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? <Spinner size={4} /> : <FontAwesomeIcon icon={faCheck} />}
            {justSaved && !dirty ? <Trans>Saved</Trans> : <Trans>Save review</Trans>}
          </button>
        </div>
      </div>

      {shot && (
        <ShareCardModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          shot={{ ...entry, ...shot }}
          notes={merged}
        />
      )}
    </>
  );
}

function ReviewSection({ id, icon, tone, title, summary, folded, onToggle, children }) {
  return (
    <section className='bg-base-100 rounded-box review-card mb-3 overflow-hidden'>
      <button
        type='button'
        className='flex w-full items-center gap-3 px-3 py-2.5 text-left'
        onClick={() => onToggle(id)}
        aria-expanded={!folded}
      >
        <span
          className='review-tone grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm'
          style={{ '--tone': tone }}
        >
          <FontAwesomeIcon icon={icon} />
        </span>
        <span className='font-bold'>{title}</span>
        <span
          className={`text-base-content/60 min-w-0 grow truncate text-right text-xs ${folded ? '' : 'invisible'}`}
        >
          {summary}
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`text-base-content/50 text-xs transition-transform ${folded ? '-rotate-90' : ''}`}
        />
      </button>
      {!folded && <div className='px-3 pb-3'>{children}</div>}
    </section>
  );
}

function Stat({ label, value, unit, hint }) {
  return (
    <div className='bg-base-200 rounded-box px-3 py-2'>
      <div className='text-base-content/60 flex justify-between text-xs font-semibold'>
        {label}
        {hint && <span className='font-normal tabular-nums'>{hint}</span>}
      </div>
      <div className='flex items-baseline gap-0.5'>
        <span className='text-2xl font-bold tabular-nums'>{value}</span>
        <span className='text-base-content/60 text-xs'>{unit}</span>
      </div>
    </div>
  );
}
