/* Prenda fotografiada con malla deformable (Módulo A: realismo).
   La foto recortada se divide en tres piezas: torso, manga izquierda y manga derecha de la foto.
   - El torso es una malla de 6x8 anclada a hombros, cintura (estimada) y caderas, que se
     angosta en perspectiva cuando la persona gira (profundidad de hombros de MediaPipe).
   - Cada manga es una cinta en dos tramos (brazo y antebrazo) que sigue hombro, codo y muñeca.
   - Ruedo y puños siguen al cuerpo con un resorte amortiguado para que la prenda se meza.
   Se dibuja con WebGL2 (luz del ambiente, sombra en bordes y sombra sobre el cuerpo); si el
   navegador no lo tiene, se usa Canvas 2D con triángulos texturizados (texTri). */
import { guessSleeves } from "./capture.js";
import { Spring, springParams, STIFFNESS } from "./filters.js";

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y }), sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k }), len = a => Math.hypot(a.x, a.y);
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const perp = a => ({ x: -a.y, y: a.x }), dot = (a, b) => a.x * b.x + a.y * b.y;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

const TORSO_COLS = 6, TORSO_ROWS = 8, SLEEVE_ROWS_UP = 7, SLEEVE_ROWS_FORE = 7;
export const PIECE = { torso: 1, left: 2, right: 3 };

/* ---------------- Preparación del activo ---------------- */
const alphaCache = new WeakMap();
function alphaOf(img) {
  let a = alphaCache.get(img); if (a) return a;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3];
  a = { w, h, m, canvas: c }; alphaCache.set(img, a); return a;
}

/* Completa los puntos de manga si la prenda se guardó antes de existir (solo 4 puntos). */
export function fullAnchors(img, anchors) {
  if (anchors.aL && anchors.aR && anchors.sleeve) return anchors;
  return { ...guessSleeves(alphaOf(img).canvas, anchors), ...anchors.aL ? anchors : {} };
}

/* x de la costura (hombro → axila → ruedo) a la altura y, para un lado. */
function seamX(y, s, a, hm) {
  if (y <= s.y) return s.x;
  if (y <= a.y) return s.x + (a.x - s.x) * (y - s.y) / Math.max(1, a.y - s.y);
  if (y <= hm.y) return a.x + (hm.x - a.x) * (y - a.y) / Math.max(1, hm.y - a.y);
  return hm.x;
}

const prepCache = new WeakMap();
/* Devuelve { img, w, h, A (puntos completos), pid (Uint8 por píxel: pieza), sleeves:[...], key } */
export function prepareGarment(img, anchors0) {
  const A = fullAnchors(img, anchors0);
  const key = JSON.stringify(A);
  const cached = prepCache.get(img); if (cached && cached.key === key) return cached;
  const { w, h, m } = alphaOf(img);
  const pid = new Uint8Array(w * h);
  const hasSleeves = A.sleeve !== "none";
  for (let y = 0; y < h; y++) {
    const xl = hasSleeves ? seamX(y, A.sL, A.aL, A.hL) : -1, xr = hasSleeves ? seamX(y, A.sR, A.aR, A.hR) : w + 1;
    for (let x = 0; x < w; x++) { const i = y * w + x; pid[i] = x < xl ? PIECE.left : x > xr ? PIECE.right : PIECE.torso; }
  }
  const torsoH = Math.max(1, (A.hL.y + A.hR.y) / 2 - (A.sL.y + A.sR.y) / 2);
  const sleeves = !hasSleeves ? [] : [-1, 1].map(side => {
    const L = side < 0, s = L ? A.sL : A.sR, a = L ? A.aL : A.aR, piece = L ? PIECE.left : PIECE.right;
    const root = lerp(s, a, .5);
    let e = L ? A.eL : A.eR, c = L ? A.cL : A.cR;
    if (A.sleeve === "short") e = lerp(root, c, .5);
    const rootW = len(sub(s, a));
    const mw = (p, d) => measureWidth(m, pid, w, h, piece, p, perp(d)) || rootW * .8;
    const d1 = norm(sub(e, root)), d2 = norm(sub(c, e));
    const wE = Math.min(rootW * 1.2, mw(e, norm(add(d1, d2)))), wC = Math.min(rootW * 1.1, mw(c, d2));
    return { side, piece, s, a, root, e, c, rootW, wE, wC, len: len(sub(e, root)) + len(sub(c, e)), torsoH };
  });
  // Textura de piezas en dos canales: R = pieza exacta (torso), G = mangas extendidas unos píxeles bajo el
  // torso, para que el borde del torso se funda suave sobre la manga en vez de dejar una línea recta.
  const D = Math.max(3, Math.round(w * .03)), pid2 = new Uint8Array(w * h * 2);
  for (let i = 0; i < w * h; i++) { pid2[i * 2] = pid[i]; pid2[i * 2 + 1] = pid[i] === PIECE.torso ? 0 : pid[i]; }
  if (hasSleeves) for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 1; x < w; x++) if (pid[row + x] === PIECE.torso && pid[row + x - 1] === PIECE.left) { for (let k = 0; k < D && x + k < w && pid[row + x + k] === PIECE.torso; k++) pid2[(row + x + k) * 2 + 1] = PIECE.left; break; }
    for (let x = w - 2; x >= 0; x--) if (pid[row + x] === PIECE.torso && pid[row + x + 1] === PIECE.right) { for (let k = 0; k < D && x - k >= 0 && pid[row + x - k] === PIECE.torso; k++) pid2[(row + x - k) * 2 + 1] = PIECE.right; break; }
  }
  const out = { img, w, h, A, pid, pid2, D, sleeves, key, ver: (cached?.ver || 0) + 1 };
  prepCache.set(img, out);
  return out;
}

