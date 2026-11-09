"""Generate synthetic data for the ConsultorIA B2B lead radar.

Every record is fictional: company names, tax IDs (NIT), domains and Instagram
handles are made up by combining fixed word lists. Only company-level data is
modeled (no data about individuals). Domains use `.example.co` so they can
never point to a real site.

Usage:
    python scripts/generate_sample_data.py --rows 200 --seed 42
    python scripts/generate_sample_data.py --rows 500 --xlsx
"""

from __future__ import annotations

import argparse
import csv
import random
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path

NAME_PREFIXES = ["Grupo", "Comercializadora", "Inversiones", "Distribuidora", "Servicios",
                 "Soluciones", "Industrias", "Consultores", "Agro", "Tecno"]
NAME_CORES = ["Andina", "del Oriente", "Santandereana", "Cafetera", "Altiplano", "Horizonte",
              "Montaña Verde", "Río Claro", "Nueva Era", "Puerto Sol", "Los Pinos", "Chicamocha"]
LEGAL_SUFFIXES = ["S.A.S.", "S.A.", "Ltda.", "S.A.S. BIC"]

# Industries with their reference CIIU code (Colombian adaptation of ISIC Rev. 4)
INDUSTRIES = [
    ("Retail", "4711"),
    ("Restaurants", "5611"),
    ("Building construction", "4111"),
    ("Management consulting", "7020"),
    ("Freight transport", "4923"),
    ("Non-formal education", "8559"),
    ("Healthcare provider", "8621"),
    ("Hotels", "5511"),
    ("Software development", "6201"),
    ("Agribusiness", "1011"),
    ("Real estate", "6810"),
    ("Advertising", "7310"),
]

# (city, department, landline area code)
CITIES = [
    ("Bucaramanga", "Santander", "607"), ("Floridablanca", "Santander", "607"),
    ("Girón", "Santander", "607"), ("Piedecuesta", "Santander", "607"),
    ("Bogotá", "Cundinamarca", "601"), ("Medellín", "Antioquia", "604"),
    ("Pereira", "Risaralda", "606"), ("Cali", "Valle del Cauca", "602"),
    ("Barranquilla", "Atlántico", "605"), ("Cúcuta", "Norte de Santander", "607"),
]

SOURCES = ["RUES", "datos.gov.co", "SECOP II", "Instagram Graph API"]
COMPANY_SIZES = ["Micro", "Small", "Medium", "Large"]
LEAD_STAGES = ["New", "Contacted", "In conversation", "Proposal sent", "Discarded"]

FIELDS = ["nit", "company_name", "industry", "ciiu_code", "company_size", "city", "department",
          "website", "corporate_email", "landline", "instagram", "ig_followers",
          "has_website", "source", "extracted_on", "opportunity_score", "lead_stage"]


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def nit_check_digit(nit: str) -> int:
    """DIAN check digit, so generated tax IDs have a realistic format."""
    weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    total = sum(int(d) * weights[i] for i, d in enumerate(reversed(nit)))
    r = total % 11
    return r if r < 2 else 11 - r


def make_company(rng: random.Random, used_names: set[str]) -> dict:
    max_unique = len(NAME_PREFIXES) * len(NAME_CORES)
    while True:
        name = f"{rng.choice(NAME_PREFIXES)} {rng.choice(NAME_CORES)}"
        if name not in used_names:
            break
        if len(used_names) >= max_unique:
            name = f"{name} {len(used_names)}"
            break
    used_names.add(name)

    industry, ciiu = rng.choice(INDUSTRIES)
    city, department, area_code = rng.choice(CITIES)
    base_nit = str(rng.randint(900_000_000, 909_999_999))
    domain = f"{slugify(name)}.example.co"
    has_website = rng.random() < 0.6
    has_instagram = rng.random() < 0.75
    followers = int(rng.lognormvariate(7, 1.4)) if has_instagram else 0

    # Simple score: more opportunity when digital presence is weak
    score = 50
    score += 20 if not has_website else 0
    score += 15 if 0 < followers < 2_000 else 0
    score += rng.randint(-10, 15)

    return {
        "nit": f"{base_nit}-{nit_check_digit(base_nit)}",
        "company_name": f"{name} {rng.choice(LEGAL_SUFFIXES)}",
        "industry": industry,
        "ciiu_code": ciiu,
        "company_size": rng.choices(COMPANY_SIZES, weights=[45, 35, 15, 5])[0],
        "city": city,
        "department": department,
        "website": f"https://www.{domain}" if has_website else "",
        "corporate_email": f"contacto@{domain}",
        "landline": f"+57 {area_code} {rng.randint(600, 699)} {rng.randint(1000, 9999)}",
        "instagram": f"@{slugify(name)}_oficial" if has_instagram else "",
        "ig_followers": followers,
        "has_website": has_website,
        "source": rng.choice(SOURCES),
        "extracted_on": (date(2026, 1, 1) + timedelta(days=rng.randint(0, 300))).isoformat(),
        "opportunity_score": max(0, min(100, score)),
        "lead_stage": rng.choices(LEAD_STAGES, weights=[50, 20, 15, 10, 5])[0],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rows", type=int, default=200, help="number of companies (default: 200)")
    parser.add_argument("--seed", type=int, default=42, help="random seed for reproducibility")
    parser.add_argument("--out", type=Path, default=Path("sample_data/lead_radar_sample.csv"))
    parser.add_argument("--xlsx", action="store_true",
                        help="also export to .xlsx (requires pandas + openpyxl)")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    used_names: set[str] = set()
    rows = [make_company(rng, used_names) for _ in range(args.rows)]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"✓ {len(rows)} synthetic companies → {args.out}")

    if args.xlsx:
        import pandas as pd
        xlsx_path = args.out.with_suffix(".xlsx")
        pd.DataFrame(rows, columns=FIELDS).to_excel(xlsx_path, index=False)
        print(f"✓ Excel → {xlsx_path}")


if __name__ == "__main__":
    main()
