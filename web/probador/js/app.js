/* Atajo Probador · MVP (versión demo sin servidor: los datos viven en este navegador). */
import { db, session, uid, slugify, PLANS, cop, ensureSample } from "./db.js";
import { mountTryon } from "./tryon.js";
import { drawGarment, drawPhotoGarment, drawMannequin, drawThumb, thumbBody } from "./engine.js";
import { loadToCanvas, checkQuality, removeBackground, autoTolerance, guessAnchors, guessSleeves, canvasToBlob, blobToImage } from "./capture.js";
import { STIFFNESS } from "./filters.js";

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r = app) => r.querySelector(s);
const $$ = (s, r = app) => [...r.querySelectorAll(s)];
let cleanup = null;

function toast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800);
}
const ico = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  shirt: '<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.7-2 3-4 3s-3.5-1.3-4-3z"/>',
  play: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const icon = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ico[n]}</svg>`;
const logo = (sub = "Probador") => `<a class="logo" href="#/"><i>A</i><span>atajo<br><small>${sub}</small></span></a>`;
const baseUrl = () => location.href.split("#")[0];
const tryUrl = (slug, extra = "") => `${baseUrl()}#/t/${slug}${extra}`;

/* ---------------- Router ---------------- */
async function route() {
  cleanup?.(); cleanup = null;
  const [path, qs] = location.hash.replace(/^#/, "").split("?");
  const q = new URLSearchParams(qs || "");
  const p = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (!p.length) return landing();
    if (p[0] === "planes") return plansPage();
    if (p[0] === "registro") return register(q.get("plan"));
    if (p[0] === "entrar") return enter();
    if (p[0] === "t") return tryonPage(p[1], p[2] === "totem", q.get("g"));
    if (p[0] === "panel") return panel(p.slice(1));
    return landing();
  } catch (e) { console.error(e); app.innerHTML = `<div class="auth"><div class="card"><h2>Algo falló</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Volver</a></div></div>`; }
}
addEventListener("hashchange", route);

/* ---------------- Landing ---------------- */
function siteNav() {
  return `<header class="site-nav">${logo()}
    <nav aria-label="Principal"><a class="btn btn-ghost btn-sm" href="#/planes">Planes</a>
    <a class="btn btn-ghost btn-sm" href="#/t/demo">Ver demo</a>
    <a class="btn btn-sm" href="#/entrar">Entrar</a>
    <a class="btn btn-primary btn-sm" href="#/registro">Crear mi tienda</a></nav></header>`;
}
const footer = () => `<footer class="footer"><span>Atajo Studio · Pereira, Colombia</span><span>Versión demo: los datos se guardan solo en este navegador.</span></footer>`;

function landing() {
  app.innerHTML = `${siteNav()}
  <main>
    <section class="hero">
      <div>
        <p class="kicker">Probador virtual para tiendas de ropa</p>
        <h1>Que tus clientes se vean con tu ropa antes de comprar.</h1>
        <p class="lead">Sube tus prendas con el celular y comparte un enlace. Tus clientes se paran frente a la cámara y se ven con la prenda puesta, en vivo. Sin apps, sin registro y sin que el video salga de su teléfono.</p>
        <div class="ctas"><a class="btn btn-primary" href="#/registro">Crear mi tienda gratis</a><a class="btn" href="#/t/demo">Probar la demo</a></div>
        <p class="hint" style="margin-top:14px;color:var(--muted);font-size:14px">14 días gratis · planes desde XXX al mes</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <canvas width="400" height="400" id="heroCv"></canvas>
        <span class="chip" style="top:22px;left:22px">En vivo</span>
        <span class="chip" style="bottom:22px;right:22px;background:var(--orange)">Pedir por WhatsApp</span>
      </div>
    </section>
    <section class="section">
      <h2>Así funciona</h2>
      <div class="steps3">
        <article><b>1</b><h3>Fotografía tu prenda</h3><p>El asistente te guía paso a paso desde el celular, revisa la luz y el fondo, y recorta la prenda solo.</p></article>
        <article><b>2</b><h3>Comparte tu probador</h3><p>Un enlace para tu bio de Instagram y WhatsApp, un código QR para el mostrador y un modo tótem para tu vitrina.</p></article>
        <article><b>3</b><h3>Vende y mide</h3><p>El cliente se ve con la prenda y te escribe con un toque. Tú ves qué prendas se prueban y cuáles terminan en pedido.</p></article>
      </div>
    </section>
    <section class="section">
      <div class="between" style="margin-bottom:24px"><h2 style="margin:0">Planes</h2><a class="btn btn-sm" href="#/planes">Ver detalle</a></div>
      ${plansGrid()}
    </section>
  </main>${footer()}`;
  const c = $("#heroCv"), x = c.getContext("2d");
  const garments = [["#7FA3C9", "oxford", "shirt"], ["#3D5E86", "denim", "jacket"], ["#5B6168", "herringbone", "blazer"]];
  let i = 0;
  const paint = () => { x.clearRect(0, 0, 400, 400); drawMannequin(x, 400); const [color, pattern, kind] = garments[i % 3]; drawGarment(x, thumbBody(400), { preset: "hero" + i % 3, color, pattern, kind, sleeve: "long", inner: "#F2F2EE" }); i++; };
  paint(); const t = setInterval(paint, 2200); cleanup = () => clearInterval(t);
}

function plansGrid(cta = true) {
  const f = (p, items, who, tag) => `<article class="plan ${tag ? "featured" : ""}">${tag ? `<span class="tag">${tag}</span>` : ""}
    <h3>${p.name}</h3><p class="who">${who}</p>
    <p class="price">${p.id === "cadena" ? '<small>desde </small>' : ""}XXX <small>al mes</small></p>
    <ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>
    ${cta ? `<a class="btn ${tag ? "btn-primary" : ""}" href="#/registro?plan=${p.id}">${p.id === "cadena" ? "Hablar con Atajo" : "Empezar 14 días gratis"}</a>` : ""}</article>`;
  return `<div class="plans">
    ${f(PLANS.vitrina, ["Hasta 30 prendas", "Espejo en vivo con la cámara", "Enlace propio y código QR", "Captura guiada desde el celular", "100 fotos realistas con IA al mes", "Botón Pedir por WhatsApp", "Analítica básica"], "Para la tienda que vende por Instagram y WhatsApp.")}
    ${f(PLANS.tienda, ["Todo lo de Vitrina y hasta 150 prendas", "Botón Pruébatelo en tu web (Shopify, WooCommerce)", "Modo tótem para tu vitrina", "600 fotos realistas con IA al mes", "20 modelos 3D al mes (visor 360° y AR)", "Analítica completa y reporte mensual", "Hasta 3 usuarios"], "Para la tienda con local o página web.", "El más elegido")}
    ${f(PLANS.cadena, ["Todo lo de Tienda en varias sedes", "Analítica por sede", "2.000 fotos con IA y 80 modelos 3D al mes", "Integración con VTEX", "Probador con tu marca y dominio", "Soporte prioritario"], "Para marcas con varias sedes o e-commerce grande.")}
  </div>`;
}