function measureWidth(m, pid, w, h, piece, p, n) {
  const on = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return false; const i = y * w + x; return m[i] > 100 && pid[i] === piece; };
  if (!on(p.x, p.y)) return 0;
  const walk = sg => { let t = 0, miss = 0, last = 0; while (t < w && miss < 4) { t++; if (on(p.x + n.x * t * sg, p.y + n.y * t * sg)) { miss = 0; last = t; } else miss++; } return last; };
  return walk(1) + walk(-1);
}

/* Coordenadas bilineales de la foto: (s,t) = (0,0) hombro izq, (1,0) hombro der, (0,1)/(1,1) ruedo. */
function bil(A, s, t) {
  const l = lerp(A.sL, A.hL, t), r = lerp(A.sR, A.hR, t);
  return lerp(l, r, s);
}
function invBil(A, p) { // Newton
  let s = .5, t = .5;
  for (let i = 0; i < 8; i++) {
    const q = bil(A, s, t), e = sub(q, p);
    const ds = sub(bil(A, s + 1e-3, t), q), dt = sub(bil(A, s, t + 1e-3), q);
    const det = ds.x * dt.y - ds.y * dt.x; if (Math.abs(det) < 1e-12) break;
    s -= (e.x * dt.y - e.y * dt.x) / det * 1e-3; t -= (ds.x * e.y - ds.y * e.x) / det * 1e-3;
  }
  return { s, t };
}

