import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { Trans, useLingui } from '@lingui/react/macro';
import { ApiServiceContext } from '../../services/ApiService.js';
import { downloadBlob } from '../../utils/download.js';
import { encodeProfileCode } from '../../utils/profileCode.js';
import { beanAgeDays, halfStarsOf, roastColor } from '../../utils/shotNotes.js';
import { useRatingWords, useRoastLabels } from '../../utils/shotNotesLabels.js';
import { readPref, writePref } from '../../utils/localPrefs.js';
import { thinSamples } from '../../utils/shotSamples.js';
import { Spinner } from '../Spinner.jsx';
import { makeQr, renderShareCard } from './renderShareCard.js';

const TEMPLATE_KEY = 'gaggimate.shareCard.template';
const TITLE_KEY = 'gaggimate.shareCard.title';
const MAX_POINTS = 400;

// Measured (cp) and target (tp) pressure as [seconds, bar] pairs, thinned for drawing.
function pressureSeries(samples) {
  const points = thinSamples(samples, MAX_POINTS);
  if (!points.length) return { act: null, tgt: null };
  return {
    act: points.filter(p => Number.isFinite(p.cp)).map(p => [p.s, p.cp]),
    tgt: points.filter(p => Number.isFinite(p.tp)).map(p => [p.s, p.tp]),
  };
}

