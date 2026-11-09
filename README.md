# Atajo Studio – Website & Internal Tools

Website and internal tools for **Atajo Studio**, my personal AI automation studio for
clothing stores (Pereira and Dosquebradas, Colombia). We automate WhatsApp customer
service, product photography and virtual try-on for small fashion retailers.

The project has two parts:

1. **Main website**: presents the studio, its three services, the process, FAQ and a
   demo request form. It includes a **virtual try-on demo**: the garment worn on a
   neutral mannequin next to a 3D version of the same garment that visitors can rotate.
2. **Lead radar**: currently an internal Excel file that will evolve into an
   interactive web app for sales.

> **Status:** early working demo (a single HTML file). Most of the work is still ahead:
> finishing the site, building a full live try-on system and taking the overall
> design to a professional level. See [ROADMAP.md](ROADMAP.md).
>
> **Data:** the lead radar only uses publicly available **company-level** information
> from Colombian government open-data portals. It does not store data about
> individuals. This repository contains **synthetic data only** (`sample_data/`).

## Demo

Not deployed yet; deployment is on the roadmap.
<!-- TODO: add the live URL and 1–2 screenshots once deployed -->

## Features (current demo)

### Website
- Hero, "what we solve" section, three services (WhatsApp, photos, try-on), process,
  FAQ and contact.
- **Virtual try-on demo**: an illustration of the garment on a featureless mannequin,
  side by side with a procedural 3D garment (Three.js) that the visitor drags to rotate. No camera is used
  and no visitor images or data are collected.
- Demo request form with client-side validation (no backend yet).

### Lead radar
- Consolidated list of potential client stores built from public sources.
- Prioritization by industry, city and digital presence.

## Tech stack

- **Current:** one self-contained HTML file with inline CSS and JavaScript.
- **3D:** Three.js r128 (CDN), procedural garment geometry, drag-to-rotate.
- **Fonts:** Google Fonts (Grenze, Unbounded, Figtree, JetBrains Mono).
- **Lead radar:** Excel → (next) Python + FastAPI + web frontend.
- **Next step:** evaluate migrating to a modern stack (e.g. Vite or Next.js with
  Three.js / React Three Fiber) for a much richer try-on experience. See ROADMAP, section 0.

## Project structure

```
.
├── web/
│   ├── index.html                # website + 3D try-on demo (single file for now)
│   └── mannequin.svg             # try-on demo illustration
├── scripts/
│   └── generate_sample_data.py   # synthetic data generator for the lead radar
├── sample_data/                  # fake data for development and demos
├── .env.example
├── ROADMAP.md
└── LICENSE
```

## Getting started

```bash
git clone https://github.com/Juanqita/atajo-studio.git
cd atajo-studio

# Website (static HTML for now)
python -m http.server 8000 --directory web   # → http://localhost:8000

# Synthetic data for the lead radar
python scripts/generate_sample_data.py --rows 200 --xlsx
```

## License

[MIT](LICENSE) © 2026 Juan Camilo Peláez Machado
