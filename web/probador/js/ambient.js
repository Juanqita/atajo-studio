/* Luz del ambiente (A4) y brazos por delante (A5).
   Ambient: mide brillo y tono del video alrededor del torso y devuelve un multiplicador RGB
   para la prenda, así una camisa blanca no brilla más que la persona en una sala oscura.
   HandOcclusion: cuando la mano (o el antebrazo, si la prenda es de manga corta o sin manga)
   pasa por delante del torso, vuelve a pintar encima de la prenda los píxeles de piel del video.
   La piel se separa con el tono de la cara (Cr/Cb), dentro de la forma de la mano que da
   MediaPipe Pose (muñeca, meñique, índice y pulgar). Corre sobre recortes pequeños. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Ambient {
  constructor() {
    this.c = document.createElement("canvas"); this.c.width = this.c.height = 16;
    this.x = this.c.getContext("2d", { willReadFrequently: true });
    this.tint = [1, 1, 1]; this.target = [1, 1, 1]; this.last = 0;
  }
  /* source: video o imagen; body en pantalla; mapBack: pantalla -> coordenadas de la fuente */
  sample(source, B, frame, mapBack) {
    const now = performance.now();
    if (now - this.last > 250) {
      this.last = now;
      try {
        // rectángulo alrededor del torso (hombros a caderas, un poco más ancho), en la fuente
        const pts = [B.s11, B.s12, frame.hipMid].map(mapBack);
        const sw = Math.abs(pts[0].x - pts[1].x) || 1;
        const x0 = Math.min(pts[0].x, pts[1].x) - sw * .6, x1 = Math.max(pts[0].x, pts[1].x) + sw * .6;
        const y0 = Math.min(pts[0].y, pts[1].y) - sw * .7, y1 = Math.max(pts[2].y, y0 + sw);
        this.x.drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, 16, 16);
        const d = this.x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4; r /= n; g /= n; b /= n;
        const lum = .299 * r + .587 * g + .114 * b || 1;
        // brillo: escena típica de interior ≈ 120; se limita para no apagar ni quemar la prenda
        const k = clamp(Math.pow(lum / 125, .6), .62, 1.06);
        // tono: solo un 35 % del color de la luz, para no teñir la prenda
        const cast = [r / lum, g / lum, b / lum].map(c => clamp(1 + (c - 1) * .35, .85, 1.15));
        this.target = cast.map(c => c * k);
      } catch { /* video aún sin cuadro o recurso sin permiso */ }
    }
    this.tint = this.tint.map((t, i) => t + (this.target[i] - t) * .08);
    return this.tint;
  }
}

/* RGB -> (Cr, Cb) */
const crcb = (r, g, b) => [128 + .5 * r - .4187 * g - .0813 * b, 128 - .1687 * r - .3313 * g + .5 * b];