/* ---------------- Rig: posición de la malla en pantalla ---------------- */
export class PhotoRig {
  constructor(prep, g = {}) {
    this.prep = prep; this.g = g;
    const p = springParams(g.stiff ?? STIFFNESS[g.kind] ?? 0.5);
    this.springs = { hemL: new Spring(p.freq, p.damping), hemR: new Spring(p.freq, p.damping), cuffL: new Spring(p.freq * 1.15, p.damping), cuffR: new Spring(p.freq * 1.15, p.damping) };
    this.dynamic = true;
    this.torsoRange = this.computeRange();
  }
  setPrep(prep) { if (prep !== this.prep) { this.prep = prep; this.torsoRange = this.computeRange(); } }
  reset() { Object.values(this.springs).forEach(s => s.reset()); }
  computeRange() { // rango (s,t) que cubre el torso recortado, con margen
    const { A, w, h, pid, img } = this.prep, { m } = alphaOf(img);
    let s0 = 0, s1 = 1, t0 = 0, t1 = 1;
    const step = Math.max(2, Math.round(Math.max(w, h) / 160));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = y * w + x; if (m[i] < 60 || pid[i] !== PIECE.torso) continue;
      const q = invBil(A, { x, y }); if (q.s < s0) s0 = q.s; if (q.s > s1) s1 = q.s; if (q.t < t0) t0 = q.t; if (q.t > t1) t1 = q.t;
    }
    return { s0: s0 - .03, s1: s1 + .03, t0: t0 - .03, t1: t1 + .03 };
  }

  /* B: cuerpo en pantalla (s11,s12,e11,e12,w11,w12,h23,h24,visHips, yaw opcional). Devuelve lo necesario para dibujar. */
  update(B, dt = 1 / 30) {
    const { A, sleeves } = this.prep;
    const yaw = clamp(B.yaw || 0, -1.2, 1.2), cosY = Math.max(.45, Math.cos(yaw));
    const near12 = yaw > 0; // el hombro 11 está más lejos: se ve más el lado del 12
    const phi = Math.min(.5, Math.abs(yaw)), off = near12 ? phi : -phi;
    const shMid = lerp(B.s12, B.s11, .5);
    const uS = norm(sub(B.s11, B.s12)); let vS = perp(uS); if (vS.y < 0) vS = mul(vS, -1);
    const swp = len(sub(B.s11, B.s12)), swT = swp / cosY;
    const imgSh = len(sub(A.sR, A.sL)) || 1;
    const k = swT * 1.2 / imgSh; // la costura del hombro cae por fuera de la articulación
    const hipMid = B.visHips ? lerp(B.h24, B.h23, .5) : add(shMid, mul(vS, swT * 1.35));
    let uH = B.visHips ? norm(sub(B.h23, B.h24)) : uS; if (dot(uH, uS) < .3) uH = uS;
    let vH = perp(uH); if (vH.y < 0) vH = mul(vH, -1);
    const imgTop = lerp(A.sL, A.sR, .5), imgHem = lerp(A.hL, A.hR, .5);
    const imgLen = Math.max(1, len(sub(imgHem, imgTop)));
    const want = len(sub(hipMid, shMid)) + swT * .18;
    const ky = Math.min(k * 1.18, Math.max(k * .85, want / imgLen));
    const L = imgLen * ky;
    const P0 = add(shMid, mul(vS, -swT * .03));
    const dirHip = B.visHips ? norm(sub(hipMid, shMid)) : vS;
    const P2 = add(P0, mul(dirHip, L));
    const P1 = lerp(add(P0, mul(vS, L / 2)), sub(P2, mul(vH, L / 2)), .5);
    const center = t => {
      if (t < 0) return add(P0, mul(sub(P1, P0), 2 * t));
      if (t > 1) return add(P2, mul(sub(P2, P1), 2 * (t - 1)));
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      return { x: a * P0.x + b * P1.x + c * P2.x, y: a * P0.y + b * P1.y + c * P2.y };
    };
    // Perspectiva de cilindro: el lado cercano a la cámara se ve más ancho
    const AH = .95, sa = Math.sin(AH + off), sb = Math.sin(-AH + off), mid = (sa + sb) / 2, half = (sa - sb) / 2;
    const dA = Math.cos(AH + off) * AH / half, dB = Math.cos(-AH + off) * AH / half;
    const fx = sg => sg > 1 ? 1 + (sg - 1) * dA : sg < -1 ? -1 + (sg + 1) * dB : (Math.sin(sg * AH + off) - mid) / half;
    const shadeAt = sg => { const a = clamp(sg, -1.3, 1.3) * AH + off; return .78 + .22 * Math.cos(a * .9); };
    const imgW = t => len(sub(lerp(A.sR, A.hR, t), lerp(A.sL, A.hL, t)));
    // Las caderas de MediaPipe son articulaciones: el cuerpo mide ~1,7 veces esa distancia. La prenda no queda más angosta.
    const widen = B.visHips ? clamp(len(sub(B.h23, B.h24)) * 1.7 * 1.04 / Math.max(1, imgW(1) * k * cosY), 1, 1.35) : 1;
    const rigid = (s, t) => {
      const c = center(t), u = norm(lerp(uS, uH, clamp(t, 0, 1)));
      let hw = imgW(t) * k * cosY / 2;
      if (widen > 1 && t > 0) hw *= 1 + (widen - 1) * Math.min(1, t) ** 1.5; // cuerpo más ancho que la prenda en la cadera
      // el centro de la fila en la foto puede no estar en s=.5 si el ruedo está corrido
      return add(c, mul(u, hw * fx((s - .5) * 2)));
    };
    // Resortes: ruedo
    const sp = this.springs, dyn = this.dynamic && dt > 0;
    const hemTL = rigid(0, 1), hemTR = rigid(1, 1), maxOff = swT * .22;
    let oL = { x: 0, y: 0 }, oR = { x: 0, y: 0 };
    if (dyn) { sp.hemL.step(hemTL, dt, maxOff); sp.hemR.step(hemTR, dt, maxOff); oL = sp.hemL.offset(hemTL); oR = sp.hemR.offset(hemTR); }
    const map = (s, t) => {
      const p = rigid(s, t); if (!dyn) return p;
      const wv = clamp(t, 0, 1.2) ** 2, o = lerp(oL, oR, clamp(s, 0, 1));
      return { x: p.x + o.x * wv, y: p.y + o.y * wv };
    };
    // Malla del torso
    const R = this.torsoRange, torso = { pos: [], uv: [], shade: [], cols: TORSO_COLS + 1, rows: TORSO_ROWS + 1 };
    for (let j = 0; j <= TORSO_ROWS; j++) {
      const t = R.t0 + (R.t1 - R.t0) * j / TORSO_ROWS;
      for (let i = 0; i <= TORSO_COLS; i++) {
        const s = R.s0 + (R.s1 - R.s0) * i / TORSO_COLS;
        torso.pos.push(map(s, t)); torso.uv.push(bil(A, s, t)); torso.shade.push(shadeAt((s - .5) * 2));
      }
    }
    // Mangas
    const arms = { [-1]: [B.s12, B.e12, B.w12, sp.cuffL], [1]: [B.s11, B.e11, B.w11, sp.cuffR] };
    const torsoQuad = [map(0, 0), map(1, 0), map(1, 1), map(0, 1)];
    const sl = sleeves.map(S => this.sleeveMesh(S, arms[S.side], map, k, swT, dyn ? dt : 0, torsoQuad, B));
    return { torso, sleeves: sl, k, swT, torsoQuad, shMid, hipMid, sleeveType: A.sleeve };
  }

  sleeveMesh(S, [bs, be, bw, spring], map, k, swT, dt, torsoQuad, B) {
    const { A } = this.prep;
    const qs = invBil(A, S.s), qa = invBil(A, S.a);
    const Ds = map(qs.s, qs.t), Da = map(qa.s, qa.t), Droot = lerp(Ds, Da, .5);
    // Cadena del brazo en pantalla
    let E = be, W = add(bw, mul(norm(sub(bw, be)), swT * .04));
    if (dt > 0) { spring.step(W, dt, swT * .2); W = add(W, mul(spring.offset(W), 1)); }
    const short = this.prep.A.sleeve === "short";
    let srcPts, dstPts, nUp = SLEEVE_ROWS_UP, nFore = SLEEVE_ROWS_FORE;
    if (short) {
      // largo de la manga en pantalla, sin pasar del codo si el brazo se acorta en perspectiva
      const upLen = len(sub(be, Droot)), want = S.len * k * Math.min(1, upLen / (swT * .9 || 1));
      const along = (d) => { const l1 = len(sub(E, Droot)); if (d <= l1) return lerp(Droot, E, d / (l1 || 1)); return lerp(E, W, Math.min(1, (d - l1) / (len(sub(W, E)) || 1))); };
      const end = along(want), midp = along(want / 2);
      srcPts = [S.root, S.e, S.c]; dstPts = [Droot, midp, end]; nUp = 3; nFore = 3;
    } else { srcPts = [S.root, S.e, S.c]; dstPts = [Droot, E, W]; }
    const widths = [S.rootW, S.wE, S.wC].map(v => v * 1.08);
    const rows = [];
    const build = (pts, edgeA, edgeB, wk, sideRef, backK = 1) => {
      const out = [], n = nUp + nFore;
      const d1 = norm(sub(pts[1], pts[0])), d2 = norm(sub(pts[2], pts[1]));
      const L1 = len(sub(pts[1], pts[0])), L2 = len(sub(pts[2], pts[1]));
      // Codo redondeado: cerca del codo el eje sigue una curva (Bézier) en vez de un quiebre,
      // así la manga no hace pico cuando el brazo se dobla mucho.
      const R = Math.min(widths[1] * wk * .6, L1 * .35, L2 * .35);
      const A0 = sub(pts[1], mul(d1, R)), B0 = add(pts[1], mul(d2, R));
      const corner = t => ({ p: add(add(mul(A0, (1 - t) * (1 - t)), mul(pts[1], 2 * (1 - t) * t)), mul(B0, t * t)),
        d: norm(add(mul(sub(pts[1], A0), 2 * (1 - t)), mul(sub(B0, pts[1]), 2 * t))) });
      let prevN = null;
      for (let r = 0; r <= n + 1; r++) {
        const up = r <= nUp, f = r > n ? 1 + .08 : up ? r / nUp : (r - nUp) / nFore;
        let c, d, wid;
        if (up) { c = lerp(pts[0], pts[1], f); d = d1; wid = widths[0] + (widths[1] - widths[0]) * f; }
        else { c = r > n ? add(pts[2], mul(d2, L2 * .08)) : lerp(pts[1], pts[2], f); d = d2; wid = widths[1] + (widths[2] - widths[1]) * Math.min(1, f); }
        const dd = up ? (1 - f) * L1 : f * L2; // distancia al codo
        if (R > 1 && dd < R && r <= n) { const q = corner(up ? .5 - dd / (2 * R) : .5 + dd / (2 * R)); c = q.p; d = q.d; }
        let n2 = perp(d);
        if (prevN ? dot(n2, prevN) < 0 : dot(n2, sub(sideRef, pts[0])) < 0) n2 = mul(n2, -1);
        prevN = n2;
        const hw = wid * wk / 2;
        let e1 = add(c, mul(n2, hw)), e2 = add(c, mul(n2, -hw));
        // cerca de la raíz, la sección se alinea con la costura hombro-axila
        if (up) { const bl = 1 - smooth(f * 2.5); const ext = .12;
          // la raíz entra un poco bajo el torso (lo que cubre la manga extendida de pid2)
          const back = r === 0 ? mul(d1, -this.prep.D * 1.1 * wk * backK) : { x: 0, y: 0 };
          const ra = add(add(edgeA, mul(sub(edgeA, edgeB), ext)), back), rb = add(add(edgeB, mul(sub(edgeB, edgeA), ext)), back);
          e1 = lerp(e1, ra, bl); e2 = lerp(e2, rb, bl); }
        out.push([e1, c, e2]);
      }
      return out;
    };
    const src = build(srcPts, S.s, S.a, 1, S.s);
    // Brazo levantado: la sisa se gira hacia la dirección del brazo para que la raíz no se cruce
    // (el torso se dibuja encima y tapa la unión con la axila).
    const armDir = norm(sub(be, Droot)), down = norm(sub(map(.5, 1), map(.5, 0)));
    const wRaise = smooth((.45 - dot(armDir, down)) / 1.1);
    let Es = Ds, Ea = Da;
    if (wRaise > 0) {
      let nn = perp(armDir); if (dot(nn, sub(Ds, Da)) < 0) nn = mul(nn, -1);
      const hw0 = S.rootW * k / 2;
      const c0 = lerp(Droot, bs, wRaise * .8); // la raíz sube hacia el hombro real
      Es = lerp(Ds, add(c0, mul(nn, hw0)), wRaise); Ea = lerp(Da, add(c0, mul(nn, -hw0)), wRaise);
      dstPts = [lerp(Es, Ea, .5), ...dstPts.slice(1)];
    }
    const dst = build(dstPts, Es, Ea, k, Es, 1 - wRaise);
    // Las filas de la raíz se extienden un poco hacia el torso para que no quede costura abierta
    const pos = [], uv = [], shade = [];
    for (let r = 0; r < src.length; r++) for (let i = 0; i < 3; i++) { pos.push(dst[r][i]); uv.push(src[r][i]); shade.push(i === 1 ? 1 : .8); }
    // ¿El antebrazo cruza por delante del torso?
    const inside = p => pointInQuad(p, shrinkQuad(torsoQuad, .12));
    const zFront = (B.w12?.z !== undefined && bs.z !== undefined) ? (bw.z - bs.z) < -swT * .35 : false;
    const front = inside(bw) || inside(lerp(be, bw, .5)) || zFront;
    return { pos, uv, shade, rows: src.length, cols: 3, nUp, front, piece: S.piece };
  }
}

