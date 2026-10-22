import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { computed } from '@preact/signals';
import { Trans, useLingui } from '@lingui/react/macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMugHot } from '@fortawesome/free-solid-svg-icons/faMugHot';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons/faClockRotateLeft';
import { ApiServiceContext, machine } from '../../services/ApiService.js';
import { Spinner } from '../../components/Spinner.jsx';
import { fetchShotList } from './shotData.js';
import {
  buildLibrary,
  deleteBean,
  fetchBeanTable,
  migrateLegacyBeans,
  newBeanId,
  saveBean,
  scanRecentNotes,
} from './beans.js';
import { ReviewForm } from './ReviewForm.jsx';
import { ReviewList } from './ReviewList.jsx';
import './ShotReview.css';
import { isDarkTheme, setPageTheme } from '../../utils/themeManager.js';

const connected = computed(() => machine.value.connected);

// A simple "how was this cup?" page. It reviews the same shots as Shot History and
// stores everything in that shot's notes, so both pages always agree.
export function ShotReview() {
  const { t } = useLingui();
  const { params } = useRoute();
  const location = useLocation();
  const apiService = useContext(ApiServiceContext);
  const [shots, setShots] = useState(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('review');
  const [beanTable, setBeanTable] = useState(null); // the bean library on the machine; null while loading
  const [beanError, setBeanError] = useState('');
  // Bumps whenever notesCache changes, so the library recomputes each bean's uses.
  const [notesRevision, setNotesRevision] = useState(0);
  // Bumps with every change to the library made on this page, so a slower load can't undo it.
  const beanEdits = useRef(0);
  const shotIds = shots?.map(s => s.id).join(',');
  // Notes saved or loaded on this page, so the list shows them without asking the machine again.
  const notesCache = useRef(new Map());
  const rootRef = useRef(null);

  // This page always shows the Espresso palette, light or dark to match the user's theme.
  useEffect(() => {
    setPageTheme(theme => (isDarkTheme(theme) ? 'espresso-dark' : 'espresso'));
    return () => setPageTheme(null);
  }, []);

  useEffect(() => {
    if (!connected.value) return;
    const controller = new AbortController();
    fetchShotList(controller.signal)
      .then(list => {
        setShots(list);
        setFailed(false);
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        console.error('Failed to load shots', e);
        setFailed(true);
      });
    return () => controller.abort();
  }, [connected.value]);

  // The bean library, plus the notes of recent shots for each bean's last grind and dose. Beans named
  // only in notes from before the library are taken into it (once: their notes get the beanId).
  useEffect(() => {
    if (!shots) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const editsAtStart = beanEdits.current;
    (async () => {
      let table = await fetchBeanTable(apiService);
      await scanRecentNotes(shots, notesCache.current, apiService, signal);
      if (signal.aborted) return;
      if (await migrateLegacyBeans(apiService, table, shots, notesCache.current, signal)) {
        table = await fetchBeanTable(apiService);
      }
      if (signal.aborted) return;
      // The user changed the library meanwhile: take the machine's table, which has the change too.
      if (beanEdits.current !== editsAtStart) table = await fetchBeanTable(apiService);
      if (signal.aborted) return;
      setBeanTable(table);
      setBeanError('');
      setNotesRevision(n => n + 1);
    })().catch(e => {
      console.warn('Could not load the bean library', e);
      if (!signal.aborted) setBeanError(e.message || String(e));
    });
    return () => controller.abort();
  }, [shotIds, apiService]);

  const beans = useMemo(
    () => (beanTable && shots ? buildLibrary(beanTable, shots, notesCache.current) : null),
    [beanTable, shots, notesRevision],
  );

  // Adds or updates a bean in the library on the machine; resolves with the stored bean.
  const storeBean = async bean => {
    const stored = { ...bean, id: bean.id || newBeanId() };
    beanEdits.current++;
    await saveBean(apiService, stored);
    setBeanTable(table => {
      const list = table ?? [];
      return list.some(b => b.id === stored.id)
        ? list.map(b => (b.id === stored.id ? stored : b))
        : [...list, stored];
    });
    return stored;
  };

  const removeBean = async id => {
    beanEdits.current++;
    await deleteBean(apiService, id);
    setBeanTable(table => (table ?? []).filter(b => b.id !== id));
  };

  const open = id => {
    setView('review');
    location.route(`/review/${id}`);
    rootRef.current?.scrollIntoView({ block: 'start' });
  };

  const index = shots ? Math.max(0, params.id ? shots.findIndex(s => s.id === params.id) : 0) : -1;
  const entry = shots?.[index];

  const onSaved = (id, notes) => {
    notesCache.current.set(id, notes);
    setNotesRevision(n => n + 1); // the bean's uses change with the notes
    // Mirror the whole-star rating the machine keeps in its index.
    setShots(list => list.map(s => (s.id === id ? { ...s, rating: notes.rating || null } : s)));
  };

  return (
    <div ref={rootRef} className='mx-auto flex w-full max-w-xl flex-col'>
      <header className='mb-3 flex items-center gap-3'>
        <span className='bg-accent text-accent-content grid h-10 w-10 shrink-0 place-items-center rounded-xl'>
          <FontAwesomeIcon icon={faMugHot} />
        </span>
        <div className='min-w-0 grow'>
          <h2 className='text-2xl leading-tight font-bold'>
            <Trans>Shot Review</Trans>
          </h2>
          <p className='text-base-content/60 text-xs'>
            {new Date().toLocaleDateString([], { month: 'long', day: 'numeric', weekday: 'short' })}
          </p>
        </div>
        <div className='bg-base-200 flex rounded-xl p-1' role='group'>
          {[
            ['review', faMugHot, t`This shot`],
            ['list', faClockRotateLeft, t`History`],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              type='button'
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
                view === id ? 'bg-base-100 shadow-sm' : 'text-base-content/60'
              }`}
            >
              <FontAwesomeIcon icon={icon} className='text-xs' />
              {label}
            </button>
          ))}
        </div>
      </header>

      {shots === null && !failed && (
        <div className='flex justify-center py-16'>
          <Spinner size={8} />
        </div>
      )}
      {failed && (
        <p className='text-base-content/60 py-16 text-center'>
          <Trans>Couldn't load shots from the machine.</Trans>
        </p>
      )}
      {shots && !shots.length && (
        <div className='text-base-content/60 flex flex-col items-center gap-2 py-16 text-center'>
          <FontAwesomeIcon icon={faMugHot} className='text-3xl opacity-50' />
          <Trans>No shots yet. Pull a shot and it will show up here to review.</Trans>
        </div>
      )}

      {entry && view === 'review' && (
        <ReviewForm
          key={entry.id}
          entry={entry}
          isLatest={index === 0}
          newerId={shots[index - 1]?.id}
          olderId={shots[index + 1]?.id}
          onNavigate={open}
          onSaved={onSaved}
          notesCache={notesCache.current}
          beans={beans}
          beanError={beanError}
          onStoreBean={storeBean}
          onDeleteBean={removeBean}
          apiService={apiService}
        />
      )}
      {shots?.length > 0 && view === 'list' && (
        <ReviewList
          shots={shots}
          currentId={entry?.id}
          onOpen={open}
          notesCache={notesCache.current}
          apiService={apiService}
        />
      )}
    </div>
  );
}