export class HandOcclusion {
  constructor() {
    this.work = document.createElement("canvas"); this.wx = this.work.getContext("2d", { willReadFrequently: true });
    this.mask = document.createElement("canvas"); this.mx = this.mask.getContext("2d");
    this.face = document.createElement("canvas"); this.face.width = this.face.height = 8; this.fx = this.face.getContext("2d", { willReadFrequently: true });
    this.skin = null; this.lastFace = 0;
  }
  sampleSkin(source, B, F) {
    const now = performance.now(); if (this.skin && now - this.lastFace < 600) return;
    this.lastFace = now;
    try {
      const sw = len(B.s11, B.s12), r = sw * .09;
      const nose = B.nose, cx = (F.W - nose.x - F.dx) / F.s, cy = (nose.y + sw * .08 - F.dy) / F.s, rr = r / F.s;
      this.fx.drawImage(source, cx - rr, cy - rr, rr * 2, rr * 2, 0, 0, 8, 8);
      const d = this.fx.getImageData(0, 0, 8, 8).data, cr = [], cb = [];
      for (let i = 0; i < d.length; i += 4) { const [a, b] = crcb(d[i], d[i + 1], d[i + 2]); cr.push(a); cb.push(b); }
      const med = a => a.sort((p, q) => p - q)[a.length >> 1];
      const s = [med(cr), med(cb)];
      // si la cara no parece piel (pelo, tapabocas, poca luz) se usa un rango de piel general
      const plausible = s[0] > 133 && s[0] < 180 && s[1] > 77 && s[1] < 130;
      this.skin = plausible ? s : [150, 108];
    } catch { this.skin = [150, 108]; }
  }
  /* Dibuja encima de la prenda la piel de manos (y antebrazos si la manga es corta) que pasan por delante. */
  draw(ctx, source, B, F, item, frame) {
    if (!frame || !B.nose) return;
    const sleeve = frame.sleeveType || item?.g?.anchors?.sleeve || "long";
    const bare = sleeve === "short" || sleeve === "none";
    const sw = len(B.s11, B.s12);
    const zones = [];
    for (const [w, e, p, i, t, sl] of [[B.w12, B.e12, B.p18, B.i20, B.t22, frame.sleeves.find(s => s.piece === 2)], [B.w11, B.e11, B.p17, B.i19, B.t21, frame.sleeves.find(s => s.piece === 3)]]) {
      if (!w || w.v < .5) continue;
      const inFront = sl ? sl.front : insideQuad(w, frame.torsoQuad);
      if (!inFront && !insideQuad(w, frame.torsoQuad)) continue;
      const hand = [w, p, i, t].filter(q => q && q.v > .3);
      const tip = hand.length > 1 ? hand.slice(1).reduce((a, q) => ({ x: a.x + q.x / (hand.length - 1), y: a.y + q.y / (hand.length - 1) }), { x: 0, y: 0 }) : w;
      // la mano se extiende más allá de los puntos de índice y meñique (hasta la punta de los dedos)
      const ext = { x: tip.x + (tip.x - w.x) * .9, y: tip.y + (tip.y - w.y) * .9 };
      zones.push({ a: bare && e ? e : w, b: ext, r: sw * (bare ? .16 : .14), hand: [w, ...hand.slice(1), ext] });
    }
    if (!zones.length) return;
    this.sampleSkin(source, B, F);
    for (const z of zones) this.paintZone(ctx, source, F, z);
  }
  paintZone(ctx, source, F, z) {
    const pad = z.r * 1.2;
    const xs = [z.a.x, z.b.x, ...z.hand.map(p => p.x)], ys = [z.a.y, z.b.y, ...z.hand.map(p => p.y)];
    let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    x0 = clamp(x0, 0, F.W); x1 = clamp(x1, 0, F.W); y0 = clamp(y0, 0, F.H); y1 = clamp(y1, 0, F.H);
    const bw = x1 - x0, bh = y1 - y0; if (bw < 4 || bh < 4) return;
    const sc = Math.min(1, 96 / Math.max(bw, bh)), w = Math.max(4, Math.round(bw * sc)), h = Math.max(4, Math.round(bh * sc));
    if (this.work.width !== w || this.work.height !== h) { this.work.width = w; this.work.height = h; this.mask.width = w; this.mask.height = h; }
    // video en espejo, recortado a la zona
    const wx = this.wx; wx.save(); wx.setTransform(1, 0, 0, 1, 0, 0); wx.clearRect(0, 0, w, h);
    wx.scale(sc, sc); wx.translate(-x0, -y0); wx.translate(F.W, 0); wx.scale(-1, 1);
    wx.drawImage(source, F.dx, F.dy, F.srcW * F.s, F.srcH * F.s); wx.restore();
    const im = wx.getImageData(0, 0, w, h), d = im.data, [sr, sb] = this.skin;
    const A = { x: (z.a.x - x0) * sc, y: (z.a.y - y0) * sc }, Bp = { x: (z.b.x - x0) * sc, y: (z.b.y - y0) * sc }, R = z.r * sc;
    const al = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dist = segDist(x, y, A, Bp); if (dist > R * 1.25) continue;
      const k = (y * w + x) * 4, [cr, cb] = crcb(d[k], d[k + 1], d[k + 2]);
      const dc = Math.hypot((cr - sr) / 14, (cb - sb) / 16); // distancia al tono de piel
      const sk = clamp(1.6 - dc, 0, 1), shape = clamp((R * 1.25 - dist) / (R * .35), 0, 1);
      al[y * w + x] = sk * shape;
    }
    // suavizado 3x3 para que el borde no se vea recortado
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += al[yy * w + xx]; n++; } }
      d[(y * w + x) * 4 + 3] = Math.round(255 * clamp(s / n * 1.3, 0, 1));
    }
    this.mx.putImageData(im, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mask, 0, 0, w, h, x0, y0, bw, bh); ctx.restore();
  }
}

function segDist(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - a.x) * vx + (py - a.y) * vy) / l2, 0, 1);
  return Math.hypot(px - a.x - vx * t, py - a.y - vy * t);
}
function insideQuad(p, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++)
    if (((q[i].y > p.y) !== (q[j].y > p.y)) && (p.x < (q[j].x - q[i].x) * (p.y - q[i].y) / (q[j].y - q[i].y) + q[i].x)) inside = !inside;
  return inside;
}
