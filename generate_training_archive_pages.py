#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

MONTH_NAMES_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]

CSS = """
:root{
  --bg:#f0f4fa;--panel:#ffffff;--panel2:#f7f9fd;--text:#18243a;--muted:#6b7a96;
  --blue:#2d5cef;--border:rgba(0,0,0,.08);--shadow:rgba(30,60,130,.10);
}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;direction:rtl}
.wrap{max-width:980px;margin:0 auto;padding:18px 14px 48px}
.header{padding:28px 22px 24px;border-radius:24px;background:linear-gradient(135deg,#1233a0 0%,#2358e8 52%,#0d72c4 100%);color:#fff;box-shadow:0 24px 64px var(--shadow)}
.header h1{margin:0;font-size:32px;line-height:1.1}
.headerRow{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}
.monthPicker,.archiveBtn,.homeBtn{appearance:none;border:none;border-radius:999px;padding:10px 14px;background:rgba(255,255,255,.14);color:#fff;text-decoration:none;font-weight:700}
.monthPicker{cursor:pointer;min-width:190px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
.stat{background:var(--panel2);border:1px solid var(--border);border-radius:18px;padding:12px;text-align:center;box-shadow:0 6px 20px var(--shadow)}
.stat .value{font-size:22px;font-weight:900;color:var(--blue)}
.stat .label{font-size:12px;color:var(--muted);margin-top:4px}
.searchBox{margin-top:14px;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:12px;box-shadow:0 6px 20px var(--shadow)}
.searchInput{width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:14px;font:inherit}
.cards{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.sep{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 2px}
.sep:before,.sep:after{content:"";flex:1;height:1px;background:var(--border)}
.course{background:var(--panel);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:0 8px 24px var(--shadow)}
.course.past{opacity:.55}
.course summary{list-style:none;cursor:pointer;padding:12px 14px;display:grid;grid-template-columns:46px 1fr auto;gap:12px;align-items:center;background:linear-gradient(180deg,var(--surface,#f5f8ff),var(--surface2,#e9f0ff));border-inline-start:4px solid var(--accent,#2d5cef);box-shadow:0 6px 18px rgba(0,0,0,.12)}
.course summary::-webkit-details-marker{display:none}
.icon{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;font-size:22px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.7)}
.title{font-size:17px;font-weight:900}
.meta{margin-top:4px;font-size:12px;color:var(--muted)}
.badges{display:flex;flex-direction:row;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;justify-content:center;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(255,255,255,.9)}
.today{background:#dce7ff;color:#1a3ec4}
.rows{border-top:1px solid var(--border)}
.row{display:grid;grid-template-columns:26px 90px 1fr;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--border)}
.row:first-child{border-top:none}
.row:nth-child(even){background:rgba(0,0,0,.02)}
.no{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#eef2ff;color:#5570aa;font-size:9px;font-weight:800}
.code{font-size:12px;font-weight:800}
.name{font-size:13px;font-weight:700}
.archiveGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
.archiveCard{display:block;text-decoration:none;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:18px;box-shadow:0 8px 24px var(--shadow)}
.archiveMonth{font-size:18px;font-weight:900}
.archiveMeta{margin-top:8px;color:var(--muted);font-size:12px}
.archiveLatest{display:inline-flex;margin-top:10px;padding:5px 9px;border-radius:999px;background:#e8efff;color:#1a3ec4;font-size:10px;font-weight:800}
.footer{margin-top:20px;text-align:center;color:var(--muted);font-size:11px;line-height:1.9}
.empty{display:none;margin-top:14px;padding:24px;border-radius:18px;border:1px dashed var(--border);background:rgba(255,255,255,.8);text-align:center;color:var(--muted)}
@media(max-width:720px){.stats{grid-template-columns:repeat(2,1fr)} .course summary{grid-template-columns:40px 1fr auto}.icon{width:40px;height:40px;font-size:20px}}
"""


def month_label(month_id: str) -> str:
    year, month = month_id.split("-")
    return f"{MONTH_NAMES_AR[int(month)-1]} {year}"


def date_label(iso_value: str) -> str:
    _, month, day = iso_value.split("-")
    return f"{day} {MONTH_NAMES_AR[int(month)-1]}"