function shrinkQuad(q, f) { const c = q.reduce((a, p) => add(a, mul(p, .25)), { x: 0, y: 0 }); return q.map(p => lerp(p, c, f)); }
function pointInQuad(p, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    if (((q[i].y > p.y) !== (q[j].y > p.y)) && (p.x < (q[j].x - q[i].x) * (p.y - q[i].y) / (q[j].y - q[i].y) + q[i].x)) inside = !inside;
  }
  return inside;
}

/* Triángulos de una rejilla (cols x rows vértices), opcionalmente solo un rango de filas. */
function gridTris(cols, r0, r1) {
  const t = [];
  for (let r = r0; r < r1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    t.push(a, b, d, b, e, d);
  }
  return t;
}

/* Orden de dibujo: mangas detrás del torso, salvo el antebrazo cuando cruza por delante. */
function drawList(frame) {
  const L = [];
  const behind = [], front = [];
  for (const s of frame.sleeves) {
    behind.push({ mesh: s, tris: gridTris(3, 0, s.nUp), piece: s.piece });
    (s.front ? front : behind).push({ mesh: s, tris: gridTris(3, s.nUp, s.rows - 1), piece: s.piece });
  }
  L.push(...behind, { mesh: frame.torso, tris: gridTris(frame.torso.cols, 0, frame.torso.rows - 1), piece: PIECE.torso }, ...front);
  return L;
}

