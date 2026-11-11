# Roadmap

The project is an early demo: a static site with a basic 3D try-on.
This is the planned work. Total estimate: **100–130 h**.

**Privacy rules for every phase:** the try-on never stores, uploads or logs images of
the people using it, and the project never keeps personal or customer data. Garment
data is read at runtime from the store's own catalog; the repository only contains
synthetic or illustrative data.

## 0. Technical assessment & stack migration (~8–12 h)
- [ ] Audit the current site: structure, performance, accessibility, maintainability
- [ ] Clean up the exported HTML (proper `<head>`, split CSS/JS into files)
- [ ] Choose the target stack with explicit criteria (UX, 3D performance, SEO, maintenance)
  - Options: HTML + Vite + Three.js · Next.js + React Three Fiber · Astro + 3D islands
- [ ] Document the decision (`docs/adr/0001-stack.md`)
- [ ] Migrate the site to the chosen stack without losing functionality
- [ ] Upgrade Three.js from r128 to a current release
- [ ] First public deployment (Netlify / Vercel)

## 1. Live virtual try-on – full system (~25 h) ⭐ priority
- [ ] Replace the procedural garment with real 3D garment models (GLB/GLTF)
- [ ] Two-column layout: full head-to-toe outfit + zoomed-in garment view, kept in sync
- [x] Neutral mannequin in the try-on demo image (no real person)
- [ ] Neutral 3D mannequin as the base of the live outfit view
- [ ] Garment and outfit selector (top, bottom, footwear, accessories) with prices
- [ ] Smooth 360° rotation with mouse and touch, zoom and view presets (front, back, side)
- [ ] Studio lighting, PBR fabric materials, soft shadows and HDRI environment
- [ ] Polished transitions and micro-interactions when switching garments
- [ ] Model optimization (Draco, compressed textures, lazy loading)
- [ ] Fallback for devices without WebGL or low-end hardware
- [ ] Share or capture the outfit

## 2. Main website – to a professional level (~15–20 h)
- [ ] Refined design system: typography, color, spacing and components
- [ ] Rework sections: services, use cases, process, FAQ, contact
- [ ] Fully responsive and accessible (WCAG AA)
- [ ] Performance: Lighthouse > 90, optimized images
- [ ] Technical SEO: metadata, Open Graph, sitemap
- [ ] Working demo request form (backend or form service) with spam protection
- [ ] Privacy-friendly basic analytics

## 3. Lead radar: from Excel to an interactive app (~15 h)
- [x] Synthetic data generator (`scripts/generate_sample_data.py`)
- [ ] Data model and API (FastAPI + SQLite)
- [ ] Interactive view: table with filters (industry, city, score) and store detail
- [ ] Lead stages (new → contacted → proposal → closed) and notes
- [ ] Excel import/export
- [ ] Connect the website demo form to the radar

## 4. Quality & operations (~5 h)
- [x] Version control, MIT license, `.gitignore`, `.env.example`
- [ ] Linting and formatting (ESLint/Prettier, ruff)
- [ ] Basic tests for key components and the API
- [ ] CI with GitHub Actions
- [ ] Continuous deployment of the website

## 5. Live camera try-on – privacy by design (~25–30 h)
Customers see a garment on themselves through their own camera, in real time.
- [ ] Architecture decision record: on-device processing only (`docs/adr/0002-live-try-on-privacy.md`)
- [ ] Camera access with explicit opt-in and a visible "camera on" indicator; stops when the tab is hidden
- [ ] Frames are processed in memory, in the browser (WebGL/WebGPU); no frame is ever sent to a server
- [ ] No storage of any kind: no uploads, no canvas exports, no local storage, no analytics on frames
- [ ] Body/pose landmarks with a pretrained, client-side library (e.g. MediaPipe); no model training in this project
- [ ] Garment overlay anchored to shoulders and hips; scale and rotation follow the pose
- [ ] Graceful fallback to the 3D mannequin view when the camera is denied or unavailable
- [ ] Automated test that fails if the try-on code calls any network or storage API with image data
- [ ] Privacy notice in the UI and in the data policy page

## 6. Catalog connectors (~10–15 h)
Garments come from the store's existing system; nothing is copied into this project.
- [ ] Connector interface: list products, garment images, sizes, colors and prices
- [ ] Adapters for common store backends (e.g. Shopify, WooCommerce) through their official APIs
- [ ] Mock connector with synthetic garments for development and tests
- [ ] Credentials only through environment variables (`.env`, never committed)
- [ ] Read-only access; no customer, order or business records are requested or stored
- [ ] Caching limited to public product data, with expiry
