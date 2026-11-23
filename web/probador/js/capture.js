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
  return { canvas: crop, coverage };
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
  // Si el tramo de los hombros incluye mangas abiertas, recórtalo al ancho del ruedo + 15 %
  const hemW = hr - hl, maxSh = hemW * 1.15;
  if (sr - sl > maxSh) { const m = (sl + sr) / 2; sl = m - maxSh / 2; sr = m + maxSh / 2; }
  return { sL: { x: sl + (sr - sl) * 0.08, y: yS }, sR: { x: sr - (sr - sl) * 0.08, y: yS }, hL: { x: hl, y: yH }, hR: { x: hr, y: yH } };
}

export const canvasToBlob = (c, type = "image/png", q) => new Promise(r => c.toBlob(r, type, q));
export async function blobToImage(blob) { const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img; }