def load_data(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "months" not in data or not isinstance(data["months"], list):
        raise ValueError("JSON must contain months list")
    return data


def latest_month_id(data: dict) -> str:
    return max(item["month_id"] for item in data["months"])


def count_types(courses: list[dict]) -> int:
    return len({c["title"].strip().lower() for c in courses})


def count_venues(courses: list[dict]) -> int:
    return len({c["venue"].strip().lower() for c in courses})


def count_staff(courses: list[dict]) -> int:
    return sum(len(c.get("staff", [])) for c in courses)


def month_options(months: list[dict], selected: str, in_archive: bool) -> str:
    parts = []
    for month in sorted(months, key=lambda x: x["month_id"]):
        href = f'{month["month_id"]}.html' if in_archive else f'archive/{month["month_id"]}.html'
        sel = " selected" if month["month_id"] == selected else ""
        parts.append(f'<option value="{href}"{sel}>{month_label(month["month_id"])}</option>')
    return "".join(parts)


def render_course(course: dict, today_iso: str) -> str:
    rows = []
    for i, member in enumerate(course.get("staff", []), start=1):
        rows.append(f'<div class="row"><span class="no">{i}</span><span class="code">{member["no"]}</span><span class="name">{member["name"]}</span></div>')
    is_today = course["date"] == today_iso
    past_cls = " past" if course["date"] < today_iso else ""
    open_attr = " open" if is_today else ""
    search_text = " ".join([course["title"], course.get("code", ""), course["venue"], course["time"]] + [f'{m["no"]} {m["name"]}' for m in course.get("staff", [])]).lower()
    today_badge = '<span class="badge today">اليوم</span>' if is_today else ''
    return f'''
<details class="course{past_cls}" data-search="{search_text}" data-attendees="{len(course.get("staff", []))}"{open_attr}>
  <summary style="--accent:{course["accent"]};--surface:{course["surface"]};--surface2:{course["surface2"]}">
    <div class="icon">{course["icon"]}</div>
    <div>
      <div class="title">{course["title"]}</div>
      <div class="meta">الموقع: {course["venue"]} - الوقت: {course["time"]}</div>
    </div>
    <div class="badges">
      {today_badge}
      <span class="badge">{date_label(course["date"])}  👥 {len(course.get("staff", []))}</span>
    </div>
  </summary>
  <div class="rows">{"".join(rows)}</div>
</details>
'''


def render_month_page(data: dict, selected: str, in_archive: bool) -> str:
    months = sorted(data["months"], key=lambda x: x["month_id"])
    month = next(m for m in months if m["month_id"] == selected)
    courses = sorted(month.get("courses", []), key=lambda x: x["date"])
    today_iso = date.today().isoformat()
    upcoming = [c for c in courses if c["date"] >= today_iso]
    past = sorted([c for c in courses if c["date"] < today_iso], key=lambda x: x["date"], reverse=True)
    cards = ''.join(render_course(c, today_iso) for c in upcoming)
    if past:
        cards += '<div class="sep" id="pastSep">الجلسات السابقة</div>'
        cards += ''.join(render_course(c, today_iso) for c in past)
    archive_href = 'index.html' if in_archive else 'archive/index.html'
    js = """
const input = document.getElementById('searchInput');
const cards = Array.from(document.querySelectorAll('.course'));
const empty = document.getElementById('emptyState');
const monthPicker = document.getElementById('monthPicker');
input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  let visible = 0;
  cards.forEach(card => {
    const ok = !q || (card.dataset.search || '').includes(q);
    card.style.display = ok ? '' : 'none';
    if (ok) visible += 1;
  });
  const pastSep = document.getElementById('pastSep');
  if (pastSep) {
    const hasPast = cards.some(card => card.style.display !== 'none' && card.classList.contains('past'));
    pastSep.style.display = hasPast ? '' : 'none';
  }
  empty.style.display = visible ? 'none' : 'block';
});
monthPicker.addEventListener('change', () => { window.location.href = monthPicker.value; });
"""
    body = f"""
<div class=\"wrap\"> 
  <div class=\"header\"> 
    <h1>دورات التدريب - {month_label(selected)}</h1>
    <div class=\"headerRow\"> 
      <select id=\"monthPicker\" class=\"monthPicker\">{month_options(months, selected, in_archive)}</select>
      <a class=\"archiveBtn archiveLink\" href=\"{archive_href}\">الأرشيف</a>
    </div>
  </div>

  <div class=\"stats\"> 
    <div class=\"stat\"><div class=\"value\">{len(courses)}</div><div class=\"label\">الجلسات</div></div>
    <div class=\"stat\"><div class=\"value\">{count_types(courses)}</div><div class=\"label\">الأنواع</div></div>
    <div class=\"stat\"><div class=\"value\">{count_staff(courses)}</div><div class=\"label\">الموظفون</div></div>
    <div class=\"stat\"><div class=\"value\">{count_venues(courses)}</div><div class=\"label\">المواقع</div></div>
  </div>

  <div class=\"searchBox\"><input id=\"searchInput\" class=\"searchInput\" placeholder=\"ابحث برقم الموظف أو الاسم أو اسم الدورة\"></div>
  <div class=\"cards\">{cards}</div>
  <div class=\"empty\" id=\"emptyState\">لا توجد دورات مطابقة للبحث الحالي.</div>
  <div class=\"footer\"><strong>المصدر:</strong> أرشيف GitHub الشهري<br><strong>تم الإنشاء:</strong> {date.today().isoformat()}</div>
</div>
<script>{js}</script>
"""
    return f"""<!doctype html>
<html lang=\"ar\"> 
<head>
  <meta charset=\"utf-8\"> 
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> 
  <title>دورات التدريب - {month_label(selected)}</title>
  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"> 
  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>
  <link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=Sora:wght@400;600;700;800;900&display=swap\" rel=\"stylesheet\"> 
  <style>{CSS}</style>
</head>
<body>{body}</body>
</html>"""


def render_archive_index(data: dict) -> str:
    months = sorted(data["months"], key=lambda x: x["month_id"], reverse=True)
    latest = latest_month_id(data)
    cards = []
    for month in months:
        courses = month.get("courses", [])
        latest_badge = '<span class="archiveLatest">الأحدث</span>' if month["month_id"] == latest else ''
        cards.append(
            f'<a class="archiveCard" href="{month["month_id"]}.html">'
            f'<div class="archiveMonth">{month_label(month["month_id"])}</div>'
            f'<div class="archiveMeta">{len(courses)} جلسة • {count_staff(courses)} موظف • {count_venues(courses)} موقع</div>'
            f'{latest_badge}</a>'
        )
    body = f"""
<div class=\"wrap\"> 
  <div class=\"header\"> 
    <h1>أرشيف الدورات</h1>
    <div class=\"headerRow\"><a class=\"homeBtn archiveLink\" href=\"../index.html\">أحدث شهر</a></div>
  </div>
  <div class=\"archiveGrid\">{"".join(cards)}</div>
  <div class=\"footer\"><strong>المصدر:</strong> أرشيف GitHub الشهري<br><strong>تم الإنشاء:</strong> {date.today().isoformat()}</div>
</div>
"""
    return f"""<!doctype html>
<html lang=\"ar\"> 
<head>
  <meta charset=\"utf-8\"> 
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> 
  <title>أرشيف الدورات</title>
  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"> 
  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>
  <link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=Sora:wght@400;600;700;800;900&display=swap\" rel=\"stylesheet\"> 
  <style>{CSS}</style>
</head>
<body>{body}</body>
</html>"""


def build_site(data: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    latest = latest_month_id(data)
    (out_dir / "index.html").write_text(render_month_page(data, latest, in_archive=False), encoding="utf-8")
    (archive / "index.html").write_text(render_archive_index(data), encoding="utf-8")
    for month in sorted(data["months"], key=lambda x: x["month_id"]):
        (archive / f'{month["month_id"]}.html').write_text(render_month_page(data, month["month_id"], in_archive=True), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate archive pages site")
    parser.add_argument("data_file", type=Path)
    parser.add_argument("-o", "--output-dir", type=Path, default=Path("."))
    args = parser.parse_args()
    data = load_data(args.data_file)
    build_site(data, args.output_dir)
    print(f"[OK] built site in {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
