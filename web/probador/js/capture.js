/* Captura guiada: revisión de calidad de la foto, recorte del fondo y puntos sugeridos.
   Todo corre en el navegador; en la versión con backend el recorte se puede pasar a un modelo (BiRefNet) en la nube. */

export function loadToCanvas(img, max = 1100) {
  const r = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement("canvas");
  c.width = Math.round((img.naturalWidth || img.width) * r); c.height = Math.round((img.naturalHeight || img.height) * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* Revisa luz, nitidez y fondo. Devuelve una lista de chequeos con mensaje para la tienda. */
export function checkQuality(canvas) {
  const s = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
  const w = Math.max(8, Math.round(canvas.width * s)), h = Math.max(8, Math.round(canvas.height * s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; L[i] = v; sum += v; }
  const mean = sum / (w * h);
  // Nitidez: varianza del laplaciano
  let lsum = 0, lsq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
    const i = y * w + xx, lap = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w];
    lsum += lap; lsq += lap * lap; n++;
  }
  const sharp = lsq / n - (lsum / n) ** 2;
  // Fondo: qué tan parejo es el borde de la foto
  const border = [];
  for (let xx = 0; xx < w; xx++) { border.push(xx, (h - 1) * w + xx); }
  for (let y = 0; y < h; y++) { border.push(y * w, y * w + w - 1); }
  let bs = 0, bq = 0; border.forEach(i => { bs += L[i]; bq += L[i] * L[i]; });
  const bmean = bs / border.length, bstd = Math.sqrt(Math.max(0, bq / border.length - bmean * bmean));
  // Contraste prenda/fondo: centro vs borde
  let cs = 0, cn = 0;
  for (let y = Math.round(h * .35); y < h * .65; y++) for (let xx = Math.round(w * .35); xx < w * .65; xx++) { cs += L[y * w + xx]; cn++; }
  const contrast = Math.abs(cs / cn - bmean);

  return [
    { id: "luz", ok: mean > 70 && mean < 235, label: "Luz",
      msg: mean <= 70 ? "Está oscura. Acércate a una ventana o prende más luz." : mean >= 235 ? "Está quemada. Evita el sol directo o el flash." : "Buena luz." },
    { id: "nitidez", ok: sharp > 60, label: "Nitidez",
      msg: sharp > 60 ? "Se ve nítida." : "Se ve movida o borrosa. Apoya el celular y toma de nuevo." },
    { id: "fondo", ok: bstd < 28, label: "Fondo parejo",
      msg: bstd < 28 ? "Fondo liso, se puede recortar." : "El fondo tiene objetos o sombras. Usa una sábana o pared lisa." },
    { id: "contraste", ok: contrast > 18, label: "Contraste",
      msg: contrast > 18 ? "La prenda se distingue del fondo." : "La prenda y el fondo tienen tono parecido. Usa un fondo más claro u oscuro." },
  ];
}

/* Quita el fondo: inunda desde los bordes todo lo que se parece al color del fondo.
   Funciona bien con prendas sobre superficie lisa (lo que pide la guía). tol: 10–80. */
export function removeBackground(src, tol = 38) {
  const w = src.width, h = src.height;
  const x = src.getContext("2d");
  const im = x.getImageData(0, 0, w, h), d = im.data;
  // Color de fondo = mediana del borde
  const samp = [[], [], []];
  const push = i => { samp[0].push(d[i * 4]); samp[1].push(d[i * 4 + 1]); samp[2].push(d[i * 4 + 2]); };
  for (let xx = 0; xx < w; xx += 2) { push(xx); push((h - 1) * w + xx); }
  for (let y = 0; y < h; y += 2) { push(y * w); push(y * w + w - 1); }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  const bg = samp.map(med);
  const t2 = tol * tol * 3;
  const isBg = i => { const r = d[i * 4] - bg[0], g = d[i * 4 + 1] - bg[1], b = d[i * 4 + 2] - bg[2]; return r * r + g * g + b * b < t2; };
  const mask = new Uint8Array(w * h); // 1 = fondo
  const stack = new Int32Array(w * h); let sp = 0;
  const seed = i => { if (!mask[i] && isBg(i)) { mask[i] = 1; stack[sp++] = i; } };
  for (let xx = 0; xx < w; xx++) { seed(xx); seed((h - 1) * w + xx); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const i = stack[--sp], xx = i % w, y = (i / w) | 0;
    if (xx > 0) seed(i - 1); if (xx < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
  }
  // Quita islas pequeñas de "prenda" sueltas (pelusas, sombras)
  const fg = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) fg[i] = mask[i] ? 0 : 1;
  const label = new Int32Array(w * h); let best = 0, bestSize = 0, lab = 0; const sizes = [0];
  for (let i = 0; i < w * h; i++) if (fg[i] && !label[i]) {
    lab++; let size = 0; sp = 0; stack[sp++] = i; label[i] = lab;
    while (sp) { const j = stack[--sp]; size++; const xx = j % w, y = (j / w) | 0;
      const nb = [xx > 0 ? j - 1 : -1, xx < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1];
      for (const k of nb) if (k >= 0 && fg[k] && !label[k]) { label[k] = lab; stack[sp++] = k; } }
    sizes.push(size); if (size > bestSize) { bestSize = size; best = lab; }
  }
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) keep[i] = label[i] && (label[i] === best || sizes[label[i]] > bestSize * 0.15) ? 1 : 0;
  // Borde suave (1 px)
  const out = x.createImageData(w, h), o = out.data;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = y * w + xx;
    let a = keep[i];
    if (a) { minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, x2 = xx + dx; if (yy >= 0 && yy < h && x2 >= 0 && x2 < w) { s += keep[yy * w + x2]; c++; } }
    o[i * 4] = d[i * 4]; o[i * 4 + 1] = d[i * 4 + 1]; o[i * 4 + 2] = d[i * 4 + 2]; o[i * 4 + 3] = Math.round(255 * (a ? (0.4 + 0.6 * s / c) : 0.6 * s / c > 0.45 ? 0.25 : 0));
  }
  const coverage = bestSize / (w * h);
  if (maxX <= minX || maxY <= minY) return { canvas: null, coverage: 0 };
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const full = document.createElement("canvas"); full.width = w; full.height = h; full.getContext("2d").putImageData(out, 0, 0);
  const crop = document.createElement("canvas"); crop.width = maxX - minX + 1; crop.height = maxY - minY + 1;
  crop.getContext("2d").drawImage(full, -minX, -minY);
  return { canvas: crop, coverage, offset: { x: minX, y: minY } };
}

