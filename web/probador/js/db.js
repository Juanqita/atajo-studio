/* Almacenamiento local (IndexedDB) de la versión demo.
   Misma forma de datos que tendrá el backend (Supabase): tiendas, prendas y eventos por tienda. */
const DB_NAME = "atajo-probador", DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("shops", { keyPath: "id" }).createIndex("slug", "slug", { unique: true });
      db.createObjectStore("garments", { keyPath: "id" }).createIndex("shopId", "shopId");
      db.createObjectStore("events", { keyPath: "id", autoIncrement: true }).createIndex("shopId", "shopId");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out; const r = fn(s);
    if (r && "onsuccess" in r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  });
}
const all = (store, index, key) => tx(store, "readonly", s => index ? s.index(index).getAll(key) : s.getAll());

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const slugify = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tienda";

export const db = {
  shops: () => all("shops"),
  shop: id => tx("shops", "readonly", s => s.get(id)),
  shopBySlug: slug => tx("shops", "readonly", s => s.index("slug").get(slug)),
  saveShop: shop => tx("shops", "readwrite", s => s.put(shop)),
  garments: shopId => all("garments", "shopId", shopId).then(l => l.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created - b.created)),
  garment: id => tx("garments", "readonly", s => s.get(id)),
  saveGarment: g => tx("garments", "readwrite", s => s.put(g)),
  deleteGarment: id => tx("garments", "readwrite", s => s.delete(id)),
  events: shopId => all("events", "shopId", shopId),
  track: (shopId, type, data = {}) => tx("events", "readwrite", s => s.add({ shopId, type, at: Date.now(), ...data })).catch(() => {}),
  async clearEvents(shopId, onlySample) {
    const evs = await all("events", "shopId", shopId);
    await tx("events", "readwrite", s => { evs.filter(e => !onlySample || e.sample).forEach(e => s.delete(e.id)); });
  },
  async bulkEvents(list) { await tx("events", "readwrite", s => { list.forEach(e => s.add(e)); }); },
};

/* Sesión de la demo: qué tienda tiene abierta el panel en este navegador. */
export const session = {
  get shopId() { try { return localStorage.getItem("ap.shop"); } catch { return null; } },
  set shopId(v) { try { v ? localStorage.setItem("ap.shop", v) : localStorage.removeItem("ap.shop"); } catch {} },
};

/* Planes: los mismos de las fichas comerciales. */
export const PLANS = {
  vitrina: { id: "vitrina", name: "Vitrina", price: 149000, garments: 30, aiPhotos: 100, models3d: 0, widget: false, totem: false, users: 1 },
  tienda:  { id: "tienda",  name: "Tienda",  price: 349000, garments: 150, aiPhotos: 600, models3d: 20, widget: true, totem: true, users: 3 },
  cadena:  { id: "cadena",  name: "Cadena",  price: 890000, garments: 2000, aiPhotos: 2000, models3d: 80, widget: true, totem: true, users: 99 },
};
export const cop = n => "$" + Math.round(n).toLocaleString("es-CO");

/* Tienda de muestra con las prendas de la demo de Novecento, para mostrar el flujo completo sin cargar nada. */
export const SAMPLE_GARMENTS = [
  { preset: "oxford",  name: "Camisa Oxford",     price: 129900, kind: "shirt",  sleeve: "long",  color: "#7FA3C9", pattern: "oxford" },
  { preset: "lino",    name: "Camisa de lino",    price: 139900, kind: "shirt",  sleeve: "long",  color: "#EDE7DA", pattern: "linen" },
  { preset: "rayas",   name: "Camisa a rayas",    price: 119900, kind: "shirt",  sleeve: "long",  color: "#F4F6F8", pattern: "stripes", accent: "#2E4F8A" },
  { preset: "cuadros", name: "Camisa de cuadros", price: 124900, kind: "shirt",  sleeve: "long",  color: "#7A2630", pattern: "plaid", accent: "#1D2B3A" },
  { preset: "polo",    name: "Polo piqué",        price: 89900,  kind: "polo",   sleeve: "short", color: "#1E2A36", pattern: "pique" },
  { preset: "denim",   name: "Chaqueta denim",    price: 189900, kind: "jacket", sleeve: "long",  color: "#3D5E86", pattern: "denim" },
  { preset: "blazer",  name: "Blazer gris",       price: 289900, kind: "blazer", sleeve: "long",  color: "#5B6168", pattern: "herringbone", inner: "#F2F2EE" },
];

export async function ensureSample() {
  if (await db.shopBySlug("demo")) return;
  const id = uid();
  await db.saveShop({ id, slug: "demo", name: "Tienda demo", city: "Pereira", whatsapp: "", plan: "tienda", created: Date.now(), sample: true, accent: "#F08A12" });
  let i = 0;
  for (const g of SAMPLE_GARMENTS) await db.saveGarment({ id: uid(), shopId: id, source: "preset", published: true, sizes: ["S", "M", "L", "XL"], created: Date.now() + i, order: i++, ...g });
}
