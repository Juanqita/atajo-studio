/* Filtros de movimiento del probador (Módulo A2).
   - OneEuro: quita el temblor de los puntos de MediaPipe sin agregar retraso visible
     (Casiez, Roussel y Vogel, CHI 2012). Suaviza mucho cuando el punto está quieto
     y casi nada cuando se mueve rápido.
   - Spring: resorte amortiguado para que ruedo y puños sigan al cuerpo con un leve
     retraso y la prenda se meza. */

const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

export class OneEuro {
  constructor({ minCutoff = 1.2, beta = 0.02, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = 0; this.t = 0;
  }
  reset() { this.x = null; this.dx = 0; }
  filter(v, t) { // t en segundos
    if (this.x === null) { this.x = v; this.t = t; this.dx = 0; return v; }
    const dt = Math.min(0.2, Math.max(1e-3, t - this.t)); this.t = t;
    const d = (v - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (d - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

/* Filtra un punto {x,y,z} con tres filtros One Euro. beta se escala con el tamaño del cuerpo
   en pantalla para que el comportamiento no cambie si la persona está cerca o lejos. */
export class PointFilter {
  constructor(opts = {}) { this.beta = opts.beta ?? 0.02; this.f = [new OneEuro(opts), new OneEuro(opts), new OneEuro(opts)]; }
  reset() { this.f.forEach(f => f.reset()); }
  filter(p, t, scale = 1) {
    for (const f of this.f) f.beta = this.beta / scale;
    return { x: this.f[0].filter(p.x, t), y: this.f[1].filter(p.y, t), z: this.f[2].filter(p.z ?? 0, t), v: p.v };
  }
}

/* Resorte amortiguado 2D. freq en Hz (más alto = más rígido), damping = razón de amortiguamiento
   (1 = sin rebote, 0.5 = rebota un poco). El retraso aproximado es 1/(2π·freq)·2·damping. */
export class Spring {
  constructor(freq = 3, damping = 0.6) { this.freq = freq; this.damping = damping; this.p = null; this.v = { x: 0, y: 0 }; }
  reset() { this.p = null; this.v = { x: 0, y: 0 }; }
  step(target, dt, maxOff = Infinity) {
    if (!this.p) { this.p = { ...target }; return this.p; }
    dt = Math.min(0.05, Math.max(0, dt));
    const w = 2 * Math.PI * this.freq, k = w * w, c = 2 * this.damping * w;
    // dos subpasos semi-implícitos para que sea estable a 15 fps
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      this.v.x += (k * (target.x - this.p.x) - c * this.v.x) * h;
      this.v.y += (k * (target.y - this.p.y) - c * this.v.y) * h;
      this.p.x += this.v.x * h; this.p.y += this.v.y * h;
    }
    const ox = this.p.x - target.x, oy = this.p.y - target.y, o = Math.hypot(ox, oy);
    if (o > maxOff) { this.p.x = target.x + ox / o * maxOff; this.p.y = target.y + oy / o * maxOff; }
    return this.p;
  }
  /* desplazamiento actual respecto al objetivo */
  offset(target) { return this.p ? { x: this.p.x - target.x, y: this.p.y - target.y } : { x: 0, y: 0 }; }
}

/* Rigidez por tipo de prenda: frecuencia del resorte y amortiguamiento.
   stiff 0..1 (0 = muy suelta, 1 = muy rígida). Retraso resultante ≈ 80–150 ms. */
export const STIFFNESS = { blazer: 0.85, jacket: 0.75, dress: 0.3, polo: 0.5, shirt: 0.4, top: 0.25 };
export function springParams(stiff) {
  const s = Math.max(0, Math.min(1, stiff ?? 0.5));
  return { freq: 1.1 + s * 2.1, damping: 0.45 + s * 0.35 }; // suelta ≈130 ms, rígida ≈80 ms
}