/* Elige la sensibilidad del recorte: la más alta que no se coma la prenda.
   Con prenda clara sobre fondo claro (camisa blanca en fondo blanco) baja sola hasta ~8. */
export function autoTolerance(src) {
  const s = Math.min(1, 360 / Math.max(src.width, src.height));
  const c = document.createElement("canvas"); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  const cov = t => { c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return removeBackground(c, t).coverage; };
  const tols = [38, 26, 17, 11, 7], v = tols.map(cov), ref = Math.max(...v);
  for (let i = 0; i < tols.length; i++) if (v[i] >= ref * 0.88) return tols[i];
  return 7;
}

/* Sugiere hombros y ruedo a partir de la silueta recortada. La tienda los puede mover. */
export function guessAnchors(c) {
  const w = c.width, h = c.height, d = c.getContext("2d").getImageData(0, 0, w, h).data;
  const on = (xx, y) => d[(y * w + xx) * 4 + 3] > 128;
  let top = 0, bottom = h - 1;
  while (top < h - 1 && ![...Array(w).keys()].some(xx => on(xx, top))) top++;
  while (bottom > top && ![...Array(w).keys()].some(xx => on(xx, bottom))) bottom--;
  const cx = Math.round(w / 2);
  const run = y => { // tramo continuo de prenda que contiene el centro (o el más cercano)
    let c0 = cx; if (!on(c0, y)) { let k = 1; while (k < w / 2 && !on(cx - k, y) && !on(cx + k, y)) k++; c0 = on(cx - k, y) ? cx - k : cx + k; }
    let l = c0, r = c0; while (l > 0 && on(l - 1, y)) l--; while (r < w - 1 && on(r + 1, y)) r++;
    return [l, r];
  };
  const H = bottom - top;
  const yS = Math.round(top + H * 0.1), yH = Math.round(bottom - H * 0.03);
  let [sl, sr] = run(yS); let [hl, hr] = run(yH);
  // Ancho real del torso: filas bajas donde las mangas (caídas junto al cuerpo) ya se separan del torso
  let side = torsoSides(on, run, top, H, w);
  if (!side) { // mangas caídas pegadas al torso (foto de catálogo): la fila del pecho incluye las dos mangas
    const r = run(Math.round(top + H * 0.45));
    if (r && r[1] - r[0] > (hr - hl) * 1.35) { const cw = r[1] - r[0]; side = [r[0] + cw * 0.19, r[1] - cw * 0.19]; }
  }
  if (side) { hl = Math.min(Math.max(hl, side[0] - (side[1] - side[0]) * 0.04), side[0] + (side[1] - side[0]) * 0.06); hr = Math.max(Math.min(hr, side[1] + (side[1] - side[0]) * 0.04), side[1] - (side[1] - side[0]) * 0.06); }
  // Si el tramo de los hombros incluye mangas abiertas, recórtalo al ancho del torso + 18 %
  const chestW = side ? side[1] - side[0] : hr - hl, maxSh = chestW * 1.18;
  if (sr - sl > maxSh) { const m = (sl + sr) / 2; sl = m - maxSh / 2; sr = m + maxSh / 2; }
  if (side) { // hombro: primera fila (desde arriba) donde la prenda llega al costado del torso
    const shoulder = sd => { for (let y = top; y < top + H * 0.3; y++) { const r = run(y); if (!r) continue;
        if (sd < 0 ? r[0] <= side[0] + chestW * 0.02 : r[1] >= side[1] - chestW * 0.02) return { x: side[sd < 0 ? 0 : 1] + sd * chestW * 0.02, y: Math.max(y, top + H * 0.06) }; }
      return null; };
    const a = shoulder(-1), b = shoulder(1);
    if (a && b) return { sL: a, sR: b, hL: { x: hl, y: yH }, hR: { x: hr, y: yH } };
  }
  return { sL: { x: sl + (sr - sl) * 0.08, y: yS }, sR: { x: sr - (sr - sl) * 0.08, y: yS }, hL: { x: hl, y: yH }, hR: { x: hr, y: yH } };
}

