import { useEffect, useState } from 'preact/hooks';
import { Trans, useLingui } from '@lingui/react/macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload } from '@fortawesome/free-solid-svg-icons/faUpload';
import Section from '../../../components/Card.jsx';
import { Spinner } from '../../../components/Spinner.jsx';
import { machineApiUrl } from '../../../app/machines.js';
import { uploadFirmware } from '../../../utils/firmwareUpload.js';

const RECONNECT_POLL_MS = 2000;

// Flashes a firmware file from this computer or phone (e.g. a local build) onto the display or the controller.
// The device checks the image is meant for the chosen part before activating it (WebUIPlugin / FirmwareUpload).
// A controller upload continues as the regular OTA progress view (evt:ota-progress) in SystemTab.
export function FirmwareUploadSection({ formData }) {
  const { t } = useLingui();
  const [target, setTarget] = useState('display');
  const [file, setFile] = useState(null);
  const [force, setForce] = useState(false);
  const [state, setState] = useState('idle'); // idle | uploading | restarting | flashing
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // After a display upload the device restarts into the new firmware; reload once it answers again.
  useEffect(() => {
    if (state !== 'restarting') return undefined;
    let stopped = false;
    let timer;
    const poll = async () => {
      try {
        const r = await fetch('/api/status', { cache: 'no-store' });
        if (r.ok && !stopped) {
          window.location.reload();
          return;
        }
      } catch {
        // still restarting
      }
      if (!stopped) timer = setTimeout(poll, RECONNECT_POLL_MS);
    };
    timer = setTimeout(poll, RECONNECT_POLL_MS * 2);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state]);

  const targets = [
    {
      id: 'display',
      label: t`Display`,
      detail: formData.displayEnv ? t`Build: ${formData.displayEnv}` : formData.displayVersion,
    },
    { id: 'controller', label: t`Controller`, detail: formData.controllerVersion },
  ];

  const start = async () => {
    if (!file) return;
    const question =
      target === 'display'
        ? t`Flash "${file.name}" onto the display? It restarts when the upload is done.`
        : t`Flash "${file.name}" onto the controller? The machine can't be used until it finishes.`;
    if (!window.confirm(question)) return;
    setError('');
    setProgress(0);
    setState('uploading');
    const reply = await uploadFirmware({
      file,
      target,
      force,
      toUrl: machineApiUrl,
      onProgress: setProgress,
    });
    if (reply.ok) {
      setState(reply.next === 'restarting' ? 'restarting' : 'flashing');
      return;
    }
    setState('idle');
    setError(reply.error ?? t`The connection to the machine was lost during the upload.`);
  };

  const busy = state !== 'idle';

  return (
    <Section title={t`Upload firmware`} className='h-full'>
      <div className='flex flex-col gap-4'>
        <p className='text-base-content/70 text-sm'>
          <Trans>
            Install a firmware file you built yourself. The machine checks that the file is meant
            for the part you pick before using it.
          </Trans>
        </p>

        <div className='grid grid-cols-2 gap-2' role='radiogroup' aria-label={t`Part to update`}>
          {targets.map(o => (
            <button
              key={o.id}
              type='button'
              role='radio'
              aria-checked={target === o.id}
              disabled={busy}
              onClick={() => setTarget(o.id)}
              className={`btn h-auto min-w-0 flex-col items-start gap-0.5 py-2 text-left ${target === o.id ? 'btn-primary' : 'btn-ghost bg-base-200'}`}
            >
              <span className='font-semibold'>{o.label}</span>
              <span className='w-full truncate text-xs font-normal opacity-70'>
                {o.detail || '–'}
              </span>
            </button>
          ))}
        </div>

        <input
          type='file'
          accept='.bin,application/octet-stream'
          className='file-input file-input-bordered w-full'
          disabled={busy}
          onChange={e => {
            setFile(e.target.files?.[0] ?? null);
            setError('');
          }}
          aria-label={t`Firmware file (.bin)`}
        />
        <p className='text-base-content/60 -mt-2 text-xs'>
          {target === 'display' ? (
            <Trans>For example .pio/build/{formData.displayEnv || 'display'}/firmware.bin</Trans>
          ) : (
            <Trans>For example .pio/build/controller/firmware.bin</Trans>
          )}
        </p>

        <label className='flex cursor-pointer items-start gap-2 text-sm'>
          <input
            type='checkbox'
            className='checkbox checkbox-sm mt-0.5'
            checked={force}
            disabled={busy}
            onChange={e => setForce(e.target.checked)}
          />
          <span>
            <Trans>
              Allow files without a GaggiMate firmware id (official releases from before this
              feature). Files built for another part are always refused.
            </Trans>
          </span>
        </label>

        {state === 'uploading' && (
          <div className='flex flex-col gap-1'>
            <div className='flex justify-between text-sm'>
              <span>
                <Trans>Uploading…</Trans>
              </span>
              <span className='tabular-nums'>{progress}%</span>
            </div>
            <progress className='progress progress-primary w-full' value={progress} max='100' />
          </div>
        )}
        {state === 'restarting' && (
          <div className='alert alert-success'>
            <Spinner size={4} />
            <span>
              <Trans>
                Firmware installed. The display is restarting; this page reloads when it is back.
              </Trans>
            </span>
          </div>
        )}
        {state === 'flashing' && (
          <div className='alert alert-info'>
            <Spinner size={4} />
            <span>
              <Trans>Upload done. Sending the firmware to the controller…</Trans>
            </span>
          </div>
        )}
        {error && (
          <div role='alert' className='alert alert-error'>
            <span>
              <Trans>Upload failed: {error}</Trans>
            </span>
          </div>
        )}

        <button type='button' className='btn btn-primary' disabled={!file || busy} onClick={start}>
          {state === 'uploading' ? <Spinner size={4} /> : <FontAwesomeIcon icon={faUpload} />}
          <Trans>Upload and install</Trans>
        </button>
      </div>
    </Section>
  );
}
