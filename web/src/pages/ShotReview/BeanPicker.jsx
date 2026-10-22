import { useCallback, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faPen } from '@fortawesome/free-solid-svg-icons/faPen';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { Trans, useLingui } from '@lingui/react/macro';
import { Spinner } from '../../components/Spinner.jsx';
import {
  EMPTY_BEAN,
  ROAST_LEVELS,
  beanAgeDays,
  beanOnly,
  beanKey,
  roastColor,
} from '../../utils/shotNotes.js';
import { useRoastLabels } from '../../utils/shotNotesLabels.js';
import { previousUse } from './beans.js';

export function BeanDot({ level, size = 'h-8 w-8' }) {
  return (
    <span
      className={`${size} inline-block shrink-0 rounded-lg`}
      style={{ background: level ? roastColor(level) : 'var(--color-base-300)' }}
      aria-hidden='true'
    />
  );
}

export function useBeanMeta() {
  const { t } = useLingui();
  const roastLabels = useRoastLabels();
  return useCallback(
    bean => {
      const age = beanAgeDays(bean?.roastDate);
      return [
        bean?.roaster,
        roastLabels[bean?.roastLevel],
        age != null ? t`Rested ${age} days` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    },
    [roastLabels, t],
  );
}

// Chooses the bean for one shot. The list is the beans of recent shots (see beans.js);
// choosing or entering a bean only fills this shot's bean fields.
export function BeanPicker({ beans, selected, shotId, onSelect }) {
  const { t } = useLingui();
  const roastLabels = useRoastLabels();
  const beanMeta = useBeanMeta();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null); // null = list view
  const [error, setError] = useState('');
  const grindLabel = t`Grind`;
  const selectedKey = selected ? beanKey(selected) : null;
  const age = form ? beanAgeDays(form.roastDate) : null;
  // Local date as YYYY-MM-DD: a roast date can't be in the future.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

  const openPicker = () => {
    setForm(beans && !beans.length ? { ...EMPTY_BEAN } : null);
    setError('');
    setOpen(true);
  };

  const editForm = bean => {
    setError('');
    setForm(beanOnly(bean));
  };

  const choose = bean => {
    onSelect(bean);
    setOpen(false);
  };

  const submit = () => {
    if (!form.name.trim()) {
      setError(t`Enter the bean name`);
      return;
    }
    const bean = { ...form, name: form.name.trim(), roaster: form.roaster.trim() };
    // An existing bean keeps its usage history, so the grind/dose hints still apply.
    const known = beans?.find(b => b.key === beanKey(bean));
    choose({ ...known, ...bean });
  };

  return (
    <>
      <button
        type='button'
        className='bg-base-200 hover:bg-base-300 rounded-box flex w-full items-center gap-3 p-2.5 text-left transition-colors'
        onClick={openPicker}
      >
        <BeanDot level={selected?.roastLevel} />
        <span className='min-w-0 grow'>
          <span className='block truncate font-semibold'>
            {selected?.name || <Trans>Choose a bean</Trans>}
          </span>
          <span className='text-base-content/60 block truncate text-xs'>
            {selected ? beanMeta(selected) || t`Tap to change` : t`From your recent shots`}
          </span>
        </span>
        <FontAwesomeIcon icon={faChevronRight} className='text-base-content/40' />
      </button>

      {/* Portaled to <body> and lifted above the sidebar and the floating menu button. */}
      {open &&
        createPortal(
          <div
            className='modal modal-open modal-bottom sm:modal-middle z-[10000]'
            role='dialog'
            aria-modal='true'
          >
            <div className='modal-box max-w-md'>
              <div className='mb-3 flex items-center justify-between'>
                <h3 className='text-lg font-semibold'>
                  {form ? <Trans>Bean details</Trans> : <Trans>Recent beans</Trans>}
                </h3>
                <button
                  className='btn btn-sm btn-ghost btn-circle'
                  onClick={() => setOpen(false)}
                  aria-label={t`Close`}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>

              {!form && (
                <>
                  {beans === null ? (
                    <div className='flex justify-center py-8'>
                      <Spinner size={6} />
                    </div>
                  ) : (
                    <ul className='max-h-[50vh] overflow-y-auto' role='listbox'>
                      {beans.map(b => {
                        const last = previousUse(b, shotId);
                        return (
                          <li
                            key={b.key}
                            role='option'
                            aria-selected={b.key === selectedKey}
                            className={`rounded-box flex cursor-pointer items-center gap-3 p-2 ${b.key === selectedKey ? 'bg-base-200' : 'hover:bg-base-200'}`}
                            onClick={() => choose(b)}
                          >
                            <BeanDot level={b.roastLevel} />
                            <span className='min-w-0 grow'>
                              <span className='block truncate font-semibold'>{b.name}</span>
                              <span className='text-base-content/60 block truncate text-xs'>
                                {beanMeta(b)}
                                {last?.grind ? ` · ${grindLabel} ${last.grind}` : ''}
                              </span>
                            </span>
                            {b.key === selectedKey && (
                              <FontAwesomeIcon icon={faCheck} className='text-accent' />
                            )}
                            <button
                              type='button'
                              className='btn btn-ghost btn-sm btn-circle'
                              onClick={e => {
                                e.stopPropagation();
                                editForm(b);
                              }}
                              aria-label={t`Edit bean details`}
                            >
                              <FontAwesomeIcon icon={faPen} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button
                    className='btn btn-ghost bg-base-200 mt-2 w-full'
                    onClick={() => editForm(null)}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    <Trans>New bean</Trans>
                  </button>
                </>
              )}

              {form && (
                <div className='flex flex-col gap-3'>
                  {/* Visible labels: iOS shows an empty date input as a blank box with no
                      placeholder, so every field says what it is. */}
                  <label className='flex flex-col gap-1'>
                    <span className='text-base-content/70 text-xs font-medium'>
                      <Trans>Bean name</Trans>
                    </span>
                    <input
                      className='input input-bordered w-full text-base'
                      placeholder={t`e.g. Ethiopia Guji`}
                      value={form.name}
                      onInput={e => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <div className='grid grid-cols-2 gap-2'>
                    <label className='flex min-w-0 flex-col gap-1'>
                      <span className='text-base-content/70 text-xs font-medium'>
                        <Trans>Roaster</Trans>
                      </span>
                      <input
                        className='input input-bordered w-full text-base'
                        placeholder={t`Optional`}
                        value={form.roaster}
                        onInput={e => setForm({ ...form, roaster: e.target.value })}
                      />
                    </label>
                    <label className='flex min-w-0 flex-col gap-1'>
                      <span className='text-base-content/70 flex justify-between gap-1 text-xs font-medium'>
                        <Trans>Roast date</Trans>
                        {age != null && (
                          <span className='text-warning truncate font-normal'>
                            {t`Rested ${age} days`}
                          </span>
                        )}
                      </span>
                      <input
                        type='date'
                        className='input input-bordered w-full text-base'
                        max={today}
                        value={form.roastDate}
                        onInput={e => setForm({ ...form, roastDate: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className='flex flex-col gap-1'>
                    <span className='text-base-content/70 text-xs font-medium'>
                      <Trans>Roast level</Trans>
                    </span>
                    <div className='join w-full' role='group' aria-label={t`Roast level`}>
                      {ROAST_LEVELS.map(({ id: level, color }) => (
                        <button
                          key={level}
                          type='button'
                          aria-pressed={form.roastLevel === level}
                          className={`btn btn-sm join-item grow gap-1 px-1 ${form.roastLevel === level ? 'btn-neutral' : ''}`}
                          onClick={() =>
                            setForm({ ...form, roastLevel: form.roastLevel === level ? '' : level })
                          }
                        >
                          <span className='h-2 w-2 rounded-full' style={{ background: color }} />
                          <span className='text-xs'>{roastLabels[level]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className='text-base-content/60 text-xs'>
                    <Trans>Saved with this shot's notes on the machine.</Trans>
                  </p>
                  {error && <p className='text-error text-sm'>{error}</p>}
                  <div className='modal-action mt-2'>
                    <button
                      className='btn btn-ghost'
                      onClick={() => (beans?.length ? setForm(null) : setOpen(false))}
                    >
                      <Trans>Back</Trans>
                    </button>
                    <button className='btn btn-primary' onClick={submit}>
                      <Trans>Use for this shot</Trans>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className='modal-backdrop' onClick={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  );
}