/* Sugiere los puntos de manga (Módulo A1): axila, codo y puño de cada lado, y el tipo de manga.
   c: prenda recortada; a: puntos de hombros y ruedo ya ubicados. La tienda los puede mover. */
export function guessSleeves(c, a) {
  const w = c.width, h = c.height, d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 128;
  const yS = Math.round((a.sL.y + a.sR.y) / 2), yH = Math.round((a.hL.y + a.hR.y) / 2), torsoH = Math.max(10, yH - yS);
  const cx = Math.round((a.sL.x + a.sR.x + a.hL.x + a.hR.x) / 4);
  const run = y => { // tramo continuo que contiene el centro
    if (!on(cx, y)) return null; let l = cx, r = cx;
    while (l > 0 && on(l - 1, y)) l--; while (r < w - 1 && on(r + 1, y)) r++; return [l, r];
  };
  const minDepth = Math.round(torsoH * 0.16), margin = w * 0.035;
  const armpit = (side) => {
    const s = side < 0 ? a.sL : a.sR, hm = side < 0 ? a.hL : a.hR, sideX = hm.x;
    for (let y = yS + minDepth; y < yS + torsoH * 0.6; y++) {
      const r = run(y), r2 = run(y + 3); if (!r || !r2) continue;
      const edge = side < 0 ? r[0] : r[1], edge2 = side < 0 ? r2[0] : r2[1];
      const inside = side < 0 ? (edge >= sideX - margin && edge2 >= sideX - margin) : (edge <= sideX + margin && edge2 <= sideX + margin);
      if (inside) return { x: edge, y };
    }
    return { x: hm.x, y: yS + torsoH * 0.3 };
  };
  const aL = armpit(-1), aR = armpit(1);
  const seam = (y, s, ap, hm) => y <= s.y ? s.x : y <= ap.y ? s.x + (ap.x - s.x) * (y - s.y) / Math.max(1, ap.y - s.y) : y <= hm.y ? ap.x + (hm.x - ap.x) * (y - ap.y) / Math.max(1, hm.y - ap.y) : hm.x;
  let total = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 128) total++;
  const sleeve = side => {
    const s = side < 0 ? a.sL : a.sR, ap = side < 0 ? aL : aR, hm = side < 0 ? a.hL : a.hR;
    const root = { x: (s.x + ap.x) / 2, y: (s.y + ap.y) / 2 };
    const pts = []; let mx = 0, my = 0;
    for (let y = 0; y < h; y += 2) { const sx = seam(y, s, ap, hm);
      for (let x = 0; x < w; x += 2) if (on(x, y) && (side < 0 ? x < sx - 2 : x > sx + 2)) { pts.push(x, y); mx += x; my += y; } }
    const n = pts.length / 2;
    if (n < total * 0.03) return { n, len: 0, root };
    mx /= n; my /= n;
    let dir = { x: mx - root.x, y: my - root.y }; const dl = Math.hypot(dir.x, dir.y) || 1; dir = { x: dir.x / dl, y: dir.y / dl };
    const nrm = { x: -dir.y, y: dir.x };
    const proj = []; for (let i = 0; i < pts.length; i += 2) proj.push((pts[i] - root.x) * dir.x + (pts[i + 1] - root.y) * dir.y);
    const sorted = [...proj].sort((p, q) => p - q), L = Math.max(4, sorted[Math.floor(sorted.length * 0.99)]);
    const bins = new Map(), B = Math.max(2, L / 40);
    for (let i = 0; i < proj.length; i++) { const b = Math.round(proj[i] / B), pp = (pts[i * 2] - root.x) * nrm.x + (pts[i * 2 + 1] - root.y) * nrm.y;
      const o = bins.get(b) || { s: 0, n: 0 }; o.s += pp; o.n++; bins.set(b, o); }
    const centerAt = q => { let b = Math.round(q / B), o = null; for (let k = 0; k < 6 && !o; k++) o = bins.get(b - k) || bins.get(b + k);
      const pp = o ? o.s / o.n : 0; return { x: root.x + dir.x * q + nrm.x * pp, y: root.y + dir.y * q + nrm.y * pp }; };
    return { n, len: L, root, e: centerAt(L * 0.47), c: centerAt(L * 0.95) };
  };
  const L = sleeve(-1), R = sleeve(1);
  const lenAvg = (L.len + R.len) / 2;
  const type = L.len === 0 && R.len === 0 ? "none" : lenAvg < torsoH * 0.5 ? "short" : "long";
  const fb = (S, side) => { // valores por defecto si un lado no se encontró
    const s = side < 0 ? a.sL : a.sR, out = { x: s.x + side * torsoH * 0.25, y: s.y + torsoH * 0.35 };
    return { e: S.e || out, c: S.c || { x: s.x + side * torsoH * 0.4, y: s.y + torsoH * 0.75 } };
  };
  const fL = fb(L, -1), fR = fb(R, 1);
  return { ...a, aL, aR, eL: fL.e, cL: fL.c, eR: fR.e, cR: fR.c, sleeve: type };
}

/* Bordes del torso en las filas bajas (55–95 % del alto) donde el tramo central es claramente
   más angosto que el más ancho: ahí las mangas caídas ya no tocan el torso. null si no se separan. */
function torsoSides(on, run, top, H, w) {
  const rows = [];
  const beside = (y, r) => { let L = false, R = false; for (let x = 0; x < r[0] - 2 && !L; x += 2) L = on(x, y); for (let x = r[1] + 3; x < w && !R; x += 2) R = on(x, y); return L && R; };
  for (let y = Math.round(top + H * 0.45); y < top + H * 0.95; y += 2) { const r = run(y); if (r) rows.push([...r, beside(y, r)]); }
  if (rows.length < 5) return null;
  const widths = rows.map(r => r[1] - r[0]), maxW = Math.max(...widths);
  const narrow = rows.filter((r, i) => r[2] && widths[i] > maxW * 0.35);
  if (narrow.length < 4) return null;
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(narrow.map(r => r[0])), med(narrow.map(r => r[1]))];
}

export const canvasToBlob = (c, type = "image/png", q) => new Promise(r => c.toBlob(r, type, q));
export async function blobToImage(blob) { const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img; }