function plansPage() {
  app.innerHTML = `${siteNav()}<main class="section">
    <p class="kicker">Planes y precios</p><h1 style="font-size:clamp(28px,4vw,44px);margin-bottom:12px">Un probador para cada tipo de tienda</h1>
    <p style="color:var(--muted);max-width:640px;margin-bottom:36px">Precios por definir. 14 días gratis en Vitrina y Tienda. Pago anual con 2 meses de regalo.</p>
    ${plansGrid()}
    <div class="grid2" style="margin-top:36px">
      <div class="panel"><h2>Extras</h2><p>100 fotos con IA adicionales por XXX · 10 modelos 3D por XXX.</p><p>Puesta en marcha con Atajo (fotos y carga de las primeras 30 prendas, configuración del tótem y capacitación): XXX.</p></div>
      <div class="panel"><h2>Para tener claro</h2><p>El espejo en vivo muestra estilo, color y estampado; no reemplaza la tabla de tallas. Las fotos con IA solo se generan con autorización del cliente y se borran a las 24 horas.</p></div>
    </div></main>${footer()}`;
}

/* ---------------- Registro y entrada ---------------- */
function register(plan) {
  plan = PLANS[plan] ? plan : "tienda";
  app.innerHTML = `<div class="auth"><div class="card">
    <div style="margin-bottom:18px">${logo()}</div>
    <h1 style="font-size:26px;margin-bottom:6px">Crea el probador de tu tienda</h1>
    <p style="color:var(--muted);margin-bottom:22px">Toma un minuto. Después subes tu primera prenda desde el celular.</p>
    <form class="form" id="f">
      <div class="field"><label for="name">Nombre de la tienda</label><input id="name" type="text" required maxlength="60" autocomplete="organization" placeholder="Ej.: Novecento"></div>
      <div class="field"><label for="slug">Tu enlace</label><input id="slug" type="text" required maxlength="40" pattern="[a-z0-9\\-]+" inputmode="url"><span class="hint" id="slugHint"></span></div>
      <div class="field"><label for="city">Ciudad</label><input id="city" type="text" maxlength="40" placeholder="Pereira"></div>
      <div class="field"><label for="wa">WhatsApp de ventas</label><input id="wa" type="tel" inputmode="tel" maxlength="20" placeholder="311 000 0000"><span class="hint">Aquí llegan los pedidos del botón "Pedir por WhatsApp".</span></div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Plan</legend>
        <div class="pills">${Object.values(PLANS).map(p => `<label class="pill"><input type="radio" name="plan" value="${p.id}" ${p.id === plan ? "checked" : ""}>${p.name}</label>`).join("")}</div>
        <span class="hint">No se cobra nada en esta demo. El cobro automático (Wompi) llega en la siguiente versión.</span></fieldset>
      <button class="btn btn-primary" type="submit">Crear mi tienda</button>
      <p style="font-size:14px;color:var(--muted)">¿Ya tienes una? <a href="#/entrar">Entrar</a></p>
    </form></div></div>`;
  const name = $("#name"), slug = $("#slug"), hint = $("#slugHint");
  let touched = false;
  const showHint = () => { hint.textContent = "Tu probador quedará en: …#/t/" + (slug.value || "tu-tienda"); };
  name.oninput = () => { if (!touched) slug.value = slugify(name.value); showHint(); };
  slug.oninput = () => { touched = true; slug.value = slugify(slug.value); showHint(); };
  showHint();
  $("#f").onsubmit = async e => {
    e.preventDefault();
    const s = slugify(slug.value);
    if (await db.shopBySlug(s)) { hint.textContent = "Ese enlace ya está en uso en este navegador. Prueba otro."; slug.focus(); return; }
    const shop = { id: uid(), slug: s, name: name.value.trim(), city: $("#city").value.trim(), whatsapp: $("#wa").value.replace(/\D/g, ""),
      plan: new FormData(e.target).get("plan"), created: Date.now(), accent: "#F08A12" };
    if (shop.whatsapp && shop.whatsapp.length === 10) shop.whatsapp = "57" + shop.whatsapp;
    await db.saveShop(shop); session.shopId = shop.id;
    toast("Tienda creada. Ahora sube tu primera prenda.");
    location.hash = "#/panel";
  };
}

async function enter() {
  const shops = await db.shops();
  app.innerHTML = `<div class="auth"><div class="card">
    <div style="margin-bottom:18px">${logo()}</div>
    <h1 style="font-size:26px;margin-bottom:6px">Entrar a tu panel</h1>
    <p style="color:var(--muted);margin-bottom:20px">En esta demo las tiendas se guardan en este navegador. En la versión final se entra con correo o Google.</p>
    <div style="display:grid;gap:10px">${shops.map(s => `<button class="btn" data-id="${s.id}" style="justify-content:space-between"><span>${esc(s.name)}</span><small style="color:var(--muted)">${PLANS[s.plan]?.name || ""}</small></button>`).join("") || "<p>No hay tiendas todavía.</p>"}</div>
    <div class="row" style="margin-top:20px"><a class="btn btn-primary" href="#/registro">Crear una tienda nueva</a></div></div></div>`;
  $$("[data-id]").forEach(b => b.onclick = () => { session.shopId = b.dataset.id; location.hash = "#/panel"; });
}

/* ---------------- Probador público ---------------- */
async function loadItems(shopId, onlyPublished = true) {
  const gs = (await db.garments(shopId)).filter(g => !onlyPublished || g.published);
  return Promise.all(gs.map(async g => ({ g, img: g.source === "photo" && g.cutout ? await blobToImage(g.cutout) : null })));
}
async function tryonPage(slug, totem, gid) {
  const shop = await db.shopBySlug(slug || "");
  if (!shop) { app.innerHTML = `<div class="auth"><div class="card"><h1 style="font-size:24px">No encontramos esta tienda</h1><p style="margin:12px 0 20px;color:var(--muted)">Revisa el enlace. En la demo, las tiendas existen solo en el navegador donde se crearon.</p><a class="btn" href="#/">Ir al inicio</a></div></div>`; return; }
  const items = await loadItems(shop.id);
  if (gid) { const i = items.findIndex(it => it.g.id === gid); if (i > 0) items.unshift(...items.splice(i, 1)); }
  app.innerHTML = `<div class="to-page"></div>`;
  const own = session.shopId === shop.id;
  db.track(shop.id, "view", { totem, ua: /Mobi/i.test(navigator.userAgent) ? "movil" : "escritorio" });
  cleanup = mountTryon($(".to-page"), { shop, items, totem, exitHref: own ? "#/panel" : (shop.sample ? "#/" : null),
    track: (type, data) => db.track(shop.id, type, data) });
}

