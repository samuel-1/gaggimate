import qrcode from 'qrcode-generator';

// Renders a 1080×1440 share card onto a canvas. Pure drawing code: all text arrives
// already translated in `d.labels`, and nothing here touches the device.

export const CARD_W = 1080;
export const CARD_H = 1440;

const SANS =
  '-apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Segoe UI", Roboto, sans-serif';
const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, "PingFang SC", monospace';
const sansFont = (w, sz) => `${w} ${sz}px ${SANS}`;
const monoFont = (w, sz) => `${w} ${sz}px ${MONO}`;

const hexRGB = h => {
  const s = h.replace('#', '');
  return [0, 2, 4].map(i => parseInt(s.substr(i, 2), 16));
};
const rgba = (h, a) => {
  const [r, g, b] = hexRGB(h);
  return `rgba(${r},${g},${b},${a})`;
};
const mix = (h1, h2, t) => {
  const a = hexRGB(h1);
  const b = hexRGB(h2);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};
const fmtDate = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const scoreText = v => (v % 1 ? v.toFixed(1) : String(v));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wraps text by character (works for CJK and Latin), avoiding line-leading punctuation
// and preferring to break at spaces.
function wrapLines(ctx, text, maxW, maxLines) {
  const src = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const noStart = '，。！？、；：”’）》」』…,.!?;:)';
  const out = [];
  let line = '';
  let used = 0;
  for (const ch of src) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line && !noStart.includes(ch)) {
      const sp = line.lastIndexOf(' ');
      let carry = '';
      if (sp > line.length * 0.4 && ch !== ' ') {
        carry = line.slice(sp + 1);
        line = line.slice(0, sp);
      }
      out.push(line);
      if (out.length >= maxLines) break;
      line = ch === ' ' ? carry : carry + ch;
    } else {
      line = test;
    }
    used++;
  }
  if (out.length < maxLines && line) out.push(line);
  if (maxLines > 0 && out.length === maxLines && used < [...src].length) {
    let last = out[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    out[maxLines - 1] = `${last}…`;
  }
  return out;
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r * 0.47 : r;
    ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
  }
  ctx.closePath();
}

function drawStars(ctx, x, y, size, gap, value, on, off) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (size + gap) + size / 2;
    const cy = y + size / 2;
    const r = (size / 2) * 0.94;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.1;
    starPath(ctx, cx, cy, r);
    ctx.fillStyle = off;
    ctx.strokeStyle = off;
    ctx.fill();
    ctx.stroke();
    const f = Math.max(0, Math.min(1, value - i));
    if (f > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - size / 2 - 4, cy - size / 2 - 4, (size + 8) * f, size + 8);
      ctx.clip();
      starPath(ctx, cx, cy, r);
      ctx.fillStyle = on;
      ctx.strokeStyle = on;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  return 5 * size + 4 * gap;
}

