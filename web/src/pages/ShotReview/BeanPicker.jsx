import { useCallback, useMemo, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faPen } from '@fortawesome/free-solid-svg-icons/faPen';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass';
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash';
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
  sameBean,
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

// The search box shows from this many beans on.
const SEARCH_MIN_BEANS = 6;

// Chooses the bean for one shot from the bean library on the machine (see beans.js), and adds,
// edits, archives and deletes library beans. `onStore(bean)` saves a bean to the library and
// resolves with it (with its id); `onDelete(id)` removes one. Shots keep the copy of the bean
// in their notes either way. `error` says why the library couldn't be loaded.
export function BeanPicker({
  beans,
  error: loadError,
  selected,
  shotId,
  onSelect,
  onStore,
  onDelete,
}) {
  const { t } = useLingui();
  const roastLabels = useRoastLabels();
  const beanMeta = useBeanMeta();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null); // null = library view
  const [editing, setEditing] = useState(null); // the bean the form edits; null = a new one
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const grindLabel = t`Grind`;
  const age = form ? beanAgeDays(form.roastDate) : null;
  // Local date as YYYY-MM-DD: a roast date can't be in the future.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

  // The shot's bean stays listed even when the library doesn't have it (deleted since); it keeps its
  // beanId, so saving it puts it back under the same id.
  const library = useMemo(() => {
    if (!beans) return null;
    if (!selected?.name || beans.some(b => sameBean(b, selected))) return beans;
    return [{ ...selected, key: beanKey(selected), uses: [], orphan: true }, ...beans];
  }, [beans, selected]);
  // The form edits a bean of the library (not a new one, nor the shot's bean that isn't in it).
  const editsLibraryBean = !!editing && !editing.orphan;
  const archivedCount = library?.filter(b => b.archived).length ?? 0;
  const needle = query.trim().toLowerCase();
  const shown = library?.filter(
    b =>
      (showArchived || !b.archived || sameBean(b, selected)) &&
      (!needle || `${b.name} ${b.roaster || ''}`.toLowerCase().includes(needle)),
  );

  const openPicker = () => {
    setForm(null);
    setQuery('');
    setError('');
    setOpen(true);
  };

  // `bean` null: a new bean.
  const editForm = bean => {
    setError('');
    setEditing(bean);
    setForm(bean ? { ...beanOnly(bean), archived: !!bean.archived } : { ...EMPTY_BEAN });
  };

  const choose = bean => {
    onSelect(bean);
    setOpen(false);
  };

  const updateLibrary = async action => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      console.warn('Bean library update failed', e);
      setError(t`Couldn't update the bean library on the machine: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!form.name.trim()) {
      setError(t`Enter the bean name`);
      return;
    }
    const bean = {
      ...form,
      id: editing?.id || '',
      name: form.name.trim(),
      roaster: form.roaster.trim(),
    };
    updateLibrary(async () => {
      const stored = await onStore(bean);
      const withUses = { ...stored, key: beanKey(stored), uses: editing?.uses ?? [] };
      // A new bean is for this shot; an edited one refreshes this shot's copy if it is its bean.
      if (!editsLibraryBean) choose(withUses);
      else {
        if (sameBean(editing, selected)) onSelect(withUses);
        setForm(null);
      }
    });
  };

  const remove = () => {
    if (!window.confirm(t`Delete "${editing.name}" from the bean library? Shots keep their copy.`))
      return;
    updateLibrary(async () => {
      await onDelete(editing.id);
      setForm(null);
    });
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
            {selected
              ? beanMeta(selected) || t`Tap to change`
              : t`Pick from your bean library or add one`}
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
                  {!form ? (
                    <Trans>Bean library</Trans>
                  ) : editsLibraryBean ? (
                    <Trans>Edit bean</Trans>
                  ) : (
                    <Trans>New bean</Trans>
                  )}
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
                  {library && library.length >= SEARCH_MIN_BEANS && (
                    <label className='input input-bordered mb-2 flex w-full items-center gap-2'>
                      <FontAwesomeIcon icon={faMagnifyingGlass} className='opacity-50' />
                      <input
                        type='search'
                        className='grow text-base'
                        placeholder={t`Search name or roaster`}
                        value={query}
                        onInput={e => setQuery(e.target.value)}
                      />
                    </label>
                  )}
                  {library === null && loadError ? (
                    <p className='text-error py-6 text-center text-sm'>
                      {t`Couldn't load the bean library: ${loadError}`}
                    </p>
                  ) : library === null ? (
                    <div className='flex justify-center py-8'>
                      <Spinner size={6} />
                    </div>
                  ) : !library.length ? (
                    <p className='text-base-content/60 py-6 text-center text-sm'>
                      <Trans>No beans yet. Add the one in your grinder.</Trans>
                    </p>
                  ) : !shown.length ? (
                    <p className='text-base-content/60 py-6 text-center text-sm'>
                      <Trans>No bean matches.</Trans>
                    </p>
                  ) : (
                    <ul className='max-h-[50vh] overflow-y-auto' role='listbox'>
                      {shown.map(b => {
                        const last = previousUse(b, shotId);
                        const chosen = sameBean(b, selected);
                        return (
                          <li
                            key={b.id || b.key}
                            role='option'
                            aria-selected={chosen}
                            className={`rounded-box flex cursor-pointer items-center gap-3 p-2 ${chosen ? 'bg-base-200' : 'hover:bg-base-200'} ${b.archived ? 'opacity-60' : ''}`}
                            onClick={() => choose(b)}
                          >
                            <BeanDot level={b.roastLevel} />
                            <span className='min-w-0 grow'>
                              <span className='block truncate font-semibold'>
                                {b.name}
                                {b.archived && (
                                  <span className='badge badge-ghost badge-sm ml-2 align-middle'>
                                    <Trans>Archived</Trans>
                                  </span>
                                )}
                              </span>
                              <span className='text-base-content/60 block truncate text-xs'>
                                {b.orphan
                                  ? t`Not in the library`
                                  : [beanMeta(b), last?.grind && `${grindLabel} ${last.grind}`]
                                      .filter(Boolean)
                                      .join(' · ')}
                              </span>
                            </span>
                            {chosen && <FontAwesomeIcon icon={faCheck} className='text-accent' />}
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
                  {archivedCount > 0 && (
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs mt-1 w-full'
                      onClick={() => setShowArchived(v => !v)}
                    >
                      {showArchived ? (
                        <Trans>Hide archived beans</Trans>
                      ) : (
                        <Trans>Show archived beans ({archivedCount})</Trans>
                      )}
                    </button>
                  )}
                  <button
                    className='btn btn-ghost bg-base-200 mt-2 w-full'
                    onClick={() => editForm(null)}
                    disabled={library === null}
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
                  {editsLibraryBean && (
                    <label className='flex cursor-pointer items-center gap-2 text-sm'>
                      <input
                        type='checkbox'
                        className='checkbox checkbox-sm'
                        checked={!!form.archived}
                        onChange={e => setForm({ ...form, archived: e.target.checked })}
                      />
                      <Trans>Finished: move it to the archive</Trans>
                    </label>
                  )}
                  <p className='text-base-content/60 text-xs'>
                    <Trans>Saved in the bean library on the machine.</Trans>
                  </p>
                  {error && <p className='text-error text-sm'>{error}</p>}
                  <div className='modal-action mt-2 items-center'>
                    {editsLibraryBean && (
                      <button
                        className='btn btn-ghost btn-sm text-error mr-auto'
                        onClick={remove}
                        disabled={busy}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                        <Trans>Delete</Trans>
                      </button>
                    )}
                    <button className='btn btn-ghost' onClick={() => setForm(null)} disabled={busy}>
                      <Trans>Back</Trans>
                    </button>
                    <button className='btn btn-primary' onClick={submit} disabled={busy}>
                      {busy && <Spinner size={4} />}
                      {editsLibraryBean ? (
                        <Trans>Save</Trans>
                      ) : (
                        <Trans>Save and use for this shot</Trans>
                      )}
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