/* ---------------- Panel ---------------- */
async function currentShop() {
  const id = session.shopId; let shop = id && await db.shop(id);
  if (!shop) { const demo = await db.shopBySlug("demo"); if (demo) { session.shopId = demo.id; shop = demo; } }
  return shop;
}
async function panel(p) {
  const shop = await currentShop();
  if (!shop) { location.hash = "#/registro"; return; }
  const sec = p[0] || "inicio";
  const nav = [["inicio", "Inicio", "home"], ["prendas", "Prendas", "shirt"], ["compartir", "Compartir", "share"], ["analitica", "Analítica", "chart"], ["plan", "Plan", "card"]];
  app.innerHTML = `<div class="shell">
    <aside class="side">${logo("Panel")}
      <nav aria-label="Panel">${nav.map(([k, t, i]) => `<a href="#/panel/${k}" ${sec === k ? 'aria-current="page"' : ""}>${icon(i)}${t}</a>`).join("")}
        <a href="#/t/${shop.slug}">${icon("play")}Abrir probador</a></nav>
      <div class="shopbox"><b>${esc(shop.name)}</b><span>Plan ${PLANS[shop.plan]?.name}</span><a class="link" href="#/entrar">Cambiar de tienda</a></div>
    </aside>
    <main class="main" id="main"></main></div>`;
  const main = $("#main");
  if (shop.sample) main.insertAdjacentHTML("afterbegin", `<p class="notice">Estás viendo la <b>tienda demo</b>. <a href="#/registro">Crea tu propia tienda</a> para subir tus prendas.</p>`);
  const views = { inicio: home, prendas: p[1] === "nueva" ? newGarment : p[1] === "editar" ? editGarment : garmentsView, compartir: share, analitica: analytics, plan: planView };
  await (views[sec] || home)(main, shop, p[2]);
}

function stat(evs, type) { return evs.filter(e => e.type === type).length; }
function last(evs, days) { const t = Date.now() - days * 864e5; return evs.filter(e => e.at >= t); }

async function home(main, shop) {
  const [gs, evs] = await Promise.all([db.garments(shop.id), db.events(shop.id)]);
  const e30 = last(evs, 30);
  const orders = stat(e30, "whatsapp") + stat(e30, "buy");
  const steps = [
    ["Crear la tienda", true],
    ["Subir la primera prenda", gs.length > 0, "#/panel/prendas/nueva"],
    ["Probarte una prenda en el probador", evs.some(e => e.type === "fit"), `#/t/${shop.slug}`],
    ["Compartir el enlace o el QR", !!shop.shared, "#/panel/compartir"],
  ];
  main.insertAdjacentHTML("beforeend", `
    <div class="page-h"><div><h1>Hola, ${esc(shop.name)}</h1><p>Así va tu probador en los últimos 30 días.</p></div>
      <div class="row"><a class="btn" href="#/t/${shop.slug}">${icon("play", 18)}Abrir probador</a><a class="btn btn-primary" href="#/panel/prendas/nueva">Subir prenda</a></div></div>
    <div class="kpis">
      <div class="kpi"><span>Personas que lo abrieron</span><b>${stat(e30, "start")}</b><small>sesiones con cámara o foto</small></div>
      <div class="kpi"><span>Prendas probadas</span><b>${stat(e30, "try") + stat(e30, "fit")}</b><small>veces que alguien se vio con una prenda</small></div>
      <div class="kpi"><span>Pedidos iniciados</span><b>${orders}</b><small>clics en WhatsApp o comprar</small></div>
      <div class="kpi"><span>Prendas publicadas</span><b>${gs.filter(g => g.published).length}<small style="font:500 16px var(--body)"> / ${PLANS[shop.plan].garments}</small></b><small>según tu plan</small></div>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Primeros pasos</h2>
        <ul class="checklist">${steps.map(([t, done, href]) => `<li class="${done ? "done" : ""}"><span class="dot">${done ? `<span style="color:#fff">${icon("check", 16)}</span>` : ""}</span><span>${t}</span>${!done && href ? `<a class="btn btn-sm" style="margin-left:auto" href="${href}">Hacer</a>` : ""}</li>`).join("")}</ul></section>
      <section class="panel"><h2>Lo que viene en tu plan</h2>
        <ul class="checklist">
          <li><span class="dot">${icon("sun", 14)}</span><span>Foto realista con IA del cliente con la prenda <span class="soon">Próximamente</span></span></li>
          <li><span class="dot">${icon("layers", 14)}</span><span>Modelo 3D desde tus fotos, con visor 360° y realidad aumentada <span class="soon">Próximamente</span></span></li>
          <li><span class="dot">${icon("card", 14)}</span><span>Cobro automático con Wompi y factura electrónica <span class="soon">Próximamente</span></span></li>
          <li><span class="dot">${icon("shirt", 14)}</span><span>Recomendador de talla con tu tabla de tallas <span class="soon">Próximamente</span></span></li>
        </ul></section>
    </div>`);
}

