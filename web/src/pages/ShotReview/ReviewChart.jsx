import { useMemo, useRef, useState } from 'preact/hooks';
import { useLingui } from '@lingui/react/macro';
import { thinSamples } from '../../utils/shotSamples.js';

// Compact pressure/flow/weight chart for the review page, drawn as SVG so it stays
// light on phones. Solid = measured, dashed = profile target.

// SVG viewBox size and the plot area's padding inside it (axis labels live in the padding).
const VIEW_W = 340;
const VIEW_H = 190;
const PAD_LEFT = 26;
const PAD_RIGHT = 30;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
const MAX_POINTS = 240;

export const SERIES_COLORS = {
  pressure: 'var(--review-press, #d9773f)',
  flow: 'var(--review-flow, #4f8fb0)',
  weight: 'var(--review-weight, #c9962e)',
};

function path(points, x, y, key) {
  let d = '';
  let open = false;
  for (const p of points) {
    const v = p[key];
    if (!Number.isFinite(v)) {
      open = false;
      continue;
    }
    d += `${open ? 'L' : 'M'}${x(p.s).toFixed(1)} ${y(v).toFixed(1)}`;
    open = true;
  }
  return d;
}

export function ReviewChart({ samples }) {
  const { t } = useLingui();
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const data = useMemo(() => {
    if (!samples?.length) return null;
    const pts = thinSamples(samples, MAX_POINTS);
    const maxT = Math.max(pts[pts.length - 1].s, 10);
    const maxW = Math.max(10, ...pts.map(p => (Number.isFinite(p.v) ? p.v : 0)));
    const wTop = Math.ceil(maxW / 10) * 10;
    const x = s => PAD_LEFT + (s / maxT) * (VIEW_W - PAD_LEFT - PAD_RIGHT);
    const yP = v =>
      PAD_TOP + (VIEW_H - PAD_TOP - PAD_BOTTOM) * (1 - Math.max(0, Math.min(12, v)) / 12);
    const yW = v =>
      PAD_TOP + (VIEW_H - PAD_TOP - PAD_BOTTOM) * (1 - Math.max(0, Math.min(wTop, v)) / wTop);
    // A target of 0 means "no target" for that phase; leave a gap instead of a line on the floor.
    const tgt = pts.map(p => ({ ...p, tp: p.tp > 0 ? p.tp : NaN, tf: p.tf > 0 ? p.tf : NaN }));
    const hasWeight = pts.some(p => p.v > 0);
    return {
      pts,
      maxT,
      wTop,
      x,
      yP,
      yW,
      hasWeight,
      press: path(pts, x, yP, 'cp'),
      pressT: path(tgt, x, yP, 'tp'),
      flow: path(pts, x, yP, 'fl'),
      flowT: path(tgt, x, yP, 'tf'),
      weight: hasWeight ? path(pts, x, yW, 'v') : '',
    };
  }, [samples]);

  if (!data) {
    return (
      <div className='bg-base-200 rounded-box text-base-content/50 flex h-40 items-center justify-center text-sm'>
        —
      </div>
    );
  }

  const pick = e => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * VIEW_W;
    const s = ((sx - PAD_LEFT) / (VIEW_W - PAD_LEFT - PAD_RIGHT)) * data.maxT;
    let best = data.pts[0];
    for (const p of data.pts) if (Math.abs(p.s - s) < Math.abs(best.s - s)) best = p;
    setHover(best);
  };

  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
  const gridVals = [0, 3, 6, 9, 12];

  return (
    <div>
      <div className='bg-base-200 rounded-box px-0.5 pt-1.5 pb-0.5'>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className='block h-auto w-full touch-pan-y select-none'
          role='img'
          aria-label={t`Pressure, flow and weight over the shot`}
          onPointerDown={pick}
          onPointerMove={e => (e.buttons || e.pointerType === 'mouse') && pick(e)}
          onPointerLeave={() => setHover(null)}
        >
          <g className='text-base-content' fontSize='9' fill='currentColor'>
            {gridVals.map(v => (
              <g key={v}>
                <line
                  x1={PAD_LEFT}
                  x2={VIEW_W - PAD_RIGHT}
                  y1={data.yP(v)}
                  y2={data.yP(v)}
                  stroke='currentColor'
                  strokeOpacity='0.1'
                />
                <text x={PAD_LEFT - 5} y={data.yP(v) + 3} textAnchor='end' fillOpacity='0.5'>
                  {v}
                </text>
                {data.hasWeight && (
                  <text x={VIEW_W - PAD_RIGHT + 5} y={data.yP(v) + 3} fillOpacity='0.5'>
                    {Math.round((v / 12) * data.wTop)}
                  </text>
                )}
              </g>
            ))}
            <text x={PAD_LEFT} y={VIEW_H - 6} fillOpacity='0.5'>
              0s
            </text>
            <text x={VIEW_W - PAD_RIGHT} y={VIEW_H - 6} textAnchor='end' fillOpacity='0.5'>
              {Math.round(data.maxT)}s
            </text>
          </g>
          <g fill='none' strokeLinejoin='round' strokeLinecap='round'>
            <path
              d={data.pressT}
              style={{ stroke: SERIES_COLORS.pressure }}
              strokeWidth='1.4'
              strokeDasharray='4 3'
              opacity='0.6'
            />
            <path
              d={data.flowT}
              style={{ stroke: SERIES_COLORS.flow }}
              strokeWidth='1.4'
              strokeDasharray='4 3'
              opacity='0.6'
            />
            <path d={data.weight} style={{ stroke: SERIES_COLORS.weight }} strokeWidth='2' />
            <path d={data.flow} style={{ stroke: SERIES_COLORS.flow }} strokeWidth='2' />
            <path d={data.press} style={{ stroke: SERIES_COLORS.pressure }} strokeWidth='2.4' />
          </g>
          {hover && (
            <line
              x1={data.x(hover.s)}
              x2={data.x(hover.s)}
              y1={PAD_TOP}
              y2={VIEW_H - PAD_BOTTOM}
              className='text-base-content'
              stroke='currentColor'
              strokeOpacity='0.35'
            />
          )}
        </svg>
      </div>
      <div className='text-base-content/70 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
        <Legend color={SERIES_COLORS.pressure} label={t`Pressure`} unit='bar' />
        <Legend color={SERIES_COLORS.flow} label={t`Flow`} unit='ml/s' />
        {data.hasWeight && <Legend color={SERIES_COLORS.weight} label={t`Weight`} unit='g' />}
        <span className='flex items-center gap-1'>
          <span className='border-base-content/50 w-3 border-t-2 border-dashed' />
          {t`Target`}
        </span>
      </div>
      <div className='text-base-content/60 mt-1 h-4 text-xs tabular-nums'>
        {hover &&
          `${fmt(hover.s)}s · ${fmt(hover.cp)} bar · ${fmt(hover.fl)} ml/s${
            data.hasWeight ? ` · ${fmt(hover.v)} g` : ''
          }`}
      </div>
    </div>
  );
}

function Legend({ color, label, unit }) {
  return (
    <span className='flex items-center gap-1'>
      <span className='w-3 border-t-2' style={{ borderColor: color }} />
      {label}
      <span className='text-base-content/40'>{unit}</span>
    </span>
  );
}