export default function ShareCardModal({ isOpen, onClose, shot, notes }) {
  const { t } = useLingui();
  const apiService = useContext(ApiServiceContext);
  const roastLabels = useRoastLabels();
  const canvasRef = useRef(null);
  const urlRef = useRef(null);
  const [template, setTemplate] = useState(() => readPref(TEMPLATE_KEY, 'dark'));
  const [title, setTitle] = useState(() => readPref(TITLE_KEY, ''));
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = unavailable
  const [qr, setQr] = useState(null);
  const [preview, setPreview] = useState(null);
  const [blob, setBlob] = useState(null);
  const [saving, setSaving] = useState(false);

  const templates = [
    { id: 'dark', label: t`Espresso`, swatch: 'linear-gradient(160deg,#5a3520,#17100B 60%)' },
    { id: 'bag', label: t`Bean bag`, swatch: 'linear-gradient(180deg,#9A6A44 0 45%,#F6F0E7 45%)' },
    {
      id: 'ticket',
      label: t`Receipt`,
      swatch: 'repeating-linear-gradient(180deg,#FFFDF8 0 5px,#E9E1D5 5px 6px)',
    },
  ];

  const words = useRatingWords();

  // Load the brew profile once per opening: its temperature goes on the card and
  // its settings go into the QR code.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setProfile(undefined);
    setQr(null);
    (async () => {
      let p = null;
      if (shot.profileId && apiService) {
        try {
          const response = await apiService.request({
            tp: 'req:profiles:load',
            id: shot.profileId,
          });
          p = response?.profile || null;
        } catch (e) {
          console.warn('Profile not available for share card', e);
        }
      }
      const code = p ? await encodeProfileCode(p) : null;
      if (!cancelled) {
        setProfile(p);
        setQr(code ? makeQr(code) : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, shot.profileId, apiService]);

  const data = useMemo(() => {
    const n = notes || {};
    const ratingHalf = halfStarsOf(n);
    const age = beanAgeDays(n.roastDate);
    const { act, tgt } = pressureSeries(shot.samples);
    return {
      title: title.trim() || t`Shot Review`,
      name: n.beanType || t`Unnamed coffee`,
      roaster: n.roaster || '',
      roast: n.roastLevel ? roastLabels[n.roastLevel] : '',
      rc: roastColor(n.roastLevel),
      ageText: age != null ? t`Rested ${age} days` : '',
      roastedText: n.roastDate ? t`Roasted ${n.roastDate}` : '',
      profile: shot.profile || profile?.label || '',
      temp: profile?.temperature || null,
      act,
      tgt,
      rating: ratingHalf / 2,
      word: words[Math.round(ratingHalf)] || '',
      notes: (n.notes || '').trim(),
      at: shot.timestamp ? shot.timestamp * 1000 : Date.now(),
      qr,
      labels: {
        pressure: t`Pressure`,
        scan: t`Scan for brew profile`,
        roaster: t`Roaster`,
        roast: t`Roast`,
        profile: t`Profile`,
        rating: t`Rating`,
      },
    };
    // `t`, `words` and `roastLabels` are stable between renders (they change with the locale)
  }, [notes, shot, profile, qr, title, roastLabels, words, t]);

  useEffect(() => {
    if (!isOpen || profile === undefined) return;
    let cancelled = false;
    const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    renderShareCard(canvas, template, data);
    canvas.toBlob(b => {
      if (!b || cancelled) return;
      // Swap URLs only once the new image exists, so the preview never shows a revoked one.
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(b);
      setBlob(b);
      setPreview(urlRef.current);
    }, 'image/png');
    return () => {
      cancelled = true;
    };
  }, [isOpen, template, data, profile]);

  // Free the 6 MB canvas backing store when the modal closes.
  useEffect(() => {
    if (!isOpen && canvasRef.current) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
      canvasRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPreview(null);
      setBlob(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const chooseTemplate = id => {
    setTemplate(id);
    writePref(TEMPLATE_KEY, id);
  };

  const onSave = async () => {
    if (!blob) return;
    setSaving(true);
    try {
      const safe = (notes?.beanType || 'shot').replace(/[\\/:*?"<>|]/g, '').slice(0, 30);
      await downloadBlob(blob, `shot-${shot.id}-${safe}.png`);
    } finally {
      setSaving(false);
    }
  };

  // Portaled to <body> and lifted above the sidebar and the floating menu button.
  return createPortal(
    <div
      className='modal modal-open modal-bottom sm:modal-middle z-[10000]'
      role='dialog'
      aria-modal='true'
    >
      <div className='modal-box max-w-md'>
        <div className='mb-3 flex items-center justify-between'>
          <h3 className='text-lg font-semibold'>
            <Trans>Share card</Trans>
          </h3>
          <button
            className='btn btn-sm btn-ghost btn-circle'
            onClick={onClose}
            aria-label={t`Close`}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className='mb-3 grid grid-cols-3 gap-2' role='group' aria-label={t`Card style`}>
          {templates.map(tpl => (
            <button
              key={tpl.id}
              type='button'
              aria-pressed={template === tpl.id}
              onClick={() => chooseTemplate(tpl.id)}
              className={`btn h-auto flex-col gap-1 py-2 ${template === tpl.id ? 'btn-neutral' : 'btn-ghost bg-base-200'}`}
            >
              <span className='block h-9 w-7 rounded' style={{ background: tpl.swatch }} />
              <span className='text-xs'>{tpl.label}</span>
            </button>
          ))}
        </div>

        <label className='input input-bordered input-sm mb-3 flex w-full items-center gap-2'>
          <span className='text-base-content/60 shrink-0 text-xs'>
            <Trans>Card title</Trans>
          </span>
          <input
            type='text'
            className='grow text-base'
            value={title}
            maxLength={16}
            placeholder={t`Shot Review`}
            onInput={e => {
              setTitle(e.target.value);
              writePref(TITLE_KEY, e.target.value);
            }}
          />
        </label>

        <div className='bg-base-200 rounded-box flex min-h-48 items-center justify-center p-2'>
          {preview ? (
            <img
              src={preview}
              alt={t`Share card preview`}
              className='max-h-[55vh] w-auto rounded-lg shadow-lg'
            />
          ) : (
            <Spinner size={6} />
          )}
        </div>
        <p className='text-base-content/60 mt-2 text-center text-xs'>
          {profile === null ? (
            <Trans>Brew profile not found on the machine, so the card has no QR code.</Trans>
          ) : qr ? (
            // The shot log keeps only the profile's id and name, so this is the profile as
            // saved now; it may have been edited since the shot.
            <Trans>
              The QR code holds this profile as it is now saved on the machine, which may differ
              from when this shot was pulled.
            </Trans>
          ) : profile !== undefined ? (
            <Trans>This browser can't build the profile QR code.</Trans>
          ) : null}
        </p>

        <div className='modal-action mt-3'>
          <button className='btn btn-ghost' onClick={onClose}>
            <Trans>Close</Trans>
          </button>
          <button className='btn btn-primary' onClick={onSave} disabled={!blob || saving}>
            {saving ? <Spinner size={4} /> : <FontAwesomeIcon icon={faDownload} />}
            <Trans>Save image</Trans>
          </button>
        </div>
      </div>
      <div className='modal-backdrop' onClick={onClose} />
    </div>,
    document.body,
  );
}