async function garmentsView(main, shop) {
  const items = await loadItems(shop.id, false);
  const limit = PLANS[shop.plan].garments, full = items.length >= limit;
  main.insertAdjacentHTML("beforeend", `
    <div class="page-h"><div><h1>Prendas</h1><p>${items.length} de ${limit} prendas de tu plan ${PLANS[shop.plan].name}.</p></div>
      ${full ? `<a class="btn" href="#/panel/plan">Subir de plan</a>` : `<a class="btn btn-primary" href="#/panel/prendas/nueva">Subir prenda</a>`}</div>
    <div class="garments">
      ${full ? "" : `<a class="add-card" href="#/panel/prendas/nueva"><b>+</b><span><strong>Subir una prenda</strong><br><small style="color:var(--muted)">Con el celular, en 3 minutos</small></span></a>`}
      ${items.map(({ g }) => `<article class="gcard" data-id="${g.id}">
        <div class="thumb"><canvas width="240" height="240" aria-label="${esc(g.name)}"></canvas></div>
        <div class="body"><b>${esc(g.name)}</b>
          <div class="meta"><span>${g.price ? cop(g.price) : "Sin precio"}</span><span class="badge ${g.published ? "" : "off"}">${g.published ? "Publicada" : "Oculta"}</span></div>
          <div class="acts"><a class="btn btn-sm" href="#/t/${shop.slug}?g=${g.id}">Probar</a>
            <button class="btn btn-sm btn-ghost" data-act="toggle">${g.published ? "Ocultar" : "Publicar"}</button>
            <a class="btn btn-sm btn-ghost" href="#/panel/prendas/editar/${g.id}">Editar</a></div></div></article>`).join("")}
    </div>`);
  items.forEach(it => drawThumb($(`[data-id="${it.g.id}"] canvas`, main), it.g, it.img));
  $$("[data-act=toggle]", main).forEach(b => b.onclick = async () => {
    const id = b.closest("[data-id]").dataset.id, g = await db.garment(id); g.published = !g.published; await db.saveGarment(g);
    toast(g.published ? "Prenda publicada en tu probador" : "Prenda oculta"); route();
  });
}

