/* Probador en vivo embebible: cámara + MediaPipe Pose + prendas de la tienda. */
import { drawGarment, drawPhotoGarment, drawGuide, guideGeom, drawThumb, len, sub, lerp } from "./engine.js";
import { cop } from "./db.js";

let landmarkerP = null;
function getLandmarker(onStatus) {
  if (landmarkerP) return landmarkerP;
  landmarkerP = (async () => {
    onStatus?.("Cargando el modelo de visión…");
    const { PoseLandmarker, FilesetResolver } = await import("../lib/vision_bundle.mjs");
    const base = new URL("../", import.meta.url).href;
    const fileset = await FilesetResolver.forVisionTasks(base + "wasm");
    const opts = d => ({ baseOptions: { modelAssetPath: base + "models/pose_landmarker_lite.task", delegate: d }, runningMode: "VIDEO", numPoses: 1,
      minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5 });
    try { return await PoseLandmarker.createFromOptions(fileset, opts("GPU")); }
    catch (e) { console.warn("GPU no disponible, uso CPU", e); return PoseLandmarker.createFromOptions(fileset, opts("CPU")); }
  })();
  landmarkerP.catch(() => { landmarkerP = null; });
  return landmarkerP;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* items: [{ g, img }] — g es la prenda guardada, img la foto sin fondo (si es fotografiada). */
export function mountTryon(root, { shop, items, totem = false, track = () => {}, exitHref }) {
  root.innerHTML = `
  <div class="to ${totem ? "to-totem" : ""}">
    <canvas class="to-view" aria-label="Vista del probador"></canvas>
    <video class="to-cam" playsinline muted></video>
    <header class="to-top">
      <div class="to-brand">${esc(shop.name)}<small>Probador virtual</small></div>
      <div class="to-tools">
        <button type="button" class="to-btn" data-act="shot">Tomar foto</button>
        ${exitHref ? `<a class="to-btn" href="${exitHref}">Salir</a>` : ""}
      </div>
    </header>
    <p class="to-status" role="status">Cargando…</p>
    <div class="to-meta"></div>
    <div class="to-buy" hidden>
      <div><b class="to-buy-name"></b><span class="to-buy-price"></span></div>
      <a class="to-cta" target="_blank" rel="noopener">Pedir por WhatsApp</a>
    </div>
    <nav class="to-rail" aria-label="Prendas"></nav>
    <div class="to-splash">
      <div class="to-box">
        <h1>Pruébate la ropa de ${esc(shop.name)} sin ir al vestier</h1>
        <p>Elige una prenda, párate dentro de la silueta y la cámara te la pone encima en tiempo real. El video se procesa en tu equipo y no se envía a ningún servidor.</p>
        <div class="to-row">
          <button type="button" class="to-btn to-start" data-act="start">Encender cámara</button>
          <label class="to-btn">Probar con una foto<input type="file" accept="image/*,video/*" data-act="file" hidden></label>
        </div>
        <p class="to-err"></p>
        ${totem ? "" : `<p class="to-tip">Consejo: levanta la mano derecha por encima del hombro un segundo para pasar a la siguiente prenda.</p>`}
      </div>
    </div>
  </div>`;
  const $ = s => root.querySelector(s);
  const cv = $(".to-view"), ctx = cv.getContext("2d"), video = $(".to-cam");
  const statusEl = $(".to-status"), metaEl = $(".to-meta");
  let current = items[0], landmarker = null, source = null, srcW = 0, srcH = 0, isImage = false;
  let perfSent = false, smooth = null, locked = false, alignStart = 0, lostAt = 0, lastSeen = 0, raf = 0, stopped = false, stream = null;
  const gesture = { start: 0, cool: 0 }, stats = { frames: 0, fps: 0, last: performance.now(), detMs: 0 };
  const status = (t, ok) => { statusEl.textContent = t; statusEl.classList.toggle("ok", !!ok); };

  // Riel
  const rail = $(".to-rail");
  items.forEach((it, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "to-card"; b.setAttribute("aria-pressed", i === 0);
    const th = document.createElement("canvas"); th.width = th.height = 200; b.append(th);
    b.insertAdjacentHTML("beforeend", `<b>${esc(it.g.name)}</b><span>${it.g.price ? cop(it.g.price) : ""}</span>`);
    b.onclick = () => select(it);
    rail.append(b); drawThumb(th, it.g, it.img); it.el = b;
  });
  function select(it) {
    current = it;
    items.forEach(o => o.el.setAttribute("aria-pressed", o === it));
    it.el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    track("try", { garmentId: it.g.id });
    updateBuy();
  }
  function updateBuy() {
    const box = $(".to-buy"); if (!locked || !current) { box.hidden = true; return; }
    box.hidden = false;
    $(".to-buy-name").textContent = current.g.name;
    $(".to-buy-price").textContent = current.g.price ? " · " + cop(current.g.price) : "";
    const cta = $(".to-cta");
    if (current.g.link) { cta.href = current.g.link; cta.textContent = "Ver en la tienda"; }
    else {
      const msg = `Hola ${shop.name}, me probé "${current.g.name}"${current.g.price ? " (" + cop(current.g.price) + ")" : ""} en el probador virtual y me interesa. ¿Qué tallas tienen disponibles?`;
      cta.href = `https://wa.me/${(shop.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
      cta.textContent = "Pedir por WhatsApp";
    }
  }
  $(".to-cta").onclick = () => track(current.g.link ? "buy" : "whatsapp", { garmentId: current.g.id });

  function resize() { const d = Math.min(devicePixelRatio || 1, 2); const r = root.getBoundingClientRect(); cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();

  const mapPt = l => { const W = cv.width, H = cv.height, s = Math.max(W / srcW, H / srcH), dx = (W - srcW * s) / 2, dy = (H - srcH * s) / 2;
    return { x: W - (dx + l.x * srcW * s), y: dy + l.y * srcH * s, v: l.visibility ?? 1 }; };

  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (!source || !landmarker) return;
    if (!isImage && source.readyState < 2) return;
    const W = cv.width, H = cv.height, s = Math.max(W / srcW, H / srcH);
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(source, (W - srcW * s) / 2, (H - srcH * s) / 2, srcW * s, srcH * s); ctx.restore();
    const t0 = performance.now(); let res;
    try { res = landmarker.detectForVideo(source, t0); } catch { return; }
    stats.detMs = stats.detMs * .9 + (performance.now() - t0) * .1;
    const lm = res.landmarks && res.landmarks[0], now = performance.now();
    let body = null;
    if (lm) {
      const P = i => mapPt(lm[i]);
      const raw = { nose: P(0), s11: P(11), s12: P(12), e11: P(13), e12: P(14), w11: P(15), w12: P(16), h23: P(23), h24: P(24) };
      if (raw.s11.v > .5 && raw.s12.v > .5) {
        const a = isImage ? 1 : 0.55;
        if (!smooth) smooth = raw; else for (const k in raw) smooth[k] = { x: smooth[k].x + (raw[k].x - smooth[k].x) * a, y: smooth[k].y + (raw[k].y - smooth[k].y) * a, v: raw[k].v };
        body = { ...smooth, visHips: raw.h23.v > .4 && raw.h24.v > .4 }; lastSeen = now;
      }
    }
    if (!body && now - lastSeen > 400) smooth = null;
    if (!locked) {
      let ok = false, msg = "Ubícate dentro de la silueta";
      if (body) {
        const g = guideGeom(cv), sw = len(sub(body.s11, body.s12)), mid = lerp(body.s12, body.s11, .5), ratio = sw / g.gsw;
        if (ratio > 1.4) msg = "Aléjate un poco de la cámara";
        else if (ratio < 0.6) msg = "Acércate un poco";
        else if (Math.abs(mid.x - g.cx) > W * 0.12) msg = mid.x < g.cx ? "Muévete un poco a tu izquierda" : "Muévete un poco a tu derecha";
        else if (Math.abs(mid.y - g.sy) > H * 0.14) msg = "Ajusta la altura: hombros sobre la línea";
        else ok = true;
      }
      if (isImage && body) ok = true;
      if (ok) { if (!alignStart) alignStart = now; } else alignStart = 0;
      const prog = alignStart ? Math.min(1, (now - alignStart) / 700) : 0;
      drawGuide(ctx, ok, prog);
      status(ok ? "¡Quieto! Te estoy midiendo…" : msg, ok);
      if (prog >= 1 || (isImage && ok)) { locked = true; lostAt = 0; track("fit"); updateBuy(); }
    }
    if (locked) {
      if (body) {
        lostAt = 0;
        if (current.g.source === "photo" && current.img) drawPhotoGarment(ctx, body, current.img, current.g.anchors);
        else drawGarment(ctx, body, current.g);
        status(current.g.name, true);
        gestureCheck(body, now);
      } else { if (!lostAt) lostAt = now; if (now - lostAt > 1500) { locked = false; alignStart = 0; updateBuy(); } }
    }
    stats.frames++; if (now - stats.last > 1000) { stats.fps = stats.frames * 1000 / (now - stats.last); stats.frames = 0; stats.last = now; if (locked && !perfSent && stats.fps) { perfSent = true; track("perf", { fps: Math.round(stats.fps) }); } }
    metaEl.textContent = `${stats.fps.toFixed(0)} fps`;
  }
  function gestureCheck(b, now) {
    if (isImage || now < gesture.cool) return;
    const sw = len(sub(b.s11, b.s12)), up = b.w12.v > .5 && b.w12.y < b.s12.y - sw * 0.35;
    if (up) { if (!gesture.start) gesture.start = now;
      const p = Math.min(1, (now - gesture.start) / 800);
      ctx.save(); ctx.strokeStyle = "#F08A12"; ctx.lineWidth = Math.max(4, sw * 0.03); ctx.beginPath(); ctx.arc(b.w12.x, b.w12.y, sw * 0.18, -Math.PI / 2, -Math.PI / 2 + p * 6.283); ctx.stroke(); ctx.restore();
      if (p >= 1) { const i = items.indexOf(current); select(items[(i + 1) % items.length]); gesture.start = 0; gesture.cool = now + 1500; }
    } else gesture.start = 0;
  }
  async function ready() {
    if (!landmarker) landmarker = await getLandmarker(status);
    $(".to-splash").hidden = true; status("Ubícate dentro de la silueta");
    track("start", { mode: isImage ? "foto" : "camara" });
  }
  async function startCamera() {
    $(".to-err").textContent = "";
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      video.srcObject = stream; await video.play();
      srcW = video.videoWidth; srcH = video.videoHeight; source = video; isImage = false; await ready();
    } catch (e) {
      $(".to-err").textContent = location.protocol === "file:" ? "El navegador bloquea la cámara al abrir el archivo directo. Ábrelo desde un servidor o desde la web." :
        "No pude abrir la cámara (" + (e.message || e.name) + "). Revisa el permiso de cámara o prueba con una foto.";
    }
  }
  async function useFile(f) {
    const url = URL.createObjectURL(f);
    if (f.type.startsWith("video")) { video.srcObject = null; video.src = url; video.loop = true; await video.play(); srcW = video.videoWidth; srcH = video.videoHeight; source = video; isImage = false; }
    else { const img = new Image(); img.src = url; await img.decode(); srcW = img.naturalWidth; srcH = img.naturalHeight; source = img; isImage = true; }
    locked = false; alignStart = 0; await ready();
  }
  root.addEventListener("click", e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "start") startCamera();
    if (act === "shot") cv.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `probador-${shop.slug}-${Date.now()}.png`; a.click(); track("photo", { garmentId: current?.g.id }); });
  });
  $('[data-act="file"]').onchange = e => e.target.files[0] && useFile(e.target.files[0]).catch(err => { $(".to-err").textContent = String(err); });
  const onKey = e => { const i = items.indexOf(current);
    if (e.key === "ArrowRight") select(items[(i + 1) % items.length]);
    if (e.key === "ArrowLeft") select(items[(i - 1 + items.length) % items.length]); };
  addEventListener("keydown", onKey);
  getLandmarker(status).then(l => { landmarker = l; if (!source) status(""); }).catch(e => { $(".to-err").textContent = "No cargó el modelo: " + e.message; });
  raf = requestAnimationFrame(frame);
  if (!items.length) status("Esta tienda aún no tiene prendas publicadas.");

  return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("keydown", onKey); stream?.getTracks().forEach(t => t.stop()); video.pause(); };
}
