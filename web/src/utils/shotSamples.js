// Shot log samples (parseBinaryShot) thinned to at most `maxPoints` for drawing, each with
// `s` = seconds since the first sample. The last sample is always kept.
export function thinSamples(samples, maxPoints) {
  if (!samples?.length) return [];
  const step = Math.max(1, Math.ceil(samples.length / maxPoints));
  const t0 = samples[0].t;
  const out = [];
  for (let i = 0; i < samples.length; i += step) {
    out.push({ ...samples[i], s: (samples[i].t - t0) / 1000 });
  }
  const last = samples[samples.length - 1];
  if (out[out.length - 1].t !== last.t) out.push({ ...last, s: (last.t - t0) / 1000 });
  return out;
}