const KINDS = [["shirt", "Camisa"], ["polo", "Polo o camiseta"], ["jacket", "Chaqueta"], ["blazer", "Blazer"], ["top", "Blusa o top"], ["dress", "Vestido"]];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
function detailsForm(g = {}) {
  return `<div class="field"><label for="gname">Nombre de la prenda</label><input id="gname" type="text" required maxlength="60" value="${esc(g.name || "")}" placeholder="Camisa de lino blanca"></div>
    <div class="field"><label for="gprice">Precio (COP)</label><input id="gprice" type="number" min="0" step="100" inputmode="numeric" value="${g.price || ""}" placeholder="129900"></div>
    <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Tipo</legend>
      <div class="pills">${KINDS.map(([k, t]) => `<label class="pill"><input type="radio" name="kind" value="${k}" ${(g.kind || "shirt") === k ? "checked" : ""}>${t}</label>`).join("")}</div></fieldset>
    <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Tallas disponibles</legend>
      <div class="pills">${SIZES.map(s => `<label class="pill"><input type="checkbox" name="size" value="${s}" ${(g.sizes || ["S", "M", "L"]).includes(s) ? "checked" : ""}>${s}</label>`).join("")}</div></fieldset>
    <div class="field"><label for="gstiff">Caída de la tela</label><input id="gstiff" type="range" min="0" max="100" value="${Math.round((g.stiff ?? STIFFNESS[g.kind || "shirt"] ?? 0.5) * 100)}" ${g.stiff == null ? 'data-auto="1"' : ""}>
      <span class="hint between"><span>Suelta (se mece más)</span><span>Rígida</span></span><span class="hint">Se ajusta solo según el tipo; chaquetas y blazers se mecen menos que camisas y blusas.</span></div>
    <div class="field"><label for="glink">Enlace de compra (opcional)</label><input id="glink" type="url" value="${esc(g.link || "")}" placeholder="https://mitienda.com/producto"><span class="hint">Si lo dejas vacío, el botón del probador abre tu WhatsApp con la prenda escrita.</span></div>`;
}
/* El control de caída sigue al tipo de prenda hasta que la tienda lo mueve. */
function bindStiff(form) {
  const st = $("#gstiff", form); if (!st) return;
  st.oninput = () => { delete st.dataset.auto; };
  form.addEventListener("change", e => { if (e.target.name === "kind" && st.dataset.auto) st.value = Math.round((STIFFNESS[e.target.value] ?? .5) * 100); });
}
function readDetails(form) {
  const fd = new FormData(form);
  const link = $("#glink", form).value.trim();
  const st = $("#gstiff", form);
  return { name: $("#gname", form).value.trim(), price: Number($("#gprice", form).value) || 0, kind: fd.get("kind"), sizes: fd.getAll("size"),
    stiff: st && !st.dataset.auto ? Number(st.value) / 100 : null,
    link: /^https?:\/\//.test(link) ? link : "" };
}

async function editGarment(main, shop, id) {
  const g = await db.garment(id);
  if (!g || g.shopId !== shop.id) { location.hash = "#/panel/prendas"; return; }
  main.insertAdjacentHTML("beforeend", `<div class="page-h"><div><h1>Editar prenda</h1></div><a class="btn" href="#/panel/prendas">Volver</a></div>
    <form class="panel form" id="ef" style="max-width:640px">${detailsForm(g)}
      <div class="between"><button type="button" class="btn btn-ghost" id="del" style="color:var(--bad)">Eliminar prenda</button><button class="btn btn-primary" type="submit">Guardar cambios</button></div></form>`);
  bindStiff($("#ef"));
  $("#ef").onsubmit = async e => { e.preventDefault(); Object.assign(g, readDetails(e.target)); if (g.source === "preset") g.kind = g.kind; await db.saveGarment(g); toast("Cambios guardados"); location.hash = "#/panel/prendas"; };
  $("#del").onclick = async () => { $("#del").textContent = "Toca otra vez para eliminar"; $("#del").onclick = async () => { await db.deleteGarment(g.id); toast("Prenda eliminada"); location.hash = "#/panel/prendas"; }; };
}

/* ---------------- Asistente de captura ---------------- */
async function newGarment(main, shop) {
  const count = (await db.garments(shop.id)).length;
  if (count >= PLANS[shop.plan].garments) { location.hash = "#/panel/plan"; toast("Llegaste al límite de prendas de tu plan"); return; }
  const S = { step: 0, raw: null, cut: null, tol: null, anchors: null, cutImg: null, stream: null };
  const names = ["Preparar", "Foto", "Recorte", "Puntos", "Datos"];
  main.insertAdjacentHTML("beforeend", `<div class="page-h"><div><h1>Subir una prenda</h1><p>Te guiamos paso a paso. Toma unos 3 minutos.</p></div><a class="btn" href="#/panel/prendas">Cancelar</a></div>
    <div class="wizard"><ol class="stepper">${names.map((n, i) => `<li data-i="${i}">${i + 1}. ${n}</li>`).join("")}</ol><div id="wz"></div></div>`);
  const wz = $("#wz", main);
  const stopCam = () => { S.stream?.getTracks().forEach(t => t.stop()); S.stream = null; };
  cleanup = stopCam;
  const go = i => { stopCam(); S.step = i; $$(".stepper li", main).forEach((li, k) => { li.className = k < i ? "done" : k === i ? "on" : ""; li.setAttribute("aria-current", k === i ? "step" : "false"); }); [prep, photo, cut, points, details][i](); wz.scrollIntoView({ block: "nearest" }); };

  function prep() {
    wz.innerHTML = `<section class="panel"><h2>Antes de tomar la foto</h2>
      <div class="tips">
        <div class="tip">${icon("layers", 28)}<b>Fondo liso</b><p>Extiende la prenda sobre una sábana, cartulina o piso de un solo color, que contraste con la prenda.</p></div>
        <div class="tip">${icon("shirt", 28)}<b>Prenda estirada</b><p>Sin arrugas, abotonada y con las mangas abiertas hacia los lados o un poco hacia abajo.</p></div>
        <div class="tip">${icon("sun", 28)}<b>Buena luz</b><p>Luz de día, sin sol directo ni flash. Evita que tu sombra caiga sobre la prenda.</p></div>
        <div class="tip">${icon("phone", 28)}<b>Desde arriba</b><p>Celular paralelo a la prenda, con toda la prenda dentro de la guía y un poco de margen.</p></div>
      </div>
      <div class="row"><button class="btn btn-primary" id="cam">${icon("phone", 18)}Usar la cámara</button>
        <label class="btn">Subir una foto<input type="file" accept="image/*" id="file" hidden></label></div></section>`;
    $("#cam", wz).onclick = () => go(1);
    $("#file", wz).onchange = e => e.target.files[0] && fromFile(e.target.files[0]);
  }
  async function fromFile(f) { const img = new Image(); img.src = URL.createObjectURL(f); await img.decode(); S.raw = loadToCanvas(img); S.tol = null; S.step = 1; go(1); }

  function shirtOutline(x, w, h) {
    x.save(); x.strokeStyle = "#FFB627"; x.lineWidth = Math.max(3, w * 0.008); x.setLineDash([w * 0.025, w * 0.018]);
    const cx = w / 2, top = h * 0.14, sw = w * 0.5, L = h * 0.7;
    x.beginPath();
    x.moveTo(cx - sw * 0.16, top); x.lineTo(cx - sw * 0.5, top + L * 0.04); x.lineTo(cx - sw * 0.92, top + L * 0.3); x.lineTo(cx - sw * 0.74, top + L * 0.38);
    x.lineTo(cx - sw * 0.46, top + L * 0.22); x.lineTo(cx - sw * 0.44, top + L); x.lineTo(cx + sw * 0.44, top + L); x.lineTo(cx + sw * 0.46, top + L * 0.22);
    x.lineTo(cx + sw * 0.74, top + L * 0.38); x.lineTo(cx + sw * 0.92, top + L * 0.3); x.lineTo(cx + sw * 0.5, top + L * 0.04); x.lineTo(cx + sw * 0.16, top);
    x.quadraticCurveTo(cx, top + L * 0.07, cx - sw * 0.16, top); x.stroke(); x.restore();
  }
  async function photo() {
    if (S.raw) return review();
    wz.innerHTML = `<section class="panel"><div class="capture"><video playsinline muted></video><canvas class="overlay"></canvas><p class="say">Ubica la prenda dentro de la guía amarilla</p></div>
      <p class="to-err" id="err" style="color:var(--bad)"></p>
      <div class="row" style="justify-content:center"><button class="btn btn-primary" id="snap" disabled>Tomar foto</button><label class="btn">Subir una foto<input type="file" accept="image/*" id="file" hidden></label><button class="btn btn-ghost" id="back">Atrás</button></div></section>`;
    $("#back", wz).onclick = () => go(0);
    $("#file", wz).onchange = e => e.target.files[0] && fromFile(e.target.files[0]);
    const v = $("video", wz), ov = $(".overlay", wz);
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      v.srcObject = S.stream; await v.play();
      const r = ov.getBoundingClientRect(); ov.width = r.width * 2; ov.height = r.height * 2; shirtOutline(ov.getContext("2d"), ov.width, ov.height);
      $("#snap", wz).disabled = false;
      $("#snap", wz).onclick = () => {
        // recorte "cover" igual a lo que se ve en pantalla
        const vw = v.videoWidth, vh = v.videoHeight, ar = r.width / r.height;
        let sw = vw, sh = vw / ar; if (sh > vh) { sh = vh; sw = vh * ar; }
        const c = document.createElement("canvas"); c.width = Math.min(1100, sw); c.height = c.width / ar;
        c.getContext("2d").drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
        S.raw = c; stopCam(); review();
      };
    } catch (e) { $("#err", wz).textContent = "No pude abrir la cámara (" + (e.message || e.name) + "). Puedes subir una foto tomada con el celular."; }
  }
  function review() {
    const q = checkQuality(S.raw), ok = q.every(c => c.ok);
    wz.innerHTML = `<section class="panel"><h2>Revisión de la foto</h2>
      <div class="grid2"><div class="checkered" style="background:var(--ink)" id="ph"></div>
      <div style="display:grid;gap:14px;align-content:start"><ul class="checks">${q.map(c => `<li class="${c.ok ? "" : "bad"}"><b>${c.ok ? "✓" : "!"} ${c.label}</b><span>${c.msg}</span></li>`).join("")}</ul>
        <p style="color:var(--muted)">${ok ? "La foto está lista para recortar." : "Puedes seguir, pero el recorte puede salir con errores. Mejor repetirla con los consejos."}</p>
        <div class="row"><button class="btn ${ok ? "btn-primary" : ""}" id="next">${ok ? "Continuar" : "Continuar de todos modos"}</button><button class="btn ${ok ? "btn-ghost" : "btn-primary"}" id="redo">Repetir foto</button></div></div></div></section>`;
    S.raw.style.maxHeight = "60vh"; S.raw.style.borderRadius = "10px"; $("#ph", wz).append(S.raw);
    $("#redo", wz).onclick = () => { S.raw = null; S.tol = null; go(1); };
    $("#next", wz).onclick = () => go(2);
  }
  function cut() {
    if (S.tol == null) S.tol = autoTolerance(S.raw);
    wz.innerHTML = `<section class="panel"><h2>Recorte automático</h2><p style="color:var(--muted)">Quitamos el fondo. Si se comió parte de la prenda o dejó fondo, mueve el control.</p>
      <div class="checkered" id="cv" style="min-height:240px"></div>
      <div class="field" style="max-width:520px"><label for="tol">Sensibilidad del recorte</label><input id="tol" type="range" min="5" max="90" value="${S.tol}"><span class="hint">Menos: conserva más. Más: quita más fondo.</span></div>
      <p id="warn" class="notice" hidden></p>
      <div class="row"><button class="btn btn-primary" id="next">Se ve bien</button><button class="btn btn-ghost" id="back">Repetir foto</button></div></section>`;
    const render = () => {
      const src = document.createElement("canvas"); src.width = S.raw.width; src.height = S.raw.height; src.getContext("2d").drawImage(S.raw, 0, 0);
      const r = removeBackground(src, S.tol); S.cut = r.canvas;
      const box = $("#cv", wz); box.innerHTML = "";
      const warn = $("#warn", wz);
      if (!r.canvas || r.coverage < 0.04) { warn.hidden = false; warn.textContent = "No encontramos la prenda. Baja la sensibilidad o repite la foto con un fondo que contraste más."; $("#next", wz).disabled = true; return; }
      warn.hidden = r.coverage < 0.85; warn.textContent = "Parece que el fondo quedó incluido. Sube la sensibilidad.";
      $("#next", wz).disabled = false;
      r.canvas.style.maxHeight = "55vh"; box.append(r.canvas);
    };
    let t; $("#tol", wz).oninput = e => { S.tol = +e.target.value; clearTimeout(t); t = setTimeout(render, 120); };
    $("#back", wz).onclick = () => { S.raw = null; S.tol = null; go(1); };
    $("#next", wz).onclick = () => { S.anchors = guessSleeves(S.cut, guessAnchors(S.cut)); go(3); };
    setTimeout(render, 30);
  }
  function points() {
    const SLEEVES = [["long", "Manga larga"], ["short", "Manga corta"], ["none", "Sin manga"]];
    wz.innerHTML = `<section class="panel"><h2>Marca los puntos de la prenda</h2><p style="color:var(--muted)">Ya los ubicamos solos. Revisa que cada uno esté en su lugar y arrástralo si hace falta: <b>hombros</b> en las costuras, <b>ruedo</b> en las esquinas de abajo, <b>axilas</b> donde la manga se une al cuerpo, y <b>codo</b> y <b>puño</b> en el centro de cada manga.</p>
      <fieldset class="field" style="border:0;padding:0;margin:0 0 12px"><legend style="font-weight:600;margin-bottom:6px">Tipo de manga</legend>
        <div class="pills" id="sleeve">${SLEEVES.map(([k, t]) => `<label class="pill"><input type="radio" name="sleeve" value="${k}" ${S.anchors.sleeve === k ? "checked" : ""}>${t}</label>`).join("")}</div></fieldset>
      <div class="preview-duo"><div class="anchor-stage" id="st"></div><div class="pose-duo">
        <figure><canvas id="pv" width="360" height="360" aria-label="Vista previa en maniquí con brazos abajo"></canvas><figcaption>Brazos abajo</figcaption></figure>
        <figure><canvas id="pv2" width="360" height="360" aria-label="Vista previa en maniquí con brazos en movimiento"></canvas><figcaption>Brazos en movimiento</figcaption></figure>
        <p class="hint" style="color:var(--muted)">Así se va a ver en el probador. Si una manga se ve cortada o torcida, mueve su axila, codo o puño.</p></div></div>
      <div class="row"><button class="btn btn-primary" id="next">Continuar</button><button class="btn btn-ghost" id="back">Atrás</button></div></section>`;
    const st = $("#st", wz), c = document.createElement("canvas"); c.width = S.cut.width; c.height = S.cut.height;
    const cx = c.getContext("2d"); st.append(c);
    st.style.background = "repeating-conic-gradient(#EEE8DC 0 25%,#F7F3EC 0 50%) 0 0/20px 20px"; st.style.borderRadius = "12px";
    const pv = [$("#pv", wz), $("#pv2", wz)];
    const A = S.anchors;
    // Guía sobre la foto: costuras (hombro → axila → ruedo) y eje de cada manga (axila → codo → puño)
    const guide = () => {
      cx.clearRect(0, 0, c.width, c.height); cx.drawImage(S.cut, 0, 0);
      const lw = Math.max(2, c.width / 260); cx.lineWidth = lw; cx.setLineDash([lw * 3, lw * 2]); cx.lineCap = "round";
      const path = (pts, col) => { cx.strokeStyle = col; cx.beginPath(); pts.forEach((p, i) => i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y)); cx.stroke(); };
      if (A.sleeve !== "none") { path([A.sL, A.aL, A.hL], "#F08A12cc"); path([A.sR, A.aR, A.hR], "#F08A12cc"); }
      if (A.sleeve === "long") for (const [s, a, e, k] of [[A.sL, A.aL, A.eL, A.cL], [A.sR, A.aR, A.eR, A.cR]]) path([{ x: (s.x + a.x) / 2, y: (s.y + a.y) / 2 }, e, k], "#2E6FD8cc");
      cx.setLineDash([]);
    };
    let queued = false;
    const draw = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; guide();
      ["down", "bent"].forEach((pose, i) => { const x = pv[i].getContext("2d"), B = thumbBody(360, pose); x.clearRect(0, 0, 360, 360); drawMannequin(x, 360, B); drawPhotoGarment(x, B, S.cut, A, { kind: "shirt" }); }); }); };
    const labels = { sL: "Hombro", sR: "Hombro", hL: "Ruedo", hR: "Ruedo", aL: "Axila", aR: "Axila", eL: "Codo", eR: "Codo", cL: "Puño", cR: "Puño" };
    const handles = {};
    for (const k of Object.keys(labels)) {
      const h = document.createElement("button"); h.type = "button"; h.className = "handle " + ({ h: "hem", a: "pit", e: "elbow", c: "cuff" }[k[0]] || "");
      h.setAttribute("aria-label", labels[k] + (k[1] === "L" ? " izquierdo" : " derecho") + ", usa las flechas para mover");
      h.innerHTML = `<span>${labels[k]}</span>`; st.append(h); handles[k] = h;
      const place = () => { h.style.left = (A[k].x / c.width * 100) + "%"; h.style.top = (A[k].y / c.height * 100) + "%"; };
      h.place = place; place();
      h.onpointerdown = e => { h.setPointerCapture(e.pointerId); h.style.cursor = "grabbing"; };
      h.onpointermove = e => { if (!h.hasPointerCapture(e.pointerId)) return; const r = c.getBoundingClientRect();
        A[k] = { x: Math.max(0, Math.min(c.width, (e.clientX - r.left) / r.width * c.width)), y: Math.max(0, Math.min(c.height, (e.clientY - r.top) / r.height * c.height)) }; place(); draw(); };
      h.onpointerup = () => { h.style.cursor = ""; };
      h.onkeydown = e => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return; e.preventDefault();
        const step = c.width / 100; A[k] = { x: A[k].x + d[0] * step, y: A[k].y + d[1] * step }; place(); draw(); };
    }
    // Sin manga o manga corta: se ocultan codo y puño (el largo de la manga corta se toma de la foto)
    const showSleeve = () => { for (const k of ["eL", "eR", "cL", "cR"]) handles[k].hidden = A.sleeve !== "long"; for (const k of ["aL", "aR"]) handles[k].hidden = false; };
    $("#sleeve", wz).onchange = e => { A.sleeve = e.target.value; showSleeve(); draw(); };
    showSleeve(); draw();
    $("#back", wz).onclick = () => go(2);
    $("#next", wz).onclick = () => go(4);
  }
  function details() {
    wz.innerHTML = `<form class="panel form" id="df" style="max-width:720px"><h2>Datos de la prenda</h2>${detailsForm()}
      <label class="pill" style="justify-content:flex-start;opacity:.6"><input type="checkbox" disabled>Generar también el modelo 3D (visor 360° y realidad aumentada) <span class="soon">Próximamente</span></label>
      <div class="row"><button class="btn btn-primary" type="submit">Guardar y publicar</button><button class="btn btn-ghost" type="button" id="back">Atrás</button></div></form>`;
    $("#back", wz).onclick = () => go(3);
    bindStiff($("#df", wz));
    $("#df", wz).onsubmit = async e => {
      e.preventDefault();
      const btn = e.submitter; btn.disabled = true; btn.textContent = "Guardando…";
      const g = { id: uid(), shopId: shop.id, source: "photo", published: true, created: Date.now(), order: count, anchors: S.anchors,
        cutout: await canvasToBlob(S.cut), ...readDetails(e.target) };
      await db.saveGarment(g);
      toast("Prenda publicada. Pruébatela en tu probador.");
      location.hash = "#/panel/prendas";
    };
  }
  go(0);
}

