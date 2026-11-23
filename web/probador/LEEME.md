# Atajo Probador · MVP

Plataforma por suscripción para que las tiendas de ropa tengan su propio probador virtual. Esta es la **versión demo**: todo corre en el navegador y los datos se guardan en ese navegador (IndexedDB). No hay servidor, cobros ni cuentas reales todavía.

## Qué se puede mostrar

| Ruta | Qué es |
|---|---|
| `#/` | Página de inicio del producto con planes |
| `#/planes` | Detalle de los planes Vitrina, Tienda y Cadena |
| `#/registro` | Crear una tienda (nombre, enlace, WhatsApp, plan) |
| `#/panel` | Panel de la tienda: resumen, primeros pasos y lo que viene |
| `#/panel/prendas` | Catálogo: publicar, ocultar, editar, probar |
| `#/panel/prendas/nueva` | Captura guiada: consejos, foto con revisión de luz, nitidez y fondo, recorte automático (sensibilidad elegida sola), puntos de hombros, ruedo, axilas, codos y puños con vista previa en dos poses, datos y caída de la tela |
| `#/panel/compartir` | Enlace, código QR, botón para web (`widget.js`) y modo tótem |
| `#/panel/analitica` | Sesiones, pedidos iniciados, prendas más probadas (con datos de ejemplo opcionales y marcados) |
| `#/panel/plan` | Uso del plan y cambio de plan |
| `#/t/<tienda>` | Probador público de la tienda (cámara o foto) con botón Pedir por WhatsApp |
| `#/t/<tienda>/totem` | Modo tótem para vitrina |

Viene una **tienda demo** (`#/t/demo`) con las 7 prendas de la demo de Novecento.

## Cómo abrirla

La cámara exige HTTPS o `localhost`:

```bash
python3 -m http.server 8000   # luego http://localhost:8000
```

En producción se publica como sitio estático (Netlify).

## Estructura

- `index.html`, `css/app.css`
- `js/app.js`: rutas y pantallas
- `js/db.js`: datos (tiendas, prendas, eventos) y planes
- `js/tryon.js`: probador en vivo (MediaPipe Pose Landmarker, Apache 2.0)
- `js/engine.js`: dibujo de prendas procedurales, silueta guía y maniquí
- `js/garment.js`: prenda fotografiada con malla (torso 6x8 deformable con giro, mangas en dos tramos, resortes) dibujada con WebGL2; respaldo Canvas 2D (`texTri`)
- `js/filters.js`: filtro One Euro para los puntos de MediaPipe y resorte amortiguado; rigidez por tipo de prenda
- `js/ambient.js`: luz del ambiente sobre la prenda y manos por delante de la camisa (tono de piel de la cara)
- `js/capture.js`: revisión de calidad, recorte de fondo, puntos sugeridos (incluye mangas)
- `widget.js`: botón "Pruébatelo" para cualquier web
- `lib/`, `wasm/`, `models/`: MediaPipe vendorizado (funciona sin CDN)
- `vendor/qrcode.js`: generador de QR (MIT, Kazuhiko Arase)

## Siguientes pasos (plan por módulos)

1. Backend real con Supabase: cuentas con correo o Google, datos por tienda (RLS) y almacenamiento de fotos.
2. Cobro recurrente con Wompi y factura electrónica.
3. Foto realista con IA (FASHN o Kling vía fal.ai) con consentimiento y borrado a las 24 h.
4. Modelos 3D desde las fotos (Meshy o Tripo) con visor 360° y AR.
5. Integraciones Shopify y WooCommerce.

## Límites conocidos

- El espejo en vivo es 2D: muestra estilo, color y estampado, no la talla ni la caída real. Las mangas siguen los brazos y la prenda se mece, pero no hay simulación de tela.
- Si el probador baja de 15 cuadros por segundo, apaga solo las manos por delante y la sombra (modo liviano).
- Las manos por delante se detectan por el tono de piel de la cara; con guantes, tapabocas o luz muy rara pueden fallar.
- El recorte automático funciona con prendas sobre fondo liso que contraste; en la versión con servidor se usará un modelo de recorte.
- Los datos de la demo no se comparten entre navegadores: una tienda creada en un equipo no aparece en otro.
