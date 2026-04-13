#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup


def parse_css_vars(style_text: str) -> dict[str, str]:
    pairs = {}
    for part in (style_text or "").split(";"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key.startswith("--") and value:
            pairs[key] = value
    return pairs


def clean_text(value: str) -> str:
    return " ".join((value or "").split()).strip()


def parse_meta(summary) -> tuple[str, str]:
    venue = ""
    time_value = ""
    for meta in summary.select(".miniMeta"):
        label_el = meta.find("strong")
        label = clean_text(label_el.get_text(" ", strip=True)).lower() if label_el else ""
        full_text = clean_text(meta.get_text(" ", strip=True))
        if label and full_text.lower().startswith(label):
            content = clean_text(full_text[len(label):])
        else:
            content = full_text
        if "venue" in label or "الموقع" in label:
            venue = content
        elif "time" in label or "الوقت" in label:
            time_value = content
    return venue, time_value


def parse_source_html(html_text: str) -> dict[str, Any]:
    soup = BeautifulSoup(html_text, "html.parser")
    title_el = soup.select_one("#pageTitle")
    page_title = clean_text(title_el.get_text(" ", strip=True)) if title_el else "Training Courses"

    month_groups: dict[str, dict[str, Any]] = {}

    for card in soup.select(".courseCard"):
        date_value = clean_text(card.get("data-date", ""))
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_value):
            continue

        month_id = date_value[:7]
        summary = card.select_one(".courseHead")
        css_vars = parse_css_vars(summary.get("style", "") if summary else "")
        title = clean_text(card.select_one(".courseTitle").get_text(" ", strip=True) if card.select_one(".courseTitle") else "")
        icon = clean_text(card.select_one(".courseIcon").get_text(" ", strip=True) if card.select_one(".courseIcon") else "📘")
        venue, time_value = parse_meta(summary) if summary else ("", "")

        course = {
            "date": date_value,
            "code": title.split("–", 1)[0].strip() if "–" in title else "",
            "title": title,
            "icon": icon,
            "venue": venue,
            "time": time_value,
            "accent": css_vars.get("--accent", "#2d5cef"),
            "surface": css_vars.get("--surface", "rgba(235,241,255,.95)"),
            "surface2": css_vars.get("--surface2", "rgba(218,230,255,.98)"),
            "pill": css_vars.get("--pill", "rgba(45,92,239,.20)"),
            "text_on_acc": css_vars.get("--text-on-acc", "#1a337d"),
            "staff": [],
        }

        for row in card.select(".empRow"):
            code = clean_text(row.select_one(".empCode").get_text(" ", strip=True) if row.select_one(".empCode") else "")
            name_node = row.select_one(".empName")
            if name_node:
                for badge in name_node.select(".favBadge"):
                    badge.extract()
                staff_name = clean_text(name_node.get_text(" ", strip=True))
            else:
                staff_name = ""
            if code or staff_name:
                course["staff"].append({"no": code, "name": staff_name})

        if month_id not in month_groups:
            month_groups[month_id] = {
                "month_id": month_id,
                "title_en": page_title,
                "title_ar": "دورات التدريب",
                "courses": [],
            }

        month_groups[month_id]["courses"].append(course)

    return {"months": sorted(month_groups.values(), key=lambda item: item["month_id"])}


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse the training source HTML into structured monthly JSON.")
    parser.add_argument("input_html", type=Path, help="Path to the source HTML file")
    parser.add_argument("-o", "--output", type=Path, default=Path("parsed_training_data.json"), help="Output JSON path")
    args = parser.parse_args()

    html_text = args.input_html.read_text(encoding="utf-8")
    parsed = parse_source_html(html_text)
    args.output.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] wrote {args.output}")


if __name__ == "__main__":
    main()