/* ---------------- Compartir ---------------- */
function qrDataUrl(text) {
  try { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createDataURL(8, 2); } catch { return ""; }
}
async function share(main, shop) {
  const url = tryUrl(shop.slug), totem = tryUrl(shop.slug, "/totem");
  const plan = PLANS[shop.plan];
  const snippet = `<script src="${baseUrl()}widget.js" data-tienda="${shop.slug}" async></script>`;
  main.insertAdjacentHTML("beforeend", `<div class="page-h"><div><h1>Compartir tu probador</h1><p>Ponlo donde ya están tus clientes.</p></div></div>
    <div class="grid2">
      <section class="panel"><h2>Enlace para Instagram y WhatsApp</h2><p style="color:var(--muted)">Pégalo en tu bio, en estados y en respuestas rápidas.</p>
        <div class="copyline"><input type="text" readonly value="${esc(url)}" aria-label="Enlace del probador"><button class="btn btn-dark" data-copy="${esc(url)}">Copiar</button></div>
        <div class="row"><a class="btn btn-sm" href="https://wa.me/?text=${encodeURIComponent("Pruébate nuestra ropa desde tu celular: " + url)}" target="_blank" rel="noopener">Enviar por WhatsApp</a><a class="btn btn-sm" href="${url}">Abrir</a></div></section>
      <section class="panel"><h2>Código QR para el local</h2><p style="color:var(--muted)">Imprímelo para el mostrador, los vestidores o las bolsas.</p>
        <div class="row"><div class="qr"><img alt="Código QR del probador" src="${qrDataUrl(url)}"></div>
        <a class="btn btn-sm" download="qr-probador-${shop.slug}.gif" href="${qrDataUrl(url)}">Descargar QR</a></div></section>
      <section class="panel"><h2>Botón en tu página web ${plan.widget ? "" : '<span class="soon">Plan Tienda</span>'}</h2><p style="color:var(--muted)">Pega esta línea antes de &lt;/body&gt; y aparece el botón "Pruébatelo". Para Shopify y WooCommerce habrá instalación con un clic.</p>
        <div class="code">${esc(snippet)}</div>
        <div class="row"><button class="btn btn-sm btn-dark" data-copy="${esc(snippet)}" ${plan.widget ? "" : "disabled"}>Copiar código</button></div></section>
      <section class="panel"><h2>Modo tótem para tu vitrina ${plan.totem ? "" : '<span class="soon">Plan Tienda</span>'}</h2><p style="color:var(--muted)">Ábrelo en una pantalla con cámara. Las prendas cambian levantando la mano, sin tocar nada.</p>
        <div class="copyline"><input type="text" readonly value="${esc(totem)}" aria-label="Enlace del modo tótem"><button class="btn btn-dark" data-copy="${esc(totem)}" ${plan.totem ? "" : "disabled"}>Copiar</button></div>
        <div class="row"><a class="btn btn-sm" href="${totem}" ${plan.totem ? "" : 'aria-disabled="true"'}>Abrir modo tótem</a></div></section>
    </div>`);
  $$("[data-copy]", main).forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copiado"); } catch { toast("No se pudo copiar; selecciónalo a mano"); }
    if (!shop.shared) { shop.shared = true; db.saveShop(shop); }
  });
}