/* ---------------- Dibujo WebGL2 ---------------- */
const VS = `#version 300 es
in vec2 aPos; in vec2 aUv; in float aShade;
uniform vec2 uRes; uniform vec2 uTex; uniform vec2 uOff;
out vec2 vUv; out float vShade;
void main(){ vec2 p = (aPos + uOff) / uRes * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0, 1); vUv = aUv / uTex; vShade = aShade; }`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUv; in float vShade;
uniform sampler2D uImg; uniform sampler2D uPid; uniform float uPiece; uniform vec3 uTint; uniform float uEdge; uniform vec2 uR;
uniform int uMode; uniform float uShadow;
out vec4 o;
float m(vec2 uv){ vec2 p = texture(uPid, uv).rg * 255.0; float v = uPiece < 1.5 ? p.r : p.g; return step(abs(v - uPiece), 0.5); }
void main(){
  float k = m(vUv);
  if (uMode == 1) { float a = texture(uImg, vUv, 3.5).a * k; o = vec4(0, 0, 0, a * uShadow); return; }
  vec4 c = texture(uImg, vUv); float a = c.a * k; if (a < 0.003) discard;
  // sombra solo en el borde real de la tela (transparencia), no en la unión entre piezas
  float n = 0.0;
  n += texture(uImg, vUv + vec2(uR.x, 0)).a;
  n += texture(uImg, vUv - vec2(uR.x, 0)).a;
  n += texture(uImg, vUv + vec2(0, uR.y)).a;
  n += texture(uImg, vUv - vec2(0, uR.y)).a;
  n *= 0.25;
  if (uPiece < 1.5) { // el torso se desvanece al llegar a la costura con la manga
    vec2 q = uR * 1.6;
    float sft = (m(vUv + vec2(q.x, 0)) + m(vUv - vec2(q.x, 0)) + m(vUv + vec2(0, q.y)) + m(vUv - vec2(0, q.y))) * 0.25;
    a *= mix(0.2, 1.0, sft);
  }
  float edge = mix(1.0, 0.78 + 0.22 * n, uEdge);
  vec3 rgb = c.rgb / max(c.a, 1e-4) * uTint * vShade * edge;
  o = vec4(rgb * a, a);
}`;

class GLRenderer {
  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.gl = this.canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error("sin webgl2");
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = this.prog = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.loc = {}; ["aPos", "aUv", "aShade"].forEach(n => this.loc[n] = gl.getAttribLocation(p, n));
    ["uRes", "uTex", "uOff", "uImg", "uPid", "uPiece", "uTint", "uEdge", "uR", "uMode", "uShadow"].forEach(n => this.loc[n] = gl.getUniformLocation(p, n));
    this.buf = { pos: gl.createBuffer(), uv: gl.createBuffer(), shade: gl.createBuffer(), idx: gl.createBuffer() };
    this.vao = gl.createVertexArray();
    this.tex = new Map(); // prep.img -> {img, pid, ver, w, h, used}
    this.canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); this.lost = true; });
  }
  textures(prep) {
    const gl = this.gl; let t = this.tex.get(prep.img);
    if (!t) {
      t = { img: gl.createTexture(), pid: gl.createTexture(), ver: -1 };
      gl.bindTexture(gl.TEXTURE_2D, t.img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prep.img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      this.tex.set(prep.img, t);
      if (this.tex.size > 5) { // libera la menos usada
        let old = null; for (const [k, v] of this.tex) if (v !== t && (!old || v.used < old[1].used)) old = [k, v];
        if (old) { gl.deleteTexture(old[1].img); gl.deleteTexture(old[1].pid); this.tex.delete(old[0]); }
      }
    }
    if (t.ver !== prep.ver || t.prep !== prep) {
      gl.bindTexture(gl.TEXTURE_2D, t.pid);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, prep.w, prep.h, 0, gl.RG, gl.UNSIGNED_BYTE, prep.pid2);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      t.ver = prep.ver; t.prep = prep;
    }
    t.used = performance.now();
    return t;
  }
  render(W, H, prep, frame, look) {
    const gl = this.gl;
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const T = this.textures(prep), L = this.loc;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.img); gl.uniform1i(L.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.pid); gl.uniform1i(L.uPid, 1);
    gl.uniform2f(L.uRes, W, H); gl.uniform2f(L.uTex, prep.w, prep.h);
    const tint = look.tint || [1, 1, 1]; gl.uniform3f(L.uTint, tint[0], tint[1], tint[2]);
    gl.uniform1f(L.uEdge, look.edge ?? .9);
    const r = Math.max(1.5, Math.max(prep.w, prep.h) * .008); gl.uniform2f(L.uR, r / prep.w, r / prep.h);
    // Un solo búfer con todas las piezas
    const list = drawList(frame), pos = [], uv = [], shade = [], idx = [];
    const ranges = [];
    const meshBase = new Map();
    for (const it of list) {
      let base = meshBase.get(it.mesh);
      if (base === undefined) { base = pos.length / 2; meshBase.set(it.mesh, base); it.mesh.pos.forEach(p => pos.push(p.x, p.y)); it.mesh.uv.forEach(p => uv.push(p.x, p.y)); it.mesh.shade.forEach(s => shade.push(s)); }
      ranges.push({ start: idx.length, count: it.tris.length, piece: it.piece }); it.tris.forEach(i => idx.push(i + base));
    }
    const bind = (b, data, loc, n) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
    bind(this.buf.pos, pos, L.aPos, 2); bind(this.buf.uv, uv, L.aUv, 2); bind(this.buf.shade, shade, L.aShade, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.DYNAMIC_DRAW);
    const draw = () => ranges.forEach(rg => { gl.uniform1f(L.uPiece, rg.piece); gl.drawElements(gl.TRIANGLES, rg.count, gl.UNSIGNED_SHORT, rg.start * 2); });
    if (look.shadow) { // sombra de la prenda sobre el cuerpo
      gl.uniform1i(L.uMode, 1); gl.uniform1f(L.uShadow, look.shadow);
      gl.uniform2f(L.uOff, frame.swT * .012, frame.swT * .035); draw();
    }
    gl.uniform1i(L.uMode, 0); gl.uniform2f(L.uOff, 0, 0); draw();
    return this.canvas;
  }
}

/* ---------------- Respaldo Canvas 2D ---------------- */
const pieceCanvas = new WeakMap();
function piecesFor(prep) {
  let p = pieceCanvas.get(prep); if (p) return p;
  const { w, h, img } = prep; p = {};
  const base = alphaOf(img).canvas.getContext("2d").getImageData(0, 0, w, h);
  for (const k of [PIECE.torso, PIECE.left, PIECE.right]) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const im = new ImageData(new Uint8ClampedArray(base.data), w, h);
    const p2 = prep.pid2, ch = k === PIECE.torso ? 0 : 1;
    for (let i = 0; i < w * h; i++) if (p2[i * 2 + ch] !== k) im.data[i * 4 + 3] = 0;
    c.getContext("2d").putImageData(im, 0, 0); p[k] = c;
  }
  pieceCanvas.set(prep, p); return p;
}
export function texTri(x, img, d0, d1, d2, s0, s1, s2) {
  x.save(); x.beginPath();
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3, gx = p => ({ x: p.x + (p.x - cx) * .03, y: p.y + (p.y - cy) * .03 });
  const a = gx(d0), b = gx(d1), c = gx(d2); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(c.x, c.y); x.closePath(); x.clip();
  const den = s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y; if (!den) { x.restore(); return; }
  const m11 = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / den;
  const m12 = (s1.y * d2.y + s0.y * (d1.y - d2.y) - s2.y * d1.y + (s2.y - s1.y) * d0.y) / den;
  const m21 = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / den;
  const m22 = -(s1.x * d2.y + s0.x * (d1.y - d2.y) - s2.x * d1.y + (s2.x - s1.x) * d0.y) / den;
  const dx = (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) + (s2.x * s1.y - s1.x * s2.y) * d0.x) / den;
  const dy = (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) + (s2.x * s1.y - s1.x * s2.y) * d0.y) / den;
  x.transform(m11, m12, m21, m22, dx, dy);
  // solo la zona del triángulo en la foto, para no pintar la imagen entera
  const minX = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 2), minY = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 2);
  const maxX = Math.min(img.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 2), maxY = Math.min(img.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 2);
  if (maxX > minX && maxY > minY) x.drawImage(img, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
  x.restore();
}
function render2D(x, prep, frame, look) {
  const P = piecesFor(prep);
  x.save();
  for (const it of drawList(frame)) {
    const m = it.mesh, img = P[it.piece];
    for (let i = 0; i < it.tris.length; i += 3) {
      const a = it.tris[i], b = it.tris[i + 1], c = it.tris[i + 2];
      texTri(x, img, m.pos[a], m.pos[b], m.pos[c], m.uv[a], m.uv[b], m.uv[c]);
    }
  }
  x.restore();
  void look;
}

/* ---------------- API ---------------- */
let gl = undefined;
function renderer() {
  if (gl !== undefined) return gl;
  try { gl = new GLRenderer(); } catch (e) { console.warn("WebGL2 no disponible, uso Canvas 2D", e); gl = null; }
  return gl;
}
export const hasGL = () => !!renderer();

/* Dibuja la prenda en el contexto 2D x. look: { tint:[r,g,b], edge:0..1, shadow:0..1 } */
export function renderPhoto(x, prep, frame, look = {}) {
  const r = renderer();
  if (r && !r.lost) {
    try {
      const c = r.render(x.canvas.width, x.canvas.height, prep, frame, look);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(c, 0, 0); x.restore();
      return;
    } catch (e) { console.warn("Falló WebGL, uso Canvas 2D", e); gl = null; }
  }
  render2D(x, prep, frame, look);
}

/* Dibujo de una sola vez (miniaturas, vista previa): sin resortes. */
export function drawPhotoMesh(x, B, img, anchors, g = {}, look = { edge: .8, shadow: 0 }) {
  const prep = prepareGarment(img, anchors);
  const rig = new PhotoRig(prep, g); rig.dynamic = false;
  const frame = rig.update(B, 0);
  renderPhoto(x, prep, frame, look);
  return frame;
}