// Pressure plot: solid = measured (cp), dashed = target (tp).
function plot(ctx, d, o) {
  const act = d.act;
  const tgt = d.tgt;
  const maxT = Math.max(act?.length ? act[act.length - 1][0] : 0, 10);
  const X = t => o.x + (t / maxT) * o.w;
  const Y = p => o.y + o.h - (Math.max(0, Math.min(12, p)) / 12) * o.h;
  if (o.grid) {
    ctx.save();
    ctx.strokeStyle = o.grid;
    ctx.lineWidth = 2;
    if (o.dotGrid) ctx.setLineDash([3, 9]);
    for (let v = 0; v <= 12; v += 3) {
      ctx.beginPath();
      ctx.moveTo(o.x, Y(v));
      ctx.lineTo(o.x + o.w, Y(v));
      ctx.stroke();
      if (o.axis && v) {
        ctx.fillStyle = o.axis;
        ctx.font = o.axisFont;
        ctx.textAlign = 'right';
        ctx.fillText(v, o.x - 12, Y(v) + 9);
      }
    }
    ctx.restore();
  }
  if (tgt?.length > 1 && o.tgtColor) {
    ctx.save();
    ctx.setLineDash([o.lw * 2, o.lw * 1.8]);
    ctx.strokeStyle = o.tgtColor;
    ctx.lineWidth = o.lw * 0.55;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    tgt.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.stroke();
    ctx.restore();
  }
  if (act?.length > 1) {
    if (o.fill) {
      const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
      g.addColorStop(0, o.fill[0]);
      g.addColorStop(1, o.fill[1]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(X(act[0][0]), Y(0));
      act.forEach(([t, v]) => ctx.lineTo(X(t), Y(v)));
      ctx.lineTo(X(act[act.length - 1][0]), Y(0));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    act.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.stroke();
    if (o.dot) {
      const [lt, lv] = act[act.length - 1];
      ctx.fillStyle = o.stroke;
      ctx.beginPath();
      ctx.arc(X(lt), Y(lv), o.lw * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (o.axis) {
    ctx.fillStyle = o.axis;
    ctx.font = o.axisFont;
    ctx.textAlign = 'left';
    ctx.fillText('0s', o.x, o.y + o.h + 40);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxT)}s`, o.x + o.w, o.y + o.h + 40);
    ctx.textAlign = 'left';
  }
}

function pills(ctx, x, y, items, o, maxX) {
  for (const it of items) {
    if (!it) continue;
    ctx.font = o.font;
    const w = ctx.measureText(it.t).width + o.px * 2 + (it.dot ? o.h * 0.45 : 0);
    if (x + w > maxX) break;
    roundRect(ctx, x, y, w, o.h, o.h / 2);
    if (o.bg) {
      ctx.fillStyle = o.bg;
      ctx.fill();
    }
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    let tx = x + o.px;
    if (it.dot) {
      ctx.fillStyle = it.dot;
      ctx.beginPath();
      ctx.arc(tx + o.h * 0.14, y + o.h / 2, o.h * 0.14, 0, Math.PI * 2);
      ctx.fill();
      tx += o.h * 0.45;
    }
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(it.t, tx, y + o.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    x += w + o.gap;
  }
}

export function makeQr(text) {
  if (!text) return null;
  for (const ec of ['L', 'M']) {
    try {
      const q = qrcode(0, ec);
      q.addData(text);
      q.make();
      return q;
    } catch {
      // too long for this level, try the next
    }
  }
  return null;
}

// Soft QR: round dots, rounded finder eyes, optional tile.
function drawQr(ctx, q, x, y, size, o) {
  const n = q.getModuleCount();
  const quiet = o.quiet ?? 2;
  const cell = size / (n + quiet * 2);
  const ox = x + quiet * cell;
  const oy = y + quiet * cell;
  if (o.bg) {
    roundRect(ctx, x, y, size, size, o.radius || 0);
    ctx.fillStyle = o.bg;
    ctx.fill();
  }
  const isEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  ctx.fillStyle = o.fg;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isEye(r, c) || !q.isDark(r, c)) continue;
      ctx.beginPath();
      ctx.arc(ox + (c + 0.5) * cell, oy + (r + 0.5) * cell, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ].forEach(([r, c]) => {
    const ex = ox + c * cell;
    const ey = oy + r * cell;
    ctx.fillStyle = o.fg;
    roundRect(ctx, ex, ey, 7 * cell, 7 * cell, cell * 2.2);
    ctx.fill();
    ctx.fillStyle = o.bg || o.hole;
    roundRect(ctx, ex + cell, ey + cell, 5 * cell, 5 * cell, cell * 1.5);
    ctx.fill();
    ctx.fillStyle = o.eye || o.fg;
    roundRect(ctx, ex + 2 * cell, ey + 2 * cell, 3 * cell, 3 * cell, cell);
    ctx.fill();
  });
}

const profileLine = d => (d.profile ? `${d.labels.pressure} · ${d.profile}` : d.labels.pressure);

function drawDark(ctx, d) {
  const P = 88;
  const ink = '#F6EDE1';
  const sub = 'rgba(246,237,225,.55)';
  const acc = '#E3A86B';
  ctx.fillStyle = '#16100C';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  let g = ctx.createRadialGradient(CARD_W * 0.9, 60, 0, CARD_W * 0.9, 60, 1000);
  g.addColorStop(0, rgba(d.rc, 0.5));
  g.addColorStop(1, rgba(d.rc, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  g = ctx.createRadialGradient(0, CARD_H, 0, 0, CARD_H, 800);
  g.addColorStop(0, 'rgba(224,138,85,.12)');
  g.addColorStop(1, 'rgba(224,138,85,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.textAlign = 'left';
  ctx.fillStyle = acc;
  ctx.font = sansFont(700, 32);
  ctx.fillText(d.title, P, 128);
  ctx.fillStyle = sub;
  ctx.font = sansFont(500, 28);
  ctx.textAlign = 'right';
  ctx.fillText(fmtDate(d.at), CARD_W - P, 128);
  ctx.textAlign = 'left';

  let y = 262;
  ctx.fillStyle = ink;
  ctx.font = sansFont(700, 86);
  wrapLines(ctx, d.name, CARD_W - 2 * P, 2).forEach(l => {
    ctx.fillText(l, P, y);
    y += 104;
  });
  y -= 50;
  pills(
    ctx,
    P,
    y,
    [
      d.roaster && { t: d.roaster },
      d.roast && { t: d.roast, dot: d.rc },
      d.ageText && { t: d.ageText },
    ],
    {
      font: sansFont(500, 28),
      h: 58,
      px: 24,
      gap: 12,
      border: 'rgba(246,237,225,.22)',
      color: ink,
    },
    CARD_W - P,
  );
  y += 130;
  ctx.fillStyle = sub;
  ctx.font = sansFont(500, 26);
  ctx.fillText(profileLine(d), P, y);
  if (d.temp) {
    ctx.textAlign = 'right';
    ctx.fillText(`${d.temp}°C`, CARD_W - P, y);
    ctx.textAlign = 'left';
  }
  const chY = y + 40;
  const chH = d.qr ? 300 : 330;
  plot(ctx, d, {
    x: P + 34,
    y: chY,
    w: CARD_W - 2 * P - 34,
    h: chH,
    stroke: '#E8915A',
    fill: ['rgba(232,145,90,.42)', 'rgba(232,145,90,0)'],
    grid: 'rgba(255,255,255,.07)',
    axis: 'rgba(246,237,225,.38)',
    axisFont: sansFont(500, 23),
    tgtColor: 'rgba(246,237,225,.32)',
    lw: 7,
    dot: true,
  });

  if (d.qr) {
    const y0 = chY + chH + 92;
    const qs = 196;
    const qx = CARD_W - P - qs;
    const qy = CARD_H - 70 - qs;
    drawQr(ctx, d.qr, qx, qy, qs, {
      bg: '#EFE4D5',
      fg: '#24160D',
      eye: '#8E4A22',
      radius: 26,
      quiet: 3,
    });
    ctx.fillStyle = 'rgba(246,237,225,.4)';
    ctx.font = sansFont(500, 19);
    ctx.textAlign = 'right';
    ctx.fillText(d.labels.scan, CARD_W - P, qy - 16);
    ctx.textAlign = 'left';
    const st = scoreText(d.rating);
    ctx.fillStyle = acc;
    ctx.font = sansFont(700, 140);
    ctx.fillText(st, P - 6, y0 + 118);
    const sw = ctx.measureText(st).width;
    ctx.fillStyle = sub;
    ctx.font = sansFont(500, 36);
    ctx.fillText('/5', P + sw, y0 + 118);
    const sx = P + sw + 70;
    drawStars(ctx, sx, y0 + 22, 46, 9, d.rating, acc, 'rgba(246,237,225,.13)');
    ctx.fillStyle = ink;
    ctx.font = sansFont(600, 32);
    ctx.fillText(d.word, sx, y0 + 112);
    let yy = y0 + 200;
    if (d.notes) {
      ctx.font = sansFont(400, 34);
      ctx.fillStyle = 'rgba(246,237,225,.86)';
      const n = Math.max(1, Math.floor((CARD_H - 70 - yy) / 50) + 1);
      wrapLines(ctx, `“${d.notes}”`, qx - 44 - P, Math.min(4, n)).forEach(l => {
        ctx.fillText(l, P, yy);
        yy += 50;
      });
    }
    return;
  }

  y = chY + chH + 190;
  const st = scoreText(d.rating);
  ctx.fillStyle = acc;
  ctx.font = sansFont(700, 150);
  ctx.fillText(st, P - 6, y);
  const sw = ctx.measureText(st).width;
  ctx.fillStyle = sub;
  ctx.font = sansFont(500, 40);
  ctx.fillText('/5', P + sw + 4, y);
  const sx = P + sw + 96;
  drawStars(ctx, sx, y - 118, 56, 12, d.rating, acc, 'rgba(246,237,225,.13)');
  ctx.fillStyle = ink;
  ctx.font = sansFont(600, 36);
  ctx.fillText(d.word, sx, y - 14);
  y += 50;
  ctx.fillStyle = 'rgba(246,237,225,.12)';
  ctx.fillRect(P, y, CARD_W - 2 * P, 2);
  if (d.notes) {
    y += 70;
    ctx.font = sansFont(400, 38);
    const n = Math.max(1, Math.floor((CARD_H - 110 - y) / 58) + 1);
    ctx.fillStyle = 'rgba(246,237,225,.86)';
    wrapLines(ctx, `“${d.notes}”`, CARD_W - 2 * P, Math.min(4, n)).forEach(l => {
      ctx.fillText(l, P, y);
      y += 58;
    });
  }
}

function drawBag(ctx, d) {
  const P = 88;
  const top = 620;
  const dark = '#2B1D14';
  const muted = '#8C7766';
  const c1 = mix(d.rc, '#2B1D14', 0.12);
  const c2 = mix(d.rc, '#2B1D14', 0.5);
  ctx.fillStyle = '#F7F1E8';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const g = ctx.createLinearGradient(0, 0, CARD_W, top);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, top);
  // bean motif
  ctx.save();
  ctx.translate(CARD_W - 120, 250);
  ctx.rotate(0.6);
  ctx.strokeStyle = 'rgba(255,255,255,.13)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, 230, 330, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -330);
  ctx.bezierCurveTo(-90, -120, 90, 120, 0, 330);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = sansFont(700, 32);
  ctx.fillText(d.title, P, 124);
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.font = sansFont(500, 28);
  ctx.textAlign = 'right';
  ctx.fillText(fmtDate(d.at), CARD_W - P, 124);
  ctx.textAlign = 'left';
  let y = 262;
  if (d.roaster) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.font = sansFont(600, 30);
    ctx.fillText(d.roaster, P, y);
  }
  y += 92;
  ctx.fillStyle = '#fff';
  ctx.font = sansFont(700, 82);
  wrapLines(ctx, d.name, CARD_W - 2 * P - 60, 2).forEach(l => {
    ctx.fillText(l, P, y);
    y += 98;
  });
  pills(
    ctx,
    P,
    y - 34,
    [
      d.roast && { t: d.roast },
      d.ageText && { t: d.ageText },
      d.roastedText && { t: d.roastedText },
    ],
    { font: sansFont(500, 27), h: 56, px: 22, gap: 10, bg: 'rgba(255,255,255,.16)', color: '#fff' },
    CARD_W - P - 260,
  );

  // score medallion
  const mx = CARD_W - P - 108;
  const my = top;
  ctx.save();
  ctx.shadowColor = 'rgba(43,29,20,.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#FFFBF5';
  ctx.beginPath();
  ctx.arc(mx, my, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba(d.rc, 0.5);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(mx, my, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.textAlign = 'center';
  ctx.font = sansFont(700, 78);
  ctx.fillText(scoreText(d.rating), mx, my + 20);
  ctx.fillStyle = muted;
  ctx.font = sansFont(500, 24);
  ctx.fillText('/ 5', mx, my + 58);
  ctx.textAlign = 'left';

  y = top + 76;
  const sw = drawStars(ctx, P, y, 54, 10, d.rating, '#D99A2B', '#E6DBCC');
  ctx.fillStyle = dark;
  ctx.font = sansFont(600, 34);
  ctx.fillText(d.word, P + sw + 26, y + 40);

  const qs = 186;
  const qx = CARD_W - P - qs + 8;
  const qy = CARD_H - 14 - 46 - qs;
  if (d.qr) {
    drawQr(ctx, d.qr, qx, qy, qs, {
      fg: mix(d.rc, '#2B1D14', 0.6),
      hole: '#F7F1E8',
      eye: mix(d.rc, '#2B1D14', 0.3),
      quiet: 0,
    });
    ctx.fillStyle = muted;
    ctx.font = sansFont(500, 18);
    ctx.textAlign = 'right';
    ctx.fillText(d.labels.scan, qx + qs, qy + qs + 30);
    ctx.textAlign = 'left';
  }

  y = top + 220;
  ctx.fillStyle = muted;
  ctx.font = sansFont(500, 25);
  ctx.fillText(
    wrapLines(ctx, profileLine(d), CARD_W - 2 * P - (d.temp ? 90 : 0), 1)[0] || '',
    P,
    y,
  );
  if (d.temp) {
    ctx.textAlign = 'right';
    ctx.fillText(`${d.temp}°C`, CARD_W - P, y);
    ctx.textAlign = 'left';
  }
  const ln = mix(d.rc, '#2B1D14', 0.35);
  plot(ctx, d, {
    x: P + 30,
    y: y + 36,
    w: CARD_W - 2 * P - 30,
    h: 240,
    stroke: ln,
    fill: [rgba(ln, 0.22), rgba(ln, 0)],
    grid: 'rgba(43,29,20,.08)',
    axis: 'rgba(43,29,20,.38)',
    axisFont: sansFont(500, 22),
    tgtColor: 'rgba(43,29,20,.28)',
    lw: 6,
    dot: true,
  });
  y += 36 + 240 + 96;
  if (d.notes) {
    ctx.font = sansFont(400, 36);
    ctx.fillStyle = '#3E2D22';
    const n = Math.max(1, Math.floor((CARD_H - 100 - y) / 54) + 1);
    wrapLines(ctx, d.notes, d.qr ? qx - 40 - P : CARD_W - 2 * P, Math.min(4, n)).forEach(l => {
      ctx.fillText(l, P, y);
      y += 54;
    });
  }
  ctx.fillStyle = rgba(d.rc, 0.9);
  ctx.fillRect(0, CARD_H - 14, CARD_W, 14);
}

function drawTicket(ctx, d) {
  const ink = '#2B1D14';
  const mut = '#8E7C6D';
  const paper = '#FFFDF8';
  ctx.fillStyle = mix(d.rc, '#EFE8DE', 0.78);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const px = 120;
  const py = 70;
  const pw = CARD_W - 240;
  const ph = CARD_H - 140;
  const tooth = 18;
  ctx.save();
  ctx.shadowColor = 'rgba(43,29,20,.22)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.moveTo(px, py + tooth);
  for (let x = px; x < px + pw; x += tooth * 2) {
    ctx.lineTo(x + tooth, py);
    ctx.lineTo(Math.min(x + tooth * 2, px + pw), py + tooth);
  }
  ctx.lineTo(px + pw, py + ph - tooth);
  for (let x = px + pw; x > px; x -= tooth * 2) {
    ctx.lineTo(x - tooth, py + ph);
    ctx.lineTo(Math.max(x - tooth * 2, px), py + ph - tooth);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const L = px + 64;
  const R = px + pw - 64;
  const C = CARD_W / 2;
  const dash = y => {
    ctx.save();
    ctx.strokeStyle = 'rgba(43,29,20,.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.moveTo(L, y);
    ctx.lineTo(R, y);
    ctx.stroke();
    ctx.restore();
  };
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = sansFont(700, 54);
  ctx.fillText(d.title, C, py + 120);
  ctx.fillStyle = mut;
  ctx.font = monoFont(500, 22);
  const d0 = new Date(d.at);
  const pad = v => String(v).padStart(2, '0');
  ctx.fillText(
    `ESPRESSO REVIEW  No.${pad(d0.getMonth() + 1)}${pad(d0.getDate())}-${pad(d0.getHours())}${pad(d0.getMinutes())}`,
    C,
    py + 164,
  );
  let y = py + 200;
  dash(y);
  y += 74;
  ctx.fillStyle = ink;
  ctx.font = sansFont(700, 46);
  wrapLines(ctx, d.name, R - L, 2).forEach(l => {
    ctx.fillText(l, C, y);
    y += 58;
  });
  ctx.textAlign = 'left';
  y += 6;
  const row = (k, v) => {
    ctx.font = monoFont(500, 27);
    ctx.fillStyle = mut;
    ctx.fillText(k, L, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = ink;
    ctx.fillText(wrapLines(ctx, v, R - L - 170, 1)[0] || '–', R, y);
    ctx.textAlign = 'left';
    y += 50;
  };
  row(d.labels.roaster, d.roaster || '–');
  row(d.labels.roast, [d.roast, d.ageText].filter(Boolean).join(' / ') || '–');
  row(
    d.labels.profile,
    [d.profile, d.temp ? `${d.temp}°C` : ''].filter(Boolean).join(' @ ') || '–',
  );
  y -= 14;
  dash(y);
  const chH = d.qr ? 180 : 220;
  y += 36;
  plot(ctx, d, {
    x: L + 28,
    y,
    w: R - L - 28,
    h: chH,
    stroke: ink,
    grid: 'rgba(43,29,20,.18)',
    dotGrid: true,
    axis: mut,
    axisFont: monoFont(500, 20),
    tgtColor: 'rgba(43,29,20,.35)',
    lw: 5,
  });
  y += chH + 70;
  dash(y);
  y += 70;
  ctx.font = monoFont(500, 27);
  ctx.fillStyle = mut;
  ctx.fillText(d.labels.rating, L, y);
  ctx.fillStyle = ink;
  ctx.font = sansFont(700, 44);
  ctx.textAlign = 'right';
  const st = scoreText(d.rating);
  ctx.fillText(st, R, y + 4);
  const sw = ctx.measureText(st).width;
  ctx.textAlign = 'left';
  drawStars(ctx, R - sw - 24 - 5 * 40 - 4 * 8, y - 34, 40, 8, d.rating, ink, '#E6DDD0');
  y += 50;
  ctx.font = monoFont(500, 24);
  ctx.fillStyle = mut;
  ctx.textAlign = 'right';
  ctx.fillText(d.word, R, y);
  ctx.textAlign = 'left';

  if (d.qr) {
    y += 36;
    dash(y);
    const qs = 190;
    const qx = R - qs;
    const qy = y + 30;
    drawQr(ctx, d.qr, qx, qy, qs, { fg: ink, hole: paper, quiet: 0 });
    ctx.font = monoFont(500, 17);
    ctx.fillStyle = mut;
    ctx.textAlign = 'center';
    ctx.fillText(d.labels.scan, qx + qs / 2, qy + qs + 30);
    ctx.textAlign = 'left';
    if (d.notes) {
      let ny = qy + 40;
      ctx.font = monoFont(400, 28);
      ctx.fillStyle = ink;
      const n = Math.max(1, Math.floor((py + ph - 96 - ny) / 42) + 1);
      wrapLines(ctx, d.notes, qx - 32 - L, Math.min(6, n)).forEach(l => {
        ctx.fillText(l, L, ny);
        ny += 42;
      });
    }
    ctx.textAlign = 'center';
    ctx.font = monoFont(500, 21);
    ctx.fillStyle = mut;
    ctx.fillText(`${fmtDate(d.at)}   THANK YOU`, C, py + ph - 48);
    ctx.textAlign = 'left';
    return;
  }
  const barTop = py + ph - 180;
  if (d.notes) {
    y += 58;
    ctx.font = monoFont(400, 28);
    ctx.fillStyle = ink;
    const n = Math.max(0, Math.floor((barTop - 40 - y) / 44) + 1);
    wrapLines(ctx, d.notes, R - L, Math.min(4, n)).forEach(l => {
      ctx.fillText(l, L, y);
      y += 44;
    });
  }
  dash(barTop - 26);
  let seed = d.at % 2147483647 || 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let bx = C - 230;
  ctx.fillStyle = ink;
  while (bx < C + 230) {
    const w = 1 + Math.floor(rnd() * 4) * 2;
    ctx.fillRect(bx, barTop, w, 64);
    bx += w + 2 + Math.floor(rnd() * 3) * 2;
  }
  ctx.textAlign = 'center';
  ctx.font = monoFont(500, 21);
  ctx.fillStyle = mut;
  ctx.fillText(`${fmtDate(d.at)}   THANK YOU`, C, barTop + 100);
  ctx.textAlign = 'left';
}

export const CARD_TEMPLATES = { dark: drawDark, bag: drawBag, ticket: drawTicket };

export function renderShareCard(canvas, template, data) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  (CARD_TEMPLATES[template] || drawDark)(ctx, data);
}