/* ---------------- Analítica ---------------- */
async function analytics(main, shop) {
  const [evs, gs] = await Promise.all([db.events(shop.id), db.garments(shop.id)]);
  const hasSample = evs.some(e => e.sample);
  const e30 = last(evs, 30);
  const byG = gs.map(g => {
    const mine = e30.filter(e => e.garmentId === g.id);
    return { g, tries: mine.filter(e => e.type === "try").length, orders: mine.filter(e => e.type === "whatsapp" || e.type === "buy").length, photos: mine.filter(e => e.type === "photo").length };
  }).sort((a, b) => b.tries - a.tries);
  const maxT = Math.max(1, ...byG.map(r => r.tries));
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
  const perDay = days.map(d => e30.filter(e => e.type === "start" && e.at >= d.getTime() && e.at < d.getTime() + 864e5).length);
  const maxD = Math.max(1, ...perDay);
  const starts = stat(e30, "start"), orders = stat(e30, "whatsapp") + stat(e30, "buy");
  const fps = e30.filter(e => e.type === "perf").map(e => e.fps), avgFps = fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : null;
  const mobile = e30.filter(e => e.type === "view" && e.ua === "movil").length, views = stat(e30, "view");
  main.insertAdjacentHTML("beforeend", `<div class="page-h"><div><h1>Analítica</h1><p>Últimos 30 días.</p></div>
      <div class="row">${hasSample ? `<button class="btn btn-sm" id="clr">Borrar datos de ejemplo</button>` : `<button class="btn btn-sm" id="smp">Cargar datos de ejemplo</button>`}</div></div>
    ${hasSample ? `<p class="notice">Estás viendo <b>datos de ejemplo</b> generados para la demostración, mezclados con el uso real de este navegador.</p>` : ""}
    <div class="kpis">
      <div class="kpi"><span>Sesiones</span><b>${starts}</b><small>${views} visitas al enlace</small></div>
      <div class="kpi"><span>Pedidos iniciados</span><b>${orders}</b><small>${starts ? Math.round(orders / starts * 100) : 0} % de las sesiones</small></div>
      <div class="kpi"><span>Fotos guardadas</span><b>${stat(e30, "photo")}</b><small>publicidad gratis en redes</small></div>
      <div class="kpi"><span>Desde el celular</span><b>${views ? Math.round(mobile / views * 100) : 0} %</b><small>${avgFps ? `fluidez media ${avgFps} cuadros/s` : "sin datos de fluidez"}</small></div>
    </div>
    <section class="panel"><h2>Sesiones por día</h2>
      <div class="days">${perDay.map((n, i) => `<div><span>${n || ""}</span><i style="height:${n / maxD * 100}%"></i>${days[i].getDate()}</div>`).join("")}</div></section>
    <section class="panel"><h2>Prendas más probadas</h2>
      <div class="legend"><span>■ Pruebas</span><span style="color:var(--orange)">■ Pedidos</span></div>
      <div class="bars">${byG.slice(0, 8).map(r => `<div class="bar"><span>${esc(r.g.name)}</span><div class="track"><div class="fill" style="width:${r.tries / maxT * 100}%"></div></div><b>${r.tries}</b></div>
        <div class="bar" style="margin-top:-6px"><span></span><div class="track" style="height:8px"><div class="fill alt" style="width:${r.orders / maxT * 100}%"></div></div><small>${r.orders}</small></div>`).join("")}</div>
      <div class="scroll-x"><table class="table"><thead><tr><th>Prenda</th><th class="num">Pruebas</th><th class="num">Pedidos</th><th class="num">Conversión</th><th class="num">Fotos</th></tr></thead>
        <tbody>${byG.map(r => `<tr><td>${esc(r.g.name)}</td><td class="num">${r.tries}</td><td class="num">${r.orders}</td><td class="num">${r.tries ? Math.round(r.orders / r.tries * 100) : 0} %</td><td class="num">${r.photos}</td></tr>`).join("")}</tbody></table></div>
      <p class="hint" style="color:var(--muted);font-size:14px">Prendas con muchas pruebas y pocos pedidos: revisa precio, tallas o fotos.</p></section>`);
  $("#smp", main)?.addEventListener("click", async () => { await db.bulkEvents(sampleEvents(shop.id, gs)); toast("Datos de ejemplo cargados"); route(); });
  $("#clr", main)?.addEventListener("click", async () => { await db.clearEvents(shop.id, true); toast("Datos de ejemplo borrados"); route(); });
}
function sampleEvents(shopId, gs) {
  const out = [], now = Date.now(); let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const weights = gs.map((_, i) => 1 / (i + 1.3));
  const pick = () => { let r = rnd() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < gs.length; i++) { r -= weights[i]; if (r <= 0) return gs[i]; } return gs[0]; };
  for (let d = 0; d < 21; d++) {
    const n = Math.round(4 + rnd() * 9 + (d % 7 > 4 ? 6 : 0));
    for (let s = 0; s < n; s++) {
      const at = now - d * 864e5 - rnd() * 8e7, ua = rnd() < 0.78 ? "movil" : "escritorio";
      out.push({ shopId, type: "view", at, ua, sample: true });
      if (rnd() < 0.72) {
        out.push({ shopId, type: "start", at: at + 2e3, sample: true }, { shopId, type: "fit", at: at + 9e3, sample: true }, { shopId, type: "perf", at: at + 12e3, fps: Math.round(ua === "movil" ? 14 + rnd() * 12 : 22 + rnd() * 10), sample: true });
        const k = 1 + Math.floor(rnd() * 4);
        for (let j = 0; j < k; j++) { const g = pick(); out.push({ shopId, type: "try", garmentId: g.id, at: at + 15e3 + j * 8e3, sample: true });
          if (rnd() < 0.035) out.push({ shopId, type: "whatsapp", garmentId: g.id, at: at + 20e3 + j * 8e3, sample: true });
          if (rnd() < 0.04) out.push({ shopId, type: "photo", garmentId: g.id, at: at + 21e3 + j * 8e3, sample: true }); }
      }
    }
  }
  return out;
}

