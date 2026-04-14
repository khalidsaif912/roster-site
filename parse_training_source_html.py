#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def clean_text(value: str) -> str:
    text = (value or "").replace("\xa0", " ")
    return " ".join(text.split()).strip()


def extract_style_value(style_text: str, prop: str) -> str:
    if not style_text:
        return ""
    m = re.search(rf"(?:^|;)\s*{re.escape(prop)}\s*:\s*([^;]+)", style_text, re.I)
    return m.group(1).strip() if m else ""


def parse_date_text(text: str) -> str:
    cleaned = clean_text(text)
    cleaned = re.sub(r"(?i)\bdate\s*:\s*", "", cleaned)
    cleaned = re.sub(r"\b(\d{1,2})\s*(st|nd|rd|th)\b", r"\1", cleaned, flags=re.I)
    cleaned = clean_text(cleaned)
    # Accept forms like 06 April 2026
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", cleaned)
    if not m:
        raise ValueError(f"Could not parse date from: {text!r}")
    day = int(m.group(1))
    month_name = m.group(2).lower()
    year = int(m.group(3))
    month = MONTHS[month_name]
    return f"{year:04d}-{month:02d}-{day:02d}"


TITLE_PATTERNS = [
    re.compile(r"^(date|venue|time)\s*:", re.I),
    re.compile(r"^(no\.?|staff\s*no\.?|staff\s*name)\b", re.I),
    re.compile(r"^dear\b", re.I),
    re.compile(r"^please\s+check\b", re.I),
    re.compile(r"^kind\s+regards\b", re.I),
]


def looks_like_title(text: str) -> bool:
    value = clean_text(text)
    if not value:
        return False
    return not any(p.search(value) for p in TITLE_PATTERNS)


KEYWORD_ICONS = [
    (re.compile(r"security", re.I), "🔐"),
    (re.compile(r"safety", re.I), "🦺"),
    (re.compile(r"human factors", re.I), "🧠"),
    (re.compile(r"forklift", re.I), "🚜"),
    (re.compile(r"sms", re.I), "🛡️"),
    (re.compile(r"dgr", re.I), "📦"),
    (re.compile(r"dangerous goods", re.I), "📦"),
    (re.compile(r"cargo", re.I), "✈️"),
]


def pick_icon(title: str) -> str:
    for pattern, icon in KEYWORD_ICONS:
        if pattern.search(title):
            return icon
    return "📘"


DEFAULT_SURFACE = "rgba(235,241,255,.95)"
DEFAULT_SURFACE2 = "rgba(218,230,255,.98)"
DEFAULT_PILL = "rgba(45,92,239,.20)"
DEFAULT_ACCENT = "#2d5cef"
DEFAULT_TEXT_ON_ACC = "#1a337d"


def build_color_fields(table) -> dict[str, str]:
    first_cell = table.select_one("tr td")
    style = first_cell.get("style", "") if first_cell else ""
    bg = extract_style_value(style, "background-color") or DEFAULT_SURFACE2
    return {
        "accent": bg,
        "surface": bg,
        "surface2": bg,
        "pill": DEFAULT_PILL,
        "text_on_acc": DEFAULT_TEXT_ON_ACC,
    }


def extract_course_header(table) -> dict[str, str] | None:
    first_row = table.select_one("tr")
    if not first_row:
        return None
    cell = first_row.select_one("td")
    if not cell:
        return None

    lines = [clean_text(p.get_text(" ", strip=True)) for p in cell.select("p")]
    lines = [line for line in lines if line]
    if not lines:
        return None

    title = ""
    date_value = ""
    venue = ""
    time_value = ""

    for line in lines:
        low = line.lower()
        if low.startswith("date"):
            date_value = parse_date_text(line)
        elif low.startswith("venue"):
            venue = clean_text(re.sub(r"(?i)^venue\s*:\s*", "", line))
        elif low.startswith("time"):
            time_value = clean_text(re.sub(r"(?i)^time\s*:\s*", "", line))
        elif not title and looks_like_title(line):
            title = line

    if not title or not date_value:
        return None

    return {
        "title": title,
        "date": date_value,
        "venue": venue,
        "time": time_value,
    }


HEADER_ROW_PATTERNS = [
    re.compile(r"staff\s*no", re.I),
    re.compile(r"staff\s*name", re.I),
]


def is_header_row(cells: list[str]) -> bool:
    if not cells:
        return False
    text = " | ".join(cells)
    return all(p.search(text) for p in HEADER_ROW_PATTERNS)


def extract_staff_rows(table) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    started = False
    for tr in table.select("tr"):
        cells = [clean_text(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        if not cells:
            continue
        if is_header_row(cells):
            started = True
            continue
        if not started:
            continue
        if len(cells) < 3:
            continue
        staff_no = clean_text(cells[1])
        staff_name = clean_text(cells[2])
        if not staff_no and not staff_name:
            continue
        rows.append({"no": staff_no, "name": staff_name})
    return rows


def parse_source_html(html_text: str) -> dict[str, Any]:
    soup = BeautifulSoup(html_text, "html.parser")
    month_groups: dict[str, dict[str, Any]] = {}

    for table in soup.find_all("table"):
        header = extract_course_header(table)
        if not header:
            continue
        staff = extract_staff_rows(table)
        month_id = header["date"][:7]
        colors = build_color_fields(table)
        title = header["title"]

        course = {
            "date": header["date"],
            "code": "",
            "title": title,
            "icon": pick_icon(title),
            "venue": header["venue"],
            "time": header["time"],
            **colors,
            "staff": staff,
        }

        group = month_groups.setdefault(
            month_id,
            {
                "month_id": month_id,
                "title_en": "Training Courses",
                "title_ar": "دورات التدريب",
                "courses": [],
            },
        )
        group["courses"].append(course)

    for group in month_groups.values():
        group["courses"].sort(key=lambda item: item["date"])

    return {"months": [month_groups[key] for key in sorted(month_groups.keys())]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse Outlook-style training HTML tables into structured monthly JSON.")
    parser.add_argument("input_html", type=Path, help="Path to source HTML file")
    parser.add_argument("-o", "--output", type=Path, default=Path("parsed_training_data.json"), help="Output JSON path")
    args = parser.parse_args()

    html_text = args.input_html.read_text(encoding="utf-8", errors="replace")
    parsed = parse_source_html(html_text)
    args.output.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] wrote {args.output}")


if __name__ == "__main__":
    main()