/* ---------------- Plan ---------------- */
async function planView(main, shop) {
  const gs = await db.garments(shop.id), plan = PLANS[shop.plan];
  const meter = (label, used, max, soon) => `<div class="bar"><span>${label}${soon ? ' <span class="soon">Próximamente</span>' : ""}</span><div class="track"><div class="fill ${used / max > .85 ? "alt" : ""}" style="width:${max ? Math.min(100, used / max * 100) : 0}%"></div></div><b>${used} / ${max || "—"}</b></div>`;
  main.insertAdjacentHTML("beforeend", `<div class="page-h"><div><h1>Tu plan: ${plan.name}</h1><p>XXX al mes · prueba gratis de 14 días.</p></div></div>
    <section class="panel"><h2>Uso de este mes</h2><div class="bars">
      ${meter("Prendas", gs.length, plan.garments)}
      ${meter("Fotos con IA", 0, plan.aiPhotos, true)}
      ${meter("Modelos 3D", 0, plan.models3d, true)}</div></section>
    <section class="panel"><h2>Cambiar de plan</h2>${plansGrid(false)}
      <form class="row" id="pf"><div class="pills">${Object.values(PLANS).map(p => `<label class="pill"><input type="radio" name="plan" value="${p.id}" ${p.id === shop.plan ? "checked" : ""}>${p.name}</label>`).join("")}</div>
      <button class="btn btn-primary" type="submit">Guardar plan</button></form>
      <p class="hint" style="color:var(--muted);font-size:14px">En esta demo el cambio es inmediato y no se cobra. En la versión con pagos se cobra con Wompi (tarjeta, Nequi o PSE) y se emite factura electrónica.</p></section>`);
  $("#pf", main).onsubmit = async e => { e.preventDefault(); shop.plan = new FormData(e.target).get("plan"); await db.saveShop(shop); toast("Plan actualizado a " + PLANS[shop.plan].name); route(); };
}

/* ---------------- Arranque ---------------- */
await ensureSample();
route();
