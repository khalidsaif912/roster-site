#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate Import roster pages under docs/import/ using the same UI as Export.

Key points:
- Reads Excel from env: IMPORT_EXCEL_URL (SharePoint/OneDrive share link is OK).
- DOES NOT touch Export outputs (docs/*), only docs/import/*.
- Treats each month as a sheet, and departments are in the first column (JD codes).
- Uses an editable mapping dict (DEPT_FULL) to show full department names.

Outputs:
- docs/import/index.html         (today, Muscat time)
- docs/import/now/index.html     (alias to today's duty roster page for "Now")
- docs/import/schedules/<id>.json  (per-employee month schedule for Import My Schedule page)
- docs/import/my-schedules/index.html (simple My Schedule viewer)

Note: You can integrate this with your existing My Schedule UI later.
"""

from __future__ import annotations

import os
import re
import json
import datetime as dt
import calendar
from pathlib import Path
from typing import Dict, Any, List, Tuple

import requests
import pandas as pd


# =========================
# CONFIG
# =========================
MUSCAT_UTC_OFFSET_HOURS = 4

# Department code -> full name (EDIT THIS)
DEPT_FULL: Dict[str, str] = {
    "SUPV": "Supervisors",
    "FLTI": "Flight Dispatch (Import)",
    "FLTE": "Flight Dispatch (Export)",
    "CHKR": "Import Checkers",
    "OPTR": "Import Operators",
    "DOCS": "Documentation",
    "RELC": "Release Control",
}

# If you want Arabic display names too, you can extend this dict later.
# DEPT_FULL_AR = {...}


# =========================
# HELPERS
# =========================
def muscat_today() -> dt.date:
    now_utc = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)
    muscat = now_utc.astimezone(dt.timezone(dt.timedelta(hours=MUSCAT_UTC_OFFSET_HOURS)))
    return muscat.date()




def month_start(d: dt.date) -> dt.date:
    return dt.date(d.year, d.month, 1)

def add_months(d: dt.date, delta: int) -> dt.date:
    y = d.year + (d.month - 1 + delta) // 12
    m = (d.month - 1 + delta) % 12 + 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return dt.date(y, m, day)

def iter_month_days(year: int, month: int):
    dim = calendar.monthrange(year, month)[1]
    for day in range(1, dim + 1):
        yield dt.date(year, month, day)

def _candidate_urls(url: str) -> list:
    """
    Return a list of candidate download URLs to try in order.
    Handles SharePoint personal (/p/) and group (/s/) links,
    OneDrive consumer, and short 1drv.ms links.
    """
    import base64 as _b64
    from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

    candidates = []
    u = urlparse(url)
    host = (u.netloc or "").lower()

    is_sp = "sharepoint.com" in host
    is_od = "onedrive.live.com" in host or "1drv.ms" in host

    if not (is_sp or is_od):
        return [url]

    # Strategy 1: OneDrive Sharing API (base64-encoded share URL)
    encoded = _b64.b64encode(url.encode("utf-8")).decode("utf-8")
    encoded = encoded.rstrip("=").replace("/", "_").replace("+", "-")
    candidates.append(f"https://api.onedrive.com/v1.0/shares/u!{encoded}/root/content")

    # Strategy 2: append ?download=1 to original URL
    qs = dict(parse_qsl(u.query, keep_blank_values=True))
    qs["download"] = "1"
    u2 = u._replace(query=urlencode(qs, doseq=True))
    candidates.append(urlunparse(u2))

    # Strategy 3: replace /p/ path with /s/ path (personal → shared)
    new_path = u.path.replace("/:x:/p/", "/:x:/s/").replace("/:t:/p/", "/:t:/s/")
    if new_path != u.path:
        u3 = u._replace(path=new_path, query=urlencode(qs, doseq=True))
        candidates.append(urlunparse(u3))

    # Strategy 4: original URL as-is (last resort)
    candidates.append(url)

    return candidates


def download_excel(url: str) -> bytes:
    """Download Excel from OneDrive/SharePoint share link — tries multiple strategies."""
    if not url:
        raise ValueError("IMPORT_EXCEL_URL is empty")

    headers = {
        "User-Agent": "Mozilla/5.0 (GitHub Actions) roster-site",
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
    }

    last_error = ""
    for i, dl_url in enumerate(_candidate_urls(url), 1):
        print(f"    [Strategy {i}] Trying: {dl_url[:90]}...")
        try:
            r = requests.get(dl_url, headers=headers, timeout=90, allow_redirects=True)
            r.raise_for_status()
            data = r.content or b""
            ctype = (r.headers.get("Content-Type") or "").lower()
            if data.startswith(b"PK"):
                print(f"    ✅ Strategy {i} succeeded!")
                return data
            hint = " (got HTML — link may require sign-in)" if "text/html" in ctype else ""
            last_error = f"Not a valid .xlsx (Content-Type: {ctype or 'unknown'}){hint}"
            print(f"    ⚠️  Strategy {i} got non-xlsx response — trying next...")
        except Exception as e:
            last_error = str(e)
            print(f"    ⚠️  Strategy {i} failed: {e} — trying next...")

    raise ValueError(
        f"All download strategies failed for IMPORT_EXCEL_URL.\n"
        f"Last error: {last_error}\n"
        f"Make sure the SharePoint link is shared as 'Anyone with the link'."
    )


def download_text(url: str) -> str:
    """Download a small text file (like source_name.txt).

    OneDrive/SharePoint may serve text with ambiguous encoding.
    We try UTF-8 (with/without BOM) first, then Windows-1256 for Arabic.
    """
    if not url:
        return ""
    headers = {"User-Agent": "Mozilla/5.0 (GitHub Actions) roster-site"}
    for dl_url in _candidate_urls(url):
        try:
            r = requests.get(dl_url, headers=headers, timeout=30, allow_redirects=True)
            r.raise_for_status()

            raw = r.content
            for enc in ("utf-8-sig", "utf-8", "cp1256", "windows-1256", "latin-1"):
                try:
                    text = raw.decode(enc, errors="strict").strip()
                    if text and not text.startswith("<!"):
                        return text
                except Exception:
                    continue
        except Exception:
            continue
    return ""



def shift_bucket(code: str) -> Tuple[str, str, str, str, str]:
    """Return (bucket, icon, accent, bg, text_color)"""
    s = (code or "").strip().upper()
    if not s:
        return ("Other", "•", "#94a3b8", "#f1f5f9", "#475569")

    if s in {"O", "OFF", "OFFDAY", "OFF DAY"}:
        return ("Off Day", "🛋️", "#6366f1", "#e0e7ff", "#3730a3")
    if s.startswith(("MN", "ME")):
        return ("Morning", "☀️", "#f59e0b", "#fef3c7", "#92400e")
    if s.startswith(("AN", "AE")):
        return ("Afternoon", "🌤️", "#f97316", "#ffedd5", "#9a3412")
    if s.startswith(("NN", "NE")):
        return ("Night", "🌙", "#8b5cf6", "#ede9fe", "#5b21b6")
    if s.startswith(("ST", "SB")):
        return ("Standby", "🧍", "#9e9e9e", "#f0f0f0", "#555555")
    if "SICK" in s or s.startswith(("SL",)):
        return ("Sick Leave", "🤒", "#ef4444", "#fee2e2", "#991b1b")
    if "ANNUAL" in s or s.startswith(("AL",)):
        return ("Annual Leave", "✈️", "#10b981", "#d1fae5", "#065f46")
    if "TR" in s or "TRAIN" in s:
        return ("Training", "🎓", "#0ea5e9", "#e0f2fe", "#075985")
    return ("Other", "•", "#94a3b8", "#f1f5f9", "#475569")


def parse_month_sheet(xlsx_path: str, sheet_name: str, override_month_key: str | None = None) -> Dict[str, Any]:
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=None)

    # Find day header row
    day_row = None
    for i in range(min(60, len(df))):
        row = df.iloc[i].astype(str).str.upper().tolist()
        if any("SUN" == str(c).strip() for c in row) and any("MON" == str(c).strip() for c in row) and any("SAT" == str(c).strip() for c in row):
            day_row = i
            break
    if day_row is None:
        raise ValueError("Could not find day header row (SUN/MON/..).")

    # Find JD header row and column dynamically (JD col may not be col 0)
    header_row = day_row + 1
    jd_col = None
    for j in range(day_row, min(day_row + 6, len(df))):
        for c in range(df.shape[1]):
            if str(df.iloc[j, c]).strip().upper() == "JD":
                header_row = j
                jd_col = c
                break
        if jd_col is not None:
            break
    if jd_col is None:
        jd_col = 0  # fallback

    name_col = jd_col + 1
    sn_col = jd_col + 2

    # Detect date columns (ints 1..31)
    date_cols: Dict[int, int] = {}
    for c in range(df.shape[1]):
        v = df.iloc[header_row, c]
        if isinstance(v, (int, float)) and not pd.isna(v) and float(v).is_integer():
            day = int(v)
            if 1 <= day <= 31:
                date_cols[day] = c
    if not date_cols:
        raise ValueError("Could not detect date columns (1..31).")

    # Employees start after header_row
    employees: List[Dict[str, Any]] = []
    for r in range(header_row + 1, len(df)):
        dept = df.iloc[r, jd_col]
        name = df.iloc[r, name_col] if df.shape[1] > name_col else None
        sn = df.iloc[r, sn_col] if df.shape[1] > sn_col else None

        # skip empty
        if pd.isna(dept) and pd.isna(name) and pd.isna(sn):
            continue

        # skip staffing rows like "17 | MORNING | ..."
        if isinstance(name, str) and name.strip().upper() == "MORNING" and (pd.isna(sn) or str(sn).strip() == ""):
            continue

        if pd.isna(name) or str(name).strip() == "" or pd.isna(sn) or str(sn).strip() == "":
            continue

        dept_s = str(dept).strip() if not pd.isna(dept) else ""
        if not dept_s or re.fullmatch(r"\d+", dept_s):
            continue

        emp_id = str(int(sn)) if isinstance(sn, (int, float)) and not pd.isna(sn) else str(sn).strip()

        # ✅ تنظيف كل النصوص من الأسطر الجديدة والمحارف الخاصة والـ surrogates
        def _clean(v: str) -> str:
            s = str(v).replace("\n", " ").replace("\r", " ").replace("\t", " ").strip()
            # إزالة الـ surrogates
            return s.encode("utf-8", errors="replace").decode("utf-8")

        dept_s = _clean(dept_s)
        name_clean = _clean(str(name))
        emp_id = _clean(emp_id)

        shifts: Dict[int, str] = {}
        for day, c in date_cols.items():
            cell = df.iloc[r, c] if c < df.shape[1] else None
            if pd.isna(cell):
                continue
            s = str(cell).strip()
            if s:
                shifts[day] = s

        employees.append({
            "dept_code": dept_s,
            "dept_name": DEPT_FULL.get(dept_s, dept_s),
            "name": name_clean,
            "id": emp_id,
            "shifts": {day: str(v).replace("\n"," ").replace("\r"," ").strip() for day, v in shifts.items()},
        })

    # Parse month/year from sheet name
    m = re.search(r"(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})", sheet_name.upper())
    if m:
        month_name = m.group(1).title()
        year = int(m.group(2))
        month_num = ["January","February","March","April","May","June","July","August","September","October","November","December"].index(month_name) + 1
    elif override_month_key:
        # Use month extracted from filename (e.g. "2026-02" from IMP_FEB_2026.xlsx)
        try:
            oy, om = map(int, override_month_key.split("-"))
            year, month_num = oy, om
            month_name = ["January","February","March","April","May","June","July","August","September","October","November","December"][om - 1]
            print(f"  ℹ️  Sheet name has no month — using filename month: {month_name} {year}")
        except Exception:
            t = muscat_today()
            year, month_num, month_name = t.year, t.month, t.strftime("%B")
    else:
        # fallback to today
        t = muscat_today()
        year, month_num, month_name = t.year, t.month, t.strftime("%B")

    return {"sheet": sheet_name, "year": year, "month": month_num, "month_name": month_name, "employees": employees, "date_cols": date_cols}


def detect_sheet_month(xlsx_path: str, sheet_name: str) -> str | None:
    """
    يفحص أول 15 صف من الشيت ليكتشف الشهر الحقيقي:
    1. خلية datetime  2. نص يحتوي اسم شهر + سنة  3. اسم شهر بدون سنة
    يرجع "YYYY-MM" أو None.
    """
    try:
        df = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=None, nrows=15)
        month_map = {
            "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
            "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
            "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
            "sep":9,"sept":9,"oct":10,"nov":11,"dec":12,
        }
        today = muscat_today()
        month_with_year_re = re.compile(
            r"(january|february|march|april|may|june|july|august|september|october|november|december"
            r"|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)"
            r"[\s\-_]*(\d{4})"
        )
        month_only_re = re.compile(
            r"(january|february|march|april|may|june|july|august|september|october|november|december)"
        )

        for r in range(min(15, len(df))):
            for c in range(min(20, df.shape[1])):
                cell = df.iloc[r, c]

                # خلية datetime مباشرة
                if isinstance(cell, (dt.datetime, dt.date)):
                    d = cell if isinstance(cell, dt.date) else cell.date()
                    if 2020 <= d.year <= 2030:
                        return f"{d.year}-{d.month:02d}"

                # نص يحتوي اسم شهر
                if isinstance(cell, str):
                    s = cell.strip().lower()
                    s = re.sub(r"[\._\-]+", " ", s)
                    m = month_with_year_re.search(s)
                    if m:
                        mon = month_map.get(m.group(1))
                        if mon:
                            return f"{int(m.group(2)):04d}-{mon:02d}"
                    m2 = month_only_re.search(s)
                    if m2:
                        mon = month_map.get(m2.group(1))
                        if mon:
                            year = today.year
                            if mon < today.month - 3:
                                year += 1
                            return f"{year}-{mon:02d}"
    except Exception as e:
        print(f"    ⚠️ detect_sheet_month failed for '{sheet_name}': {e}")
    return None


def load_export_ui_template(repo_root: Path) -> Tuple[str, str]:
    """
    Reuse Export UI look by reading docs/index.html.
    Fallback to minimal template if not found.
    """
    candidates = [
        repo_root / "docs" / "index.html",
        repo_root / "index.html",
    ]
    for c in candidates:
        if c.exists():
            html = c.read_text(encoding="utf-8", errors="ignore")
            style_m = re.search(r"<style>(.*?)</style>", html, re.DOTALL)
            script_m = re.search(r"<script>(.*?)</script>", html, re.DOTALL)
            if style_m and script_m:
                return style_m.group(1), script_m.group(1)

    # Minimal fallback
    style = "body{font-family:system-ui;background:#eef1f7;color:#0f172a}"
    script = ""
    return style, script


def build_duty_html(style: str, script: str, parsed: Dict[str, Any], date_obj: dt.date, repo_base_path: str, available_months: List[str] | None = None) -> str:
    day = date_obj.day
    date_label = date_obj.strftime("%d %B %Y")
    date_iso = date_obj.strftime("%Y-%m-%d")
    _month_first = dt.date(parsed["year"], parsed["month"], 1)

    # قائمة الأشهر المتوفرة لـ JavaScript
    available_months_js = json.dumps(available_months or [])

    # Date picker limits:
    # If main() provides nav_min_date/nav_max_date (based on available cached months),
    # use them to prevent selecting months that have no generated pages.
    if parsed.get("nav_min_date") and parsed.get("nav_max_date"):
        min_date = str(parsed["nav_min_date"])
        max_date = str(parsed["nav_max_date"])
    else:
        # default: allow navigating prev/current/next month around the currently viewed month
        min_date = month_start(add_months(_month_first, -1)).strftime("%Y-%m-%d")
        _next_first = month_start(add_months(_month_first, +1))
        _next_last = dt.date(_next_first.year, _next_first.month, calendar.monthrange(_next_first.year, _next_first.month)[1])
        max_date = _next_last.strftime("%Y-%m-%d")

    # dept -> bucket -> rows
    dept_map: Dict[str, Dict[str, Dict[str, Any]]] = {}
    total_emp = 0

    for emp in parsed["employees"]:
        code = emp["shifts"].get(day, "")
        if not code:
            continue
        total_emp += 1
        dept = emp["dept_name"]
        bucket, icon, accent, bg, text = shift_bucket(code)
        dept_map.setdefault(dept, {}).setdefault(bucket, {"icon": icon, "accent": accent, "bg": bg, "text": text, "rows": []})
        dept_map[dept][bucket]["rows"].append((emp["name"], emp["id"], code))

    depts = sorted(dept_map.items(), key=lambda x: x[0].lower())
    dept_count = len(depts)

    summary = f"""
  <div class="summary-bar">
    <div class="s-chip welcome-chip" onclick="goToMySchedule()" id="welcomeChip" style="display:none">
      <div class="s-val"><span class="wave-hand" id="waveHand">\U0001F44B</span></div>
      <span class="welcome-name-chip" id="welcomeName"></span>
    </div>
    <div class="s-chip">
      <div class="s-val">{total_emp}</div>
      <div class="s-label" data-i18n="emp">Emp</div>
    </div>
    <div class="s-chip">
      <div class="s-val green">{dept_count}</div>
      <div class="s-label" data-i18n="dept">Dept</div>
    </div>
    <a href="{{BASE}}/my-schedules/index.html" class="s-chip" onclick="goToMySchedule(event)" style="text-decoration:none;color:inherit;">
      <div class="s-val">🗓️</div>
      <div class="s-label" data-i18n="my">جدولي</div>
    </a>
    <div class="bar-btns">
      <button class="bar-btn" id="themeBtn" onclick="toggleTheme()">🌙</button>
      <button class="bar-btn" id="langToggle" onclick="toggleLang()">\u0639</button>
    </div>
  </div>
"""

    palette = ["#2563eb","#0891b2","#059669","#dc2626","#7c3aed","#f59e0b","#0ea5e9","#a855f7"]
    order = ["Morning","Afternoon","Night","Standby","Off Day","Annual Leave","Sick Leave","Training","Other"]

    cards = []
    for i, (dept, buckets) in enumerate(depts):
        dept = str(dept).replace("\n"," ").replace("\r"," ").strip()
        color = palette[i % len(palette)]
        total_in_dept = sum(len(v["rows"]) for v in buckets.values())
        shift_blocks = []
        for key in order:
            if key not in buckets:
                continue
            info = buckets[key]
            rows = info["rows"]
            emp_rows = []
            for idx, (name, empid, code) in enumerate(rows):
                safe_name = str(name).replace("\n","").replace("\r","").replace("<","&lt;").replace(">","&gt;").strip()
                safe_id   = str(empid).replace("\n","").replace("\r","").replace("<","&lt;").strip()
                safe_code = str(code).replace("\n","").replace("\r","").replace("<","&lt;").strip()
                emp_rows.append(f'<div class="emp-row"><span class="emp-name">{safe_name} &middot; {safe_id}</span><span class="emp-code" style="color:{info["text"]};">{safe_code}</span></div>')
            shift_blocks.append(f"""
    <details class="shift-card" data-shift="{key}" style="border:1px solid {info['accent']}44;background:{info['bg']}" {'open' if key=='Afternoon' else ''}>
      <summary class="shift-summary" style="background:{info['bg']};border-bottom:1px solid {info['accent']}33;">
        <span class="shift-icon">{info['icon']}</span>
        <span class="shift-label" data-shift="{key}" style="color:{info['text']};">{key}</span>
        <span class="shift-count" style="background:{info['accent']}22;color:{info['text']};">{len(rows)}</span>
      </summary>
      <div class="shift-body">{''.join(emp_rows)}</div>
    </details>
""")
        cards.append(f"""
    <div class="dept-card" style="animation-delay:{i*0.06:.2f}s">
      <div style="height:3px;background:linear-gradient(to right,{color},{color}66)"></div>
      <div class="dept-head">
        <div class="dept-icon" style="background:{color}22;color:{color};box-shadow:0 4px 12px {color}30;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18M3 10h18M5 21V10l7-6 7 6v11"/>
            <rect x="9" y="14" width="2" height="3"/><rect x="13" y="14" width="2" height="3"/>
          </svg>
        </div>
        <div class="dept-title">{dept}</div>
        <div class="dept-badge" style="background:{color}20;color:{color};border:1px solid {color}35;">
          <span class="dept-badge-label">Total</span>
          <span class="dept-badge-val">{total_in_dept}</span>
        </div>
      </div>
      <div class="shift-stack">{''.join(shift_blocks)}</div>
    </div>
""")

    footer = f"""
  <div class="page-footer">
    <strong>Last Updated:</strong> <strong style="color:#4f8eff;">{dt.datetime.now().strftime('%d %b %Y / %H:%M').upper()}</strong>
    &nbsp;&middot;&nbsp; {total_emp} employees &nbsp;&middot;&nbsp; {parsed.get('source_filename') or parsed['sheet']}
  </div>
"""

    # تنظيف المتغيرات من أي محتوى يكسر الـ HTML/JS
    safe_repo_base = repo_base_path.replace("'", "").replace("\\n", "").replace("\\r", "")
    safe_date_iso = date_iso.replace("'", "").replace("\\n", "")
    safe_available_months_js = json.dumps(available_months or [])

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Import Duty Roster</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
:root{{
  --bg:#080c14;--surface:rgba(255,255,255,.045);--surface2:rgba(255,255,255,.07);
  --border:rgba(255,255,255,.09);--border2:rgba(255,255,255,.15);
  --ink:#e8eef8;--muted:#8899b4;--dim:#4a5568;
  --accent:#4f8eff;--accent2:#7c5cff;--green:#00d4a0;
  --r:14px;--r-lg:20px;
}}
*{{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}}
body{{
  font-family:'Outfit',system-ui,sans-serif;
  background:var(--bg);color:var(--ink);min-height:100vh;
  background-image:
    radial-gradient(ellipse 80% 50% at 20% -10%,rgba(79,142,255,.18) 0%,transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 110%,rgba(124,92,255,.14) 0%,transparent 55%),
    radial-gradient(ellipse 40% 30% at 60% 40%,rgba(0,212,160,.07) 0%,transparent 50%);
  -webkit-font-smoothing:antialiased;
}}
.wrap{{max-width:860px;margin:0 auto;padding:16px}}

/* ─── HEADER ─── */
.header{{
  position:relative;overflow:hidden;
  background:linear-gradient(135deg,rgba(31,58,120,.95) 0%,rgba(20,34,80,.98) 55%,rgba(12,18,50,.99) 100%);
  border-radius:var(--r-lg);padding:24px 20px 20px;margin-bottom:16px;color:#fff;
  border:1px solid rgba(79,142,255,.2);
  box-shadow:0 0 0 1px rgba(79,142,255,.08),0 20px 60px rgba(0,0,0,.6),0 8px 24px rgba(79,142,255,.15);
}}
.header::before{{
  content:'';position:absolute;top:-80px;right:-80px;width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle,rgba(79,142,255,.18) 0%,transparent 70%);pointer-events:none;
}}
.header::after{{
  content:'';position:absolute;bottom:-100px;left:20px;width:320px;height:320px;border-radius:50%;
  background:radial-gradient(circle,rgba(124,92,255,.12) 0%,transparent 70%);pointer-events:none;
}}
/* Animated shimmer line at top of header */
.header-shimmer{{
  position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent,#4f8eff,#7c5cff,#00d4a0,transparent);
  background-size:200% 100%;animation:shimmer 3s ease infinite;pointer-events:none;
}}
@keyframes shimmer{{0%{{background-position:200% 0}}100%{{background-position:-200% 0}}}}

.hdr-row{{display:flex;align-items:flex-end;gap:8px;direction:ltr;position:relative;z-index:1}}
.hdr-left{{flex:0 0 auto}}.hdr-center{{flex:1;text-align:center}}.hdr-right{{flex:0 0 auto}}
.hdr-title{{font-size:21px;font-weight:800;letter-spacing:-.3px;margin-bottom:11px;line-height:1.2;text-shadow:0 2px 12px rgba(79,142,255,.4)}}
.date-btn{{
  display:inline-flex;align-items:center;gap:7px;
  background:rgba(79,142,255,.15);border:1.5px solid rgba(79,142,255,.4);
  color:#fff;border-radius:12px;padding:9px 18px;cursor:pointer;
  font-size:14px;font-weight:700;font-family:inherit;direction:ltr;
  transition:all .2s;backdrop-filter:blur(10px);
}}
.date-btn:hover{{background:rgba(79,142,255,.28);border-color:rgba(79,142,255,.6);transform:translateY(-1px)}}
.lang-btn{{
  background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.2);
  color:rgba(255,255,255,.9);border-radius:10px;padding:8px 13px;
  cursor:pointer;font-size:13px;font-weight:800;font-family:inherit;transition:all .2s;
}}
.lang-btn:hover{{background:rgba(79,142,255,.2);border-color:rgba(79,142,255,.4);color:#fff}}

/* ─── LIGHT THEME ─── */
body.light{{
  --accent:#1e40af;--accent2:#7c3aed;--green:#059669;
  --ink:#0f172a;--muted:#64748b;--dim:#94a3b8;
  --border:rgba(15,23,42,.1);--border2:rgba(15,23,42,.15);
  background:#eef1f7;
  background-image:none;
}}
body.light .header{{
  background:linear-gradient(135deg,#1e40af 0%,#1976d2 50%,#0ea5e9 100%);
  border-color:rgba(255,255,255,.15);
  box-shadow:0 8px 28px rgba(30,64,175,.25);
}}
body.light .dept-card{{
  background:#ffffff;
  border:1px solid rgba(15,23,42,.07);
  box-shadow:0 4px 18px rgba(15,23,42,.08);
  backdrop-filter:none;
}}
body.light .dept-card:hover{{
  box-shadow:0 8px 20px rgba(15,23,42,.12);
  transform:translateY(-2px);
}}
body.light .dept-head{{
  background:#fff;
  border-bottom:1px solid rgba(15,23,42,.06);
}}
body.light .dept-title{{color:#1e293b;font-weight:800}}
body.light .dept-icon{{box-shadow:none!important}}
body.light .shift-body{{background:rgba(255,255,255,.7)}}
body.light .shift-summary{{filter:none}}
body.light .shift-card{{border:1px solid transparent!important}}
body.light .shift-card:not([open]) .shift-summary:hover{{filter:brightness(.96)}}
body.light .emp-row{{color:#1e293b}}
body.light .emp-row:hover{{background:rgba(15,23,42,.04)}}
body.light .emp-row:nth-child(even){{background:rgba(15,23,42,.02)}}
body.light .emp-row:nth-child(even):hover{{background:rgba(15,23,42,.05)}}
body.light .emp-name{{color:#1e293b;font-weight:700}}
body.light .emp-code{{color:#475569!important}}
body.light .s-chip{{
  background:#ffffff;
  border:1px solid rgba(15,23,42,.1);
  box-shadow:0 2px 8px rgba(15,23,42,.06);
  backdrop-filter:none;
}}
body.light .s-chip:hover{{
  box-shadow:0 8px 20px rgba(15,23,42,.12);
  background:#fff;
}}
body.light .s-val{{color:#1e40af}}
body.light .s-val.green{{color:#059669}}
body.light .s-label{{color:#64748b;font-weight:700}}
body.light .welcome-name-chip{{color:#64748b}}
body.light .page-footer{{
  border-top:1px solid rgba(15,23,42,.08);
  color:#94a3b8;
}}
body.light .page-footer strong{{color:#64748b!important}}
body.light .page-footer strong + strong{{color:#1e40af!important}}
body.light .cta-btn{{
  background:linear-gradient(135deg,#1e40af,#1976d2);
  box-shadow:0 6px 20px rgba(30,64,175,.3);
}}
body.light .cta-btn:hover{{
  box-shadow:0 8px 28px rgba(30,64,175,.4);
}}

.lang-btn{{display:none}}

/* ─── SUMMARY BAR ─── */
.summary-bar{{
  display:flex;gap:8px;margin-bottom:16px;
  align-items:center;flex-wrap:nowrap;overflow-x:auto;
  scrollbar-width:none;-ms-overflow-style:none;
  padding-bottom:2px;
}}
.summary-bar::-webkit-scrollbar{{display:none}}
.s-chip{{
  background:rgba(255,255,255,.055);border:1px solid var(--border2);
  border-radius:12px;padding:9px 14px;text-align:center;
  flex:1;min-width:0;
  text-decoration:none;color:inherit;
  box-shadow:0 3px 12px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.07);
  transition:transform .15s,box-shadow .15s,background .15s;
  backdrop-filter:blur(12px);white-space:nowrap;
}}
.s-chip:hover{{transform:translateY(-2px);background:rgba(255,255,255,.09);box-shadow:0 6px 20px rgba(0,0,0,.35)}}
.s-val{{font-size:20px;font-weight:900;color:var(--accent);line-height:1;letter-spacing:-.5px}}
.s-val.green{{color:var(--green)}}
.s-label{{font-size:9px;color:var(--muted);font-weight:700;margin-top:3px;text-transform:uppercase;letter-spacing:.7px}}
/* Welcome chip */
.welcome-chip{{flex:0 0 auto;cursor:pointer;padding:8px 12px;min-width:0}}
.welcome-chip .s-val{{font-size:20px;line-height:1}}
.welcome-name-chip{{
  font-size:9px;font-weight:700;color:var(--muted);
  margin-top:3px;letter-spacing:0;text-transform:none;
  white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis;
  display:block;
}}
/* Lang + Theme buttons inside summary bar */
.bar-btns{{display:flex;gap:6px;flex:0 0 auto}}
.bar-btn{{
  height:52px;width:40px;
  background:rgba(255,255,255,.055);border:1px solid var(--border2);
  border-radius:12px;cursor:pointer;font-size:15px;font-weight:800;
  color:var(--ink);display:grid;place-items:center;
  box-shadow:0 3px 12px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.07);
  transition:all .18s;backdrop-filter:blur(12px);font-family:inherit;
  white-space:nowrap;
}}
.bar-btn:hover{{transform:translateY(-2px);background:rgba(255,255,255,.11);box-shadow:0 6px 20px rgba(0,0,0,.35)}}
.bar-btn:active{{transform:scale(.95)}}
body.light .bar-btn{{
  background:#fff;border-color:rgba(15,23,42,.12);
  box-shadow:0 2px 8px rgba(15,23,42,.1);color:#1e40af;
}}
body.light .bar-btn:hover{{background:#f0f6ff;box-shadow:0 6px 16px rgba(15,23,42,.15)}}
@keyframes waveAnim{{0%,100%{{transform:rotate(0)}}15%{{transform:rotate(22deg)}}35%{{transform:rotate(-13deg)}}55%{{transform:rotate(18deg)}}75%{{transform:rotate(-9deg)}}90%{{transform:rotate(11deg)}}}}
.wave-hand{{display:inline-block;transform-origin:70% 80%}}
.wave-hand.waving{{animation:waveAnim 1.1s ease-in-out}}

/* ─── DARK THEME SHIFT CARD OVERRIDES ─── */
body:not(.light) .shift-body{{background:rgba(0,0,0,.25)}}
body:not(.light) .shift-card{{filter:brightness(1)}}
body:not(.light) .shift-summary{{filter:brightness(.75)}}
body:not(.light) .shift-card:not([open]) .shift-summary:hover{{filter:brightness(.88)}}
body:not(.light) .emp-name{{color:#e2e8f0}}
body:not(.light) .emp-code{{filter:brightness(1.4)}}

/* ─── DEPT CARDS ─── */
.dept-card{{
  background:rgba(255,255,255,.042);
  border-radius:var(--r-lg);overflow:hidden;margin-bottom:12px;
  border:1px solid var(--border);
  box-shadow:0 4px 24px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.06);
  transition:transform .2s,box-shadow .2s;backdrop-filter:blur(8px);
  animation:cardIn .35s cubic-bezier(.22,1,.36,1) both;
}}
@keyframes cardIn{{from{{opacity:0;transform:translateY(12px)}}to{{opacity:1;transform:translateY(0)}}}}
.dept-card:hover{{transform:translateY(-2px);box-shadow:0 8px 36px rgba(0,0,0,.4)}}
.dept-head{{display:flex;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid var(--border)}}
.dept-icon{{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:0 0 auto;box-shadow:0 4px 12px rgba(0,0,0,.3)}}
.dept-title{{font-size:15px;font-weight:800;flex:1;letter-spacing:-.2px}}
.dept-badge{{border-radius:10px;padding:6px 14px;text-align:center;flex:0 0 auto}}
.dept-badge-label{{font-size:9px;opacity:.6;display:block;text-transform:uppercase;letter-spacing:.6px;margin-bottom:1px;font-weight:600}}
.dept-badge-val{{font-size:20px;font-weight:900;letter-spacing:-.5px}}

/* ─── SHIFT CARDS ─── */
.shift-stack{{padding:0 14px 14px}}
.shift-card{{border-radius:12px;overflow:hidden;margin-top:10px;border:1px solid transparent}}
.shift-summary{{
  display:flex;align-items:center;gap:9px;padding:11px 15px;
  cursor:pointer;list-style:none;
  border-radius:12px 12px 0 0;
  transition:filter .15s;
}}
.shift-summary::-webkit-details-marker{{display:none}}
.shift-card:not([open]) .shift-summary{{border-radius:12px}}
.shift-card:not([open]) .shift-summary:hover{{filter:brightness(1.12)}}
.shift-icon{{font-size:18px}}
.shift-label{{font-weight:800;font-size:14px;flex:1;letter-spacing:-.1px}}
.shift-count{{
  border-radius:20px;padding:3px 10px;font-size:12px;font-weight:800;
  backdrop-filter:blur(8px);
}}
.shift-body{{padding:10px 14px 12px;background:rgba(0,0,0,.15)}}
.emp-row{{
  display:flex;justify-content:space-between;align-items:center;
  padding:8px 11px;border-radius:9px;font-size:13px;
  transition:background .15s;
}}
.emp-row:hover{{background:rgba(255,255,255,.06)}}
.emp-row:nth-child(even){{background:rgba(255,255,255,.03)}}
.emp-row:nth-child(even):hover{{background:rgba(255,255,255,.07)}}
.emp-name{{font-weight:700;flex:1;color:#dde6f0}}.emp-code{{font-weight:800;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.5px;color:#94b8ff}}

/* ─── CTA ─── */
.cta-wrap{{text-align:center;margin:16px 0}}
.cta-btn{{
  display:inline-flex;align-items:center;gap:9px;
  background:linear-gradient(135deg,#4f8eff 0%,#7c5cff 100%);
  color:#fff;border-radius:14px;padding:14px 34px;font-size:15px;font-weight:700;
  text-decoration:none;font-family:inherit;
  box-shadow:0 4px 20px rgba(79,142,255,.4),0 0 0 1px rgba(79,142,255,.2);
  transition:transform .15s,box-shadow .15s;letter-spacing:-.1px;
}}
.cta-btn:hover{{transform:translateY(-3px);box-shadow:0 10px 36px rgba(79,142,255,.5),0 0 0 1px rgba(79,142,255,.3)}}
.cta-btn:active{{transform:translateY(0)}}

/* ─── FOOTER ─── */
.page-footer{{
  text-align:center;font-size:11px;color:var(--dim);padding:16px;
  border-top:1px solid var(--border);margin-top:8px;
}}
.page-footer strong{{color:var(--muted)!important}}

body.ar .wrap>*:not(.header){{direction:rtl}}
@media(max-width:500px){{
  .s-val{{font-size:24px}}.hdr-title{{font-size:18px}}
  .date-btn{{font-size:13px;padding:8px 13px}}.welcome-name{{max-width:65px}}
  .dept-card{{border-radius:16px}}
}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-shimmer"></div>
    <div class="hdr-row" style="justify-content:center">
      <div class="hdr-center" style="flex:1;text-align:center">
        <div id="hdrWelcome" style="font-size:13px;font-weight:600;color:rgba(255,255,255,.6);margin-bottom:4px;min-height:18px;letter-spacing:.2px"></div>
        <div class="hdr-title" id="pageTitle">Import Duty Roster</div>
        <div style="position:relative;display:inline-block">
          <button class="date-btn" onclick="openDatePicker()" type="button">
            <span>\U0001F4C5</span><span>{date_label}</span>
          </button>
          <input id="datePicker" type="date" value="{date_iso}" min="{min_date}" max="{max_date}" tabindex="-1" aria-hidden="true" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px"/>
        </div>
      </div>
    </div>
  </div>
  {summary}
  {''.join(cards)}
  <div class="cta-wrap">
    <a class="cta-btn" id="ctaBtn" href="{{BASE}}/now/">View Full Roster</a>
  </div>
  {footer}
</div>
<script>
function _importBase(){{var o=location.origin,r=location.pathname.includes('/roster-site/')?o+'/roster-site':o;return r+'{safe_repo_base}';}}
var _avail={safe_available_months_js};
function openDatePicker(){{var p=document.getElementById('datePicker');if(!p)return;try{{p.showPicker()}}catch(e){{p.click()}}p.onchange=function(){{if(!p.value)return;sessionStorage.setItem('manualNav','1');location.href=_importBase()+'/'+p.value+'/';}}; }}
function goToMySchedule(e){{if(e)e.preventDefault();var id=localStorage.getItem('savedEmpId')||localStorage.getItem('importSavedEmpId');location.href=_importBase()+'/my-schedules/index.html'+(id?'?emp='+encodeURIComponent(id):'');}}
function toggleTheme(){{var isLight=document.body.classList.toggle('light');localStorage.setItem('importTheme',isLight?'light':'dark');var btn=document.getElementById('themeBtn');if(btn)btn.textContent=isLight?'☀️':'🌙';}}
var _T={{ar:{{title:'Import Duty Roster',emp:'\u0645\u0648\u0638\u0641',dept:'\u0642\u0633\u0645',my:'\u062c\u062f\u0648\u0644\u064a',cta:'\u0639\u0631\u0636 \u062c\u062f\u0648\u0644 \u0627\u0644\u0645\u0646\u0627\u0648\u0628\u0627\u062a',Morning:'\u0635\u0628\u0627\u062d',Afternoon:'\u0638\u0647\u0631',Night:'\u0644\u064a\u0644','Off Day':'\u0625\u062c\u0627\u0632\u0629','Annual Leave':'\u0633\u0646\u0648\u064a\u0629','Sick Leave':'\u0645\u0631\u0636\u064a\u0629',Training:'\u062a\u062f\u0631\u064a\u0628',Standby:'\u0627\u0633\u062a\u0639\u062f\u0627\u062f',Other:'\u0623\u062e\u0631\u0649'}},en:{{title:'Import Duty Roster',emp:'Emp',dept:'Dept',my:'\u062c\u062f\u0648\u0644\u064a',cta:'View Full Roster',Morning:'Morning',Afternoon:'Afternoon',Night:'Night','Off Day':'Off Day','Annual Leave':'Annual Leave','Sick Leave':'Sick Leave',Training:'Training',Standby:'Standby',Other:'Other'}}}};
function _applyLang(isAr){{var L=_T[isAr?'ar':'en'];var b=document.getElementById('langToggle');if(b)b.textContent=isAr?'EN':'\u0639';var pt=document.getElementById('pageTitle');if(pt)pt.textContent=L.title;var cta=document.getElementById('ctaBtn');if(cta)cta.textContent=L.cta;document.querySelectorAll('[data-i18n]').forEach(function(el){{el.textContent=L[el.getAttribute('data-i18n')]||el.textContent;}});document.querySelectorAll('.shift-label[data-shift]').forEach(function(el){{el.textContent=L[el.getAttribute('data-shift')]||el.getAttribute('data-shift');}});document.body.classList.toggle('ar',isAr);}}
function toggleLang(){{var isAr=!document.body.classList.contains('ar');localStorage.setItem('importLang',isAr?'ar':'en');_applyLang(isAr);}}
function _wave(){{var h=document.getElementById('waveHand');if(!h)return;h.classList.remove('waving');void h.offsetWidth;h.classList.add('waving');}}
(function(){{
  var isAr=localStorage.getItem('importLang')==='ar';_applyLang(isAr);
  var isLight=localStorage.getItem('importTheme')==='light';
  if(isLight){{document.body.classList.add('light');var tb=document.getElementById('themeBtn');if(tb)tb.textContent='☀️';}}
  document.querySelectorAll('a[href^="{{BASE}}"]').forEach(function(a){{a.href=a.getAttribute('href').replace('{{BASE}}',_importBase());}});
  var empId=localStorage.getItem('savedEmpId')||localStorage.getItem('importSavedEmpId');
  var nameEl=document.getElementById('welcomeName'),chipEl=document.getElementById('welcomeChip'),handEl=document.getElementById('waveHand'),hdrW=document.getElementById('hdrWelcome');
  if(empId&&nameEl){{
    chipEl&&(chipEl.style.display='');
    fetch(_importBase()+'/schedules/'+encodeURIComponent(empId)+'.json').then(function(r){{return r.ok?r.json():null;}}).then(function(d){{
      var first=d&&d.name?d.name.split(' ')[0]:empId;
      nameEl.textContent=first;
      if(hdrW)hdrW.textContent='\U0001F44B \u0645\u0631\u062d\u0628\u0627\u064b\u060c '+first;
      setTimeout(_wave,500+Math.random()*400);
      if(Math.random()>.4)setTimeout(_wave,5e3+Math.random()*7e3);
    }}).catch(function(){{nameEl.textContent=empId;if(hdrW)hdrW.textContent='\U0001F44B \u0645\u0631\u062d\u0628\u0627\u064b';setTimeout(_wave,500);}});
  }}
  if(sessionStorage.getItem('manualNav')==='1'){{sessionStorage.removeItem('manualNav');return;}}
  var pageDate='{safe_date_iso}',now=new Date();
  var today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  if(pageDate!==today){{var tm=today.substring(0,7);if(!_avail.length||_avail.indexOf(tm)!==-1){{fetch(_importBase()+'/'+today+'/index.html',{{method:'HEAD'}}).then(function(r){{if(r.ok)location.replace(_importBase()+'/'+today+'/');}}). catch(function(){{}});}}return;}}
  var hr=now.getHours(),shift=hr>=6&&hr<14?'Morning':hr>=14&&hr<22?'Afternoon':'Night';
  setTimeout(function(){{document.querySelectorAll('details.shift-card').forEach(function(el){{el.removeAttribute('open');}});document.querySelectorAll('details.shift-card[data-shift="'+shift+'"]').forEach(function(el){{el.setAttribute('open','');}});}},150);
}})();
</script>
</body>
</html>
"""
    return html



def build_my_schedule_html(style: str, repo_base_path: str) -> str:
    """
    Full-featured Import My Schedule page — same design as Export my-schedule.
    Uses docs/import/schedules/<id>.json
    """
    return r"""<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Import - My Schedule</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    :root{--bg:#0d1117;--surface:#161b22;--surface2:#1c2330;--surface3:#21262d;--border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.12);--ink:#e6edf3;--muted:#8b949e;--dim:#484f58;--accent:#58a6ff;--r:12px;--r-lg:18px;--safe-top:env(safe-area-inset-top,0px);--safe-bot:env(safe-area-inset-bottom,0px);--glass-bg:rgba(255,255,255,.06);--glass-bg-hover:rgba(255,255,255,.10);--glass-border:rgba(255,255,255,.16);--glass-border-hover:rgba(255,255,255,.24);--glass-shadow:0 10px 28px rgba(0,0,0,.22);}
    body.light{--bg:#f5f7fa;--surface:#ffffff;--surface2:#f0f2f5;--surface3:#e8ebf0;--border:rgba(0,0,0,.08);--border2:rgba(0,0,0,.13);--ink:#1a1f2e;--muted:#6b7280;--dim:#9ca3af;--accent:#1d6fd4;--glass-bg:rgba(255,255,255,.70);--glass-bg-hover:rgba(255,255,255,.86);--glass-border:rgba(0,0,0,.10);--glass-border-hover:rgba(0,0,0,.16);--glass-shadow:0 10px 24px rgba(0,0,0,.10);}
    html{background:var(--bg);color:var(--ink);font-size:15px;scroll-behavior:smooth}
    body{font-family:'Sora',system-ui,-apple-system,sans-serif;background:var(--bg);min-height:100dvh;-webkit-font-smoothing:antialiased;overflow-x:hidden;transition:background .2s,color .2s;padding-top:64px;}
    body.ar{direction:rtl}
    button,input{font-family:inherit;font-size:inherit;cursor:pointer}
    @keyframes aurora{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes popIn{from{opacity:0;transform:scale(.94) translateY(-4px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes avatarPop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes spin{to{transform:rotate(360deg)}}
    .topbar{position:fixed;top:0;left:0;right:0;z-index:100;padding-top:var(--safe-top);background:linear-gradient(135deg,rgba(3,5,11,.99) 0%,rgba(6,10,19,.99) 60%,rgba(4,7,15,.99) 100%);backdrop-filter:blur(28px) saturate(220%);-webkit-backdrop-filter:blur(28px) saturate(220%);border-bottom:1px solid rgba(56,139,253,.18);box-shadow:0 8px 32px rgba(0,0,0,.85),0 3px 10px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.04);overflow:visible;}
    .topbar::before{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,rgba(56,139,253,.5) 30%,rgba(63,185,80,.4) 60%,rgba(188,140,255,.4) 80%,transparent 100%);background-size:200% 100%;animation:aurora 4s ease infinite;pointer-events:none;}
    body.light .topbar{background:rgba(225,232,245,.97);border-bottom-color:rgba(29,111,212,.18);box-shadow:0 6px 24px rgba(0,0,0,.18);}
    .topbar-inner{display:flex;align-items:center;padding:11px 20px;gap:10px;max-width:1080px;margin:0 auto;}
    .home-btn{width:38px;height:38px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;display:grid;place-items:center;cursor:pointer;transition:all .18s;flex:0 0 auto;}
    .home-btn svg{width:19px;height:19px;transition:transform .18s;}
    .home-btn:hover{background:rgba(56,139,253,.18);border-color:rgba(56,139,253,.4);}
    .home-btn:hover svg{transform:scale(1.12);}
    .home-btn:active{transform:scale(.94);}
    .topbar-center{display:flex;align-items:center;flex:1;min-width:0;}
    .topbar-right{display:flex;align-items:center;gap:8px;justify-content:flex-end;flex:0 0 auto;}
    .brand-name{font-size:14px;font-weight:800;color:#58a6ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.2px}
    .brand-sub{font-size:13px;color:#58a6ff;font-weight:600;white-space:nowrap;opacity:.75;}
    .ghost-btn{height:38px;padding:0 12px;border:1px solid var(--glass-border);background:var(--glass-bg);color:#c9d1d9;border-radius:10px;font-size:12px;font-weight:600;transition:all .15s;white-space:nowrap;backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);box-shadow:var(--glass-shadow);}
    .ghost-btn:hover{background:var(--glass-bg-hover);border-color:var(--glass-border-hover);transform:translateY(-1px);}
    .ghost-btn:active{transform:scale(.97)}
    .theme-btn{width:38px;padding:0;font-size:17px;border-radius:10px;}
    #langBtn{color:#58a6ff!important;border-color:rgba(56,139,253,.3)!important;font-weight:700;font-size:13px;}
    #langBtn:hover{background:rgba(56,139,253,.18)!important;border-color:rgba(56,139,253,.5)!important;color:#79b8ff!important;}
    .brand-mark{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 auto;}
    .brand-swap{position:relative;width:38px;height:38px;flex:0 0 auto;}
    .brand-sq{position:absolute;inset:0;width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1f6feb,#388bfd);display:grid;place-items:center;font-size:18px;border:none;color:#fff;box-shadow:0 0 0 1px rgba(56,139,253,.28),0 4px 12px rgba(31,111,235,.28);cursor:pointer;opacity:0;transform:scale(.98);transition:opacity .25s ease,transform .25s ease;pointer-events:none;}
    .brand-sq.show{opacity:1;transform:scale(1);pointer-events:auto;}
    .aurora-bar{position:fixed;z-index:99;height:22px;left:0;right:0;overflow:visible;pointer-events:none;}
    .aurora-bar-inner{position:absolute;bottom:0;left:4%;right:4%;height:22px;border-radius:0 0 60% 60%;background:linear-gradient(90deg,#1f6feb,#58a6ff,#3fb950,#bc8cff,#ff7b72,#58a6ff,#1f6feb);background-size:300% 100%;filter:blur(10px);opacity:0;transform:translateY(-100%) scaleX(.7);transition:opacity .2s ease,transform .2s cubic-bezier(.22,1,.36,1);animation:aurora 4s ease infinite;}
    .aurora-bar-inner.visible{opacity:.35;transform:translateY(0) scaleX(1);}
    body.light .aurora-bar-inner{opacity:0!important;}
    .search-section{padding:16px 20px 0;max-width:960px;margin:0 auto;}
    .search-form{display:flex;gap:8px;align-items:center}
    .search-avatar-wrap{display:flex;align-items:center;gap:4px;flex:0 0 auto;}
    .search-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#1f6feb,#58a6ff);display:grid;place-items:center;color:#fff;font-weight:800;font-size:13px;flex:0 0 auto;box-shadow:0 3px 10px rgba(31,111,235,.4);letter-spacing:-.5px;animation:avatarPop .2s cubic-bezier(.22,1,.36,1);}
    .search-change-btn{width:36px;height:36px;background:linear-gradient(135deg,#1f6feb,#58a6ff);border:none;color:#fff;border-radius:10px;font-size:15px;display:grid;place-items:center;flex:0 0 auto;transition:filter .15s,transform .1s;box-shadow:0 3px 10px rgba(31,111,235,.4);}
    .search-change-btn:hover{filter:brightness(1.15)}.search-change-btn:active{transform:scale(.95)}
    .id-input{position:relative;display:flex;align-items:center;flex:0 0 auto;}
    .id-prefix{height:36px;padding:0 10px;display:flex;align-items:center;border-radius:10px 0 0 10px;font-family:'DM Mono',monospace;font-weight:800;font-size:12px;color:var(--muted);background:var(--glass-bg);border:1px solid var(--glass-border);border-right:none;backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);box-shadow:var(--glass-shadow);}
    body.ar .id-prefix{border-radius:0 10px 10px 0;border-right:1px solid var(--glass-border);border-left:none;}
    .search-input{width:130px;flex:0 0 130px;background:var(--glass-bg)!important;border:1px solid var(--glass-border)!important;color:var(--ink);border-radius:0 10px 10px 0!important;padding:9px 12px;height:36px;font-size:14px;font-weight:500;outline:none;transition:border-color .15s,box-shadow .15s;backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);box-shadow:var(--glass-shadow);}
    body.ar .search-input{border-radius:10px 0 0 10px!important;}
    .search-input::placeholder{color:var(--dim);font-size:13px}
    .search-input:focus{border-color:var(--glass-border-hover)!important;box-shadow:0 0 0 3px rgba(56,139,253,.15);}
    .search-btn{height:36px;padding:0 18px;background:linear-gradient(135deg,#1553c7,#1f6feb)!important;border:1px solid rgba(56,139,253,.6)!important;color:#fff!important;border-radius:10px;font-size:13px;font-weight:700;white-space:nowrap;transition:filter .15s,transform .1s;box-shadow:0 4px 18px rgba(31,111,235,.55),inset 0 1px 0 rgba(255,255,255,.18)!important;flex:0 0 auto;letter-spacing:.2px;}
    .search-btn:hover{filter:brightness(1.15)}.search-btn:active{transform:scale(.97)}
    .month-picker-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.08)!important;border:1px solid rgba(255,255,255,.18)!important;color:var(--ink)!important;border-radius:10px!important;padding:0 10px!important;height:32px!important;font-size:12px!important;font-weight:700;font-family:'DM Mono',monospace;cursor:pointer;transition:all .15s;white-space:nowrap;flex:0 0 auto;backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);}
    body.light .month-picker-btn{background:rgba(255,255,255,.75)!important;border:1px solid rgba(0,0,0,.12)!important;}
    .month-picker-btn:hover{background:rgba(255,255,255,.14)!important;}
    .month-picker-btn .mpb-arrow{font-size:10px;opacity:.6}
    .month-popup{position:absolute;top:calc(100% + 8px);z-index:200;background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:10px;box-shadow:0 16px 40px rgba(0,0,0,.45);display:none;min-width:200px;animation:popIn .18s cubic-bezier(.22,1,.36,1);}
    .month-popup.open{display:block}
    .month-popup-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;}
    .mp-item{padding:7px 4px;border-radius:8px;font-size:11px;font-weight:600;text-align:center;cursor:pointer;color:var(--muted);transition:all .12s;border:1px solid transparent;}
    .mp-item:hover{background:var(--surface3);color:var(--ink);border-color:var(--border)}
    .mp-item.active{background:linear-gradient(135deg,rgba(31,111,235,.2),rgba(56,139,253,.1));border-color:rgba(56,139,253,.4);color:var(--accent);font-weight:700;}
    .main{padding:20px 20px calc(40px + var(--safe-bot));max-width:960px;margin:0 auto;}
    .stack{display:flex;flex-direction:column;gap:16px}
    .export-area{display:flex;flex-direction:column;gap:12px}
    .emp-banner{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:14px;}
    .emp-info{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;}
    .emp-name-row{display:flex;align-items:center;gap:10px;min-width:0;}
    .emp-name{font-size:16px;font-weight:800;letter-spacing:-.3px;color:var(--ink);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .emp-dept{margin-top:6px;font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .emp-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:0 0 auto;}
    body.ar .emp-right{align-items:flex-start;}
    .month-wrap{position:relative;flex:0 0 auto;margin-top:2px;}
    .change-btn{width:34px;height:34px;background:var(--glass-bg);border:1px solid var(--glass-border);color:var(--muted);border-radius:9px;font-size:16px;display:grid;place-items:center;flex:0 0 auto;transition:all .15s;backdrop-filter:blur(14px) saturate(170%);}
    .change-btn:hover{background:var(--glass-bg-hover);border-color:var(--glass-border-hover);color:var(--ink);transform:translateY(-1px);}
    .stats-row{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;}
    @media(max-width:700px){.stats-row{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:400px){.stats-row{grid-template-columns:repeat(2,1fr)}}
    .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 8px 14px;text-align:center;position:relative;overflow:hidden;transition:border-color .2s,transform .15s,box-shadow .15s;}
    .stat-card:hover{border-color:var(--border2);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3);}
    .stat-card::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
    .stat-card.c-blue::after{background:linear-gradient(90deg,#1f6feb,#58a6ff)}.stat-card.c-gray::after{background:linear-gradient(90deg,#484f58,#8b949e)}.stat-card.c-amber::after{background:linear-gradient(90deg,#b45309,#d29922)}.stat-card.c-orange::after{background:linear-gradient(90deg,#c2410c,#db6d28)}.stat-card.c-purple::after{background:linear-gradient(90deg,#7c3aed,#bc8cff)}.stat-card.c-pink::after{background:linear-gradient(90deg,#be185d,#ff7b72)}.stat-card.c-green::after{background:linear-gradient(90deg,#15803d,#3fb950)}
    .stat-ico{font-size:18px;margin-bottom:6px;display:block}.stat-val{font-size:24px;font-weight:800;color:var(--ink);font-family:'DM Mono',monospace;line-height:1}.stat-lbl{font-size:9.5px;color:var(--muted);font-weight:600;margin-top:5px;line-height:1.3}
    .cal-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;}
    .cal-head{display:grid;grid-template-columns:repeat(7,1fr);background:var(--surface2);border-bottom:1px solid var(--border);}
    .cal-head div{padding:14px 4px;text-align:center;font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;}
    .cal-body{display:grid;grid-template-columns:repeat(7,1fr);}
    .day{background:var(--surface);min-height:72px;padding:8px 7px 7px;display:flex;flex-direction:column;position:relative;transition:background .1s;border-right:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;}
    .day:nth-child(7n){border-right:none}
    @media(max-width:380px){.day{min-height:60px;padding:4px 3px}}
    .day.empty{background:rgba(13,17,23,.5);}
    body.light .day.empty{background:rgba(240,242,245,.6)}
    .dnum{position:absolute;top:6px;left:0;right:0;text-align:center;font-size:clamp(20px,4vw,36px);font-weight:900;color:var(--ink);opacity:.22;font-family:'DM Mono',monospace;line-height:1;pointer-events:none;z-index:1;}
    .day.today .dnum{color:var(--accent);opacity:.35}
    .day-code{position:absolute;bottom:8px;left:0;right:0;text-align:center;font-size:clamp(13px,2.6vw,24px);font-weight:900;font-family:'DM Mono',monospace;letter-spacing:-.3px;white-space:nowrap;z-index:2;line-height:1;}
    .day.today{background:rgba(31,111,235,.1)!important}.day.today::before{content:'';position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,#1f6feb,#58a6ff);z-index:3;}
    .s-morning{background:#1a140a}.s-afternoon{background:#1a0f07}.s-night{background:#110d1f}.s-off{background:#0f1117}.s-leave{background:#0a1410}.s-training{background:#0a1020}.s-standby{background:#1a0d14}.s-other{background:#111318}
    body.light .s-morning{background:#fffbf0}body.light .s-afternoon{background:#fff7f0}body.light .s-night{background:#f5f3ff}body.light .s-off{background:#f8fafc}body.light .s-leave{background:#f0fdf4}body.light .s-training{background:#eff6ff}body.light .s-standby{background:#fdf2f8}body.light .day{background:var(--surface)}body.light .day.empty{background:rgba(245,247,250,.7)}
    .s-morning .day-code{color:#d29922}.s-afternoon .day-code{color:#e8722a}.s-night .day-code{color:#bc8cff}.s-off .day-code{color:#8b949e}.s-leave .day-code{color:#3fb950}.s-training .day-code{color:#58a6ff}.s-standby .day-code{color:#ff7b72}.s-other .day-code{color:#8b949e}
    .s-morning .dnum{color:#d29922}.s-afternoon .dnum{color:#e8722a}.s-night .dnum{color:#bc8cff}.s-off .dnum{color:#8b949e}.s-leave .dnum{color:#3fb950}.s-training .dnum{color:#58a6ff}.s-standby .dnum{color:#ff7b72}.s-other .dnum{color:#8b949e}
    body.light .s-morning .day-code{color:#b45309}body.light .s-afternoon .day-code{color:#c2410c}body.light .s-night .day-code{color:#7c3aed}body.light .s-off .day-code{color:#6b7280}body.light .s-leave .day-code{color:#15803d}body.light .s-training .day-code{color:#1d4ed8}body.light .s-standby .day-code{color:#be185d}
    body.light .s-morning .dnum{color:#b45309}body.light .s-afternoon .dnum{color:#c2410c}body.light .s-night .dnum{color:#7c3aed}body.light .s-off .dnum{color:#6b7280}body.light .s-leave .dnum{color:#15803d}body.light .s-training .dnum{color:#1d4ed8}body.light .s-standby .dnum{color:#be185d}
    .actions-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;display:flex;flex-direction:column;gap:8px;}
    .actions-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
    .action-btn{display:flex;align-items:center;justify-content:center;gap:8px;color:#58a6ff!important;font-weight:700!important;background:linear-gradient(135deg,rgba(31,111,235,.18),rgba(56,139,253,.10))!important;border:1px solid rgba(56,139,253,.35)!important;border-radius:10px;padding:12px 10px;font-size:13px;transition:all .15s;min-height:48px;position:relative;backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);}
    .action-btn:hover{color:#79b8ff!important;background:linear-gradient(135deg,rgba(31,111,235,.30),rgba(56,139,253,.20))!important;border-color:rgba(56,139,253,.6)!important;transform:translateY(-1px);}
    .action-btn:active{transform:scale(.98)}.action-ico{font-size:16px;flex:0 0 auto}
    .stats-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .15s ease;}
    .stats-modal{background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-lg);width:100%;max-width:560px;box-shadow:0 24px 64px rgba(0,0,0,.5);animation:popIn .2s cubic-bezier(.22,1,.36,1);overflow:hidden;}
    .stats-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);font-size:14px;font-weight:700;color:var(--ink);}
    .stats-modal-close{width:28px;height:28px;background:rgba(255,255,255,.06);border:1px solid var(--border2);border-radius:7px;color:var(--muted);font-size:12px;display:grid;place-items:center;cursor:pointer;transition:all .15s;}
    .stats-modal-close:hover{background:rgba(255,255,255,.12);color:var(--ink)}
    .stats-modal-body{padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
    @media(max-width:400px){.stats-modal-body{grid-template-columns:repeat(2,1fr)}}
    .state-view{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:48px 24px;text-align:center;}
    .state-emoji{font-size:42px;display:block;margin-bottom:12px}.state-title{font-size:18px;font-weight:700;color:var(--ink);margin-bottom:6px}.state-desc{font-size:13px;color:var(--muted);line-height:1.65;max-width:38ch;margin:0 auto}
    .spin{width:36px;height:36px;border:2.5px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 14px;}
    .modal{position:fixed;inset:0;z-index:999;display:none;align-items:flex-end;justify-content:center;padding:0;}
    @media(min-width:600px){.modal{align-items:center;padding:20px}}
    .modal.open{display:flex}
    .modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
    .modal-sheet{position:relative;z-index:1;width:100%;max-width:540px;background:var(--surface);border:1px solid var(--border2);border-radius:24px 24px 0 0;overflow:hidden;animation:slideUp .25s cubic-bezier(.22,1,.36,1);max-height:85dvh;display:flex;flex-direction:column;}
    @media(min-width:600px){.modal-sheet{border-radius:20px;max-width:560px}}
    .modal-handle{width:40px;height:4px;background:var(--dim);border-radius:2px;margin:14px auto 0;opacity:.5}
    .modal-head{padding:18px 22px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
    .modal-title{font-size:18px;font-weight:700;color:var(--ink)}.modal-sub{font-size:13px;color:var(--muted);margin-top:4px;line-height:1.5}
    .modal-close{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--muted);font-size:16px;display:grid;place-items:center;flex:0 0 auto;transition:all .15s;}
    .modal-close:hover{background:rgba(255,255,255,.12);color:var(--ink)}
    .modal-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:18px 22px;}
    .modal-intro{background:rgba(88,166,255,.05);border:1px solid rgba(88,166,255,.15);border-radius:12px;padding:14px 16px;margin-bottom:14px;}
    .modal-intro-title{font-size:14px;font-weight:700;color:var(--ink);margin-bottom:5px}.modal-intro-desc{font-size:13px;color:var(--muted);line-height:1.65}
    .tip{display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02);}.tip+.tip{margin-top:10px}
    .tip-ico{font-size:20px;flex:0 0 auto;margin-top:1px}.tip-text{font-size:13px;color:var(--muted);line-height:1.65;font-weight:500}
    .modal-foot{position:sticky;bottom:0;background:linear-gradient(to bottom,rgba(0,0,0,0),rgba(0,0,0,.22));backdrop-filter:blur(10px);border-top:1px solid var(--border);padding:16px 22px calc(16px + var(--safe-bot));display:flex;justify-content:flex-end;}
    body.light .modal-foot{background:linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,.75));}
    .ok-btn{height:40px;padding:0 20px;background:linear-gradient(135deg,#1f6feb,#388bfd);border:none;color:#fff;border-radius:10px;font-size:13px;font-weight:700;transition:filter .15s;}
    .ok-btn:hover{filter:brightness(1.1)}
    .tbtn{flex:1;height:36px;border-radius:8px;font-size:12px;font-weight:700;border:1px solid var(--border2);background:rgba(255,255,255,.05);color:var(--muted);transition:all .12s;}
    .tbtn:hover{background:rgba(255,255,255,.1);color:var(--ink)}.tbtn.primary{background:linear-gradient(135deg,#1f6feb,#388bfd);border:none;color:#fff;}
    .tbtn.primary:hover{filter:brightness(1.1)}
    .toast-container{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:none;padding:20px;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);}
    .toast-card{pointer-events:auto;width:min(400px,100%);background:var(--surface);border:1px solid rgba(56,139,253,.25);border-radius:20px;padding:20px;box-shadow:0 24px 64px rgba(0,0,0,.7);animation:slideUp .22s cubic-bezier(.22,1,.36,1);}
    .toast-row{display:flex;align-items:flex-start;gap:10px}
    .toast-ico{width:38px;height:38px;border-radius:10px;background:rgba(88,166,255,.1);border:1px solid rgba(88,166,255,.2);display:grid;place-items:center;font-size:16px;flex:0 0 auto;}
    .toast-text p{font-size:12.5px;color:var(--muted);line-height:1.55;font-weight:500}.toast-text strong{color:var(--ink)}
    .toast-btns{display:flex;gap:8px;margin-top:10px}
    @media print{.topbar,.search-section,.toast-container,.modal,.actions-card{display:none!important}body{background:#fff;color:#000}}
  </style>
</head>
<body>

<header class="topbar">
  <div class="topbar-inner">
    <button class="home-btn" onclick="goBack()" aria-label="Home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="color:#8b949e">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
    </button>
    <div class="topbar-center">
      <div>
        <div class="brand-name" id="ttl">Import - My Schedule</div>
        <div class="brand-sub" id="sub">Enter your Employee ID</div>
      </div>
    </div>
    <div class="topbar-right">
      <button class="ghost-btn theme-btn" onclick="toggleTheme()" id="themeBtn">🌙</button>
      <button class="ghost-btn" onclick="toggleLang()" id="langBtn">English</button>
      <div class="brand-mark">
        <div class="brand-swap">
          <button class="brand-sq show" id="brandCal" type="button" onclick="openTips()">📅</button>
          <button class="brand-sq" id="brandQ" type="button" onclick="openTips()">❔</button>
        </div>
      </div>
    </div>
  </div>
</header>

<div class="aurora-bar" id="auroraBar"><div class="aurora-bar-inner" id="auroraBarInner"></div></div>

<section class="search-section">
  <form id="searchForm">
    <div class="search-form">
      <div class="search-avatar-wrap" id="searchAvatarWrap" style="display:none">
        <div class="search-avatar" id="searchAvatar"></div>
        <button class="search-change-btn" type="button" id="searchChangeBtn" style="display:none"></button>
      </div>
      <div class="id-input">
        <span class="id-prefix">SN</span>
        <input class="search-input" id="empId" inputmode="numeric" autocomplete="off" placeholder="e.g. 12345" pattern="[0-9]+" required/>
      </div>
      <button class="search-btn" type="submit" id="sbtn">📅 View</button>
    </div>
  </form>
</section>

<main class="main">
  <div id="area" class="stack">
    <div class="state-view">
      <span class="state-emoji">📦</span>
      <div class="state-title" id="e1">Search your schedule</div>
      <div class="state-desc" id="e2">Enter your Employee ID above to view your monthly Import roster.</div>
    </div>
  </div>
</main>

<footer style="text-align:center;padding:18px 16px 28px;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;user-select:none;">
  <span style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:rgba(139,148,158,.45);">khalidsaif912.github.io/roster-site</span>
  <span id="footerCredit" style="font-size:10px;font-weight:600;letter-spacing:.6px;color:rgba(139,148,158,.45);">Design: KHALID ALRAQADI</span>
</footer>

<div class="toast-container" id="toastMount" style="display:none"></div>

<div class="modal" id="idActionModal" role="dialog" aria-modal="true" style="align-items:center;padding:20px">
  <div class="modal-backdrop" onclick="closeIdActionModal()"></div>
  <div class="modal-sheet" style="border-radius:20px;max-width:400px;width:100%">
    <div class="modal-head" style="border-bottom:none;padding-bottom:8px">
      <div><div class="modal-title" id="idActionTitle">Action</div></div>
      <button class="modal-close" onclick="closeIdActionModal()">✕</button>
    </div>
    <div class="modal-body" style="padding-top:4px">
      <div class="modal-intro">
        <div class="modal-intro-title" id="idActionIntroTitle">Confirm</div>
        <div class="modal-intro-desc" id="idActionIntroDesc">—</div>
      </div>
    </div>
    <div class="modal-foot" style="gap:10px;justify-content:space-between;padding:0 22px 22px">
      <button class="tbtn" style="flex:1;height:42px" onclick="closeIdActionModal()" id="idActionCancel">Cancel</button>
      <button class="tbtn primary" style="flex:1;height:42px" onclick="confirmIdAction()" id="idActionOk">OK</button>
    </div>
  </div>
</div>

<div class="modal" id="tipsModal" role="dialog" aria-modal="true">
  <div class="modal-backdrop" onclick="closeTips()"></div>
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div><div class="modal-title" id="tipsTitleModal">Help & Tips</div><div class="modal-sub" id="tipsSub">Quick help for using the roster.</div></div>
      <button class="modal-close" onclick="closeTips()">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-intro"><div class="modal-intro-title" id="miTitle">Your Import roster in one view</div><div class="modal-intro-desc" id="miDesc">Enter your Employee ID to view the month, export as PDF / Image, or add to your calendar.</div></div>
      <div class="tip"><div class="tip-ico">💾</div><div class="tip-text" id="tip1">Save your Employee ID once — it will load automatically next time.</div></div>
      <div class="tip"><div class="tip-ico">🖼️</div><div class="tip-text" id="tip2">Image export produces a clean card with calendar and stats.</div></div>
      <div class="tip"><div class="tip-ico">📆</div><div class="tip-text" id="tip3">Use ICS export to add shifts to Apple/Google/Outlook calendars.</div></div>
    </div>
    <div class="modal-foot"><button class="ok-btn" onclick="closeTips()" id="tipsOk">Got it</button></div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
  function schedulesUrl(id){
    var base=location.pathname.includes('/roster-site/')?'/roster-site':'';
    return base+'/import/schedules/'+encodeURIComponent(id)+'.json';
  }
  var data=null,month=null,months=[],lang='ar',theme='dark';
  (function(){var sl=localStorage.getItem('importPrefLang'),st=localStorage.getItem('importPrefTheme');if(sl==='en'||sl==='ar')lang=sl;if(st==='light'||st==='dark')theme=st;if(theme==='light')document.body.classList.add('light');if(lang==='en'){document.documentElement.lang='en';document.documentElement.dir='ltr';}})();
  var STAT_META=[{k:'work',icon:'💼',c:'c-blue',label_en:'Work Days',label_ar:'أيام عمل'},{k:'off',icon:'🛌',c:'c-gray',label_en:'Days Off',label_ar:'أيام راحة'},{k:'morning',icon:'☀️',c:'c-amber',label_en:'Morning',label_ar:'صباحي'},{k:'afternoon',icon:'🌤️',c:'c-orange',label_en:'Afternoon',label_ar:'مسائي'},{k:'night',icon:'🌙',c:'c-purple',label_en:'Night',label_ar:'ليلي'},{k:'standby',icon:'🧍',c:'c-pink',label_en:'Standby',label_ar:'احتياطي'},{k:'leaves',icon:'✈️',c:'c-green',label_en:'Leaves',label_ar:'إجازات'}];
  var T={en:{title:'Import - My Schedule',sub:'Enter your Employee ID',heroTitle:'Your Import roster in one view',heroDesc:'Enter your Employee ID to view the month, export as PDF, Image, or add to your calendar.',tipsTitle:'Help & Tips',tipsSub:'Quick help for using the roster.',langBtn:'ع',ph:'e.g. 12345',sbtn:'📅 View',loading:'Loading…',notFound:'Employee not found',notFoundSub:'ID not in the system. Please check and try again.',e1:'Search your schedule',e2:'Enter your Employee ID above to view your monthly Import roster.',saveSub:'Open your schedule faster next time.',saveYes:'✅ Save',saveNo:'Not now',idActTitle:'Employee ID',idActChange:'Change saved ID?',idActChangeSub:'This will remove the saved ID from this device.',idActPin:'Set as My ID?',idActPinSub:'Save this ID on this device for faster access.',cancel:'Cancel',ok:'OK',days:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],months:['January','February','March','April','May','June','July','August','September','October','November','December']},ar:{title:'الوارد - جدولي',sub:'أدخل رقمك الوظيفي',heroTitle:'جدول الوارد في عرض واحد',heroDesc:'أدخل رقمك الوظيفي لعرض الشهر، ثم حمّل PDF/صورة أو أضفه للتقويم.',tipsTitle:'مساعدة ونصائح',tipsSub:'مساعدة سريعة لاستخدام الجدول.',langBtn:'EN',ph:'مثال: 12345',sbtn:'📅 عرض',loading:'جاري التحميل…',notFound:'لم يُعثر على موظف',notFoundSub:'الرقم غير موجود في النظام. تحقق وأعد المحاولة.',e1:'ابحث عن جدولك',e2:'أدخل رقمك الوظيفي أعلاه لعرض مناوبات الوارد.',saveSub:'لفتح الجدول بسرعة في المرات القادمة.',saveYes:'✅ احفظ',saveNo:'ليس الآن',idActTitle:'الرقم الوظيفي',idActChange:'هل تريد حذف الرقم الوظيفي؟',idActChangeSub:'سيتم حذف الرقم المحفوظ من هذا الجهاز نهائياً.',idActPin:'هل تريد حفظ الرقم الوظيفي؟',idActPinSub:'سيتم حفظ هذا الرقم على هذا الجهاز لفتح الجدول بسرعة.',cancel:'إلغاء',ok:'موافق',days:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],months:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']}};
  function t(k){return T[lang][k];}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  document.getElementById('themeBtn').textContent=theme==='dark'?'🌙':'☀️';
  function applyLangUI(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.body.classList.toggle('ar',lang==='ar');document.getElementById('ttl').textContent=t('title');document.getElementById('sub').textContent=t('sub');document.getElementById('langBtn').textContent=t('langBtn');document.getElementById('empId').placeholder=t('ph');document.getElementById('sbtn').textContent=t('sbtn');var e1=document.getElementById('e1'),e2=document.getElementById('e2');if(e1)e1.textContent=t('e1');if(e2)e2.textContent=t('e2');document.getElementById('tipsTitleModal').textContent=t('tipsTitle');document.getElementById('tipsSub').textContent=t('tipsSub');document.getElementById('miTitle').textContent=t('heroTitle');document.getElementById('miDesc').textContent=t('heroDesc');document.getElementById('tip1').textContent=lang==='ar'?'احفظ رقمك مرة واحدة — وسيظهر تلقائياً في المرة القادمة.':'Save your Employee ID once — it will load automatically next time.';document.getElementById('tip2').textContent=lang==='ar'?'حفظ الصورة ينتج بطاقة مرتبة بالتقويم والإحصائيات.':'Image export produces a clean card with calendar and stats.';document.getElementById('tip3').textContent=lang==='ar'?'استخدم تصدير ICS لإضافة المناوبات إلى تقويم Apple/Google/Outlook.':'Use ICS export to add shifts to Apple/Google/Outlook calendars.';document.getElementById('tipsOk').textContent='OK';var fc=document.getElementById('footerCredit');if(fc)fc.textContent=lang==='ar'?'تصميم: خالد الرقادي':'Design: KHALID ALRAQADI';if(data)renderSchedule();}
  function toggleTheme(){theme=theme==='dark'?'light':'dark';document.body.classList.toggle('light',theme==='light');document.getElementById('themeBtn').textContent=theme==='dark'?'🌙':'☀️';localStorage.setItem('importPrefTheme',theme);}
  function toggleLang(){lang=lang==='en'?'ar':'en';localStorage.setItem('importPrefLang',lang);applyLangUI();}
  function goBack(){var base=location.pathname.includes('/roster-site/')?'/roster-site':'';if(document.referrer&&document.referrer.includes(location.host))history.back();else location.href=base+'/import/';}
  function openTips(){document.getElementById('tipsModal').classList.add('open');}
  function closeTips(){document.getElementById('tipsModal').classList.remove('open');}
  document.getElementById('searchForm').addEventListener('submit',function(e){e.preventDefault();var id=document.getElementById('empId').value.trim();if(id)loadSchedule(id);});
  function codeToGroup(c){c=(c||'').toUpperCase().trim();if(!c||c==='O'||c==='OFF')return 'Off Day';if(c==='AL'||c.indexOf('ANNUAL')>=0)return 'Annual Leave';if(c==='SL'||c.indexOf('SICK')>=0)return 'Sick Leave';if(c==='TR'||c.indexOf('TRAIN')>=0)return 'Training';if(c.indexOf('STANDBY')>=0||c.startsWith('SB'))return 'Standby';if(c.startsWith('ST')&&c.length<=3)return 'Standby';if(c.startsWith('MN')||c.startsWith('ME'))return 'Morning';if(c.startsWith('AN')||c.startsWith('AE'))return 'Afternoon';if(c.startsWith('NN')||c.startsWith('NE'))return 'Night';return 'Other';}
  async function loadSchedule(id){document.getElementById('area').innerHTML='<div class="state-view"><div class="spin"></div><div class="state-title">'+t('loading')+'</div></div>';try{var res=await fetch(schedulesUrl(id));if(!res.ok)throw new Error('not found');data=await res.json();if(!data.schedules&&data.days){var mk=data.month||(new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0'));data={id:data.id,name:data.name,department:data.department,schedules:{[mk]:data.days.map(function(d){return{day:d.day,shift_code:d.code,shift_group:codeToGroup(d.code)};})}};}months=Object.keys(data.schedules||{}).sort();if(!months.length)throw new Error('empty');if(!localStorage.getItem('importSavedEmpId'))showSaveToast(id);var now=new Date(),cur=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');month=months.indexOf(cur)>=0?cur:months[months.length-1];renderSchedule();}catch(e){document.getElementById('searchAvatarWrap').style.display='none';document.getElementById('area').innerHTML='<div class="state-view"><span class="state-emoji">❌</span><div class="state-title">'+t('notFound')+'</div><div class="state-desc">'+t('notFoundSub')+'</div></div>';}}
  function showSaveToast(id){var m=document.getElementById('toastMount');m.style.display='flex';m.innerHTML='<div class="toast-card"><div class="toast-row"><div class="toast-ico">💾</div><div class="toast-text"><p><strong>'+(lang==='ar'?'هل تريد حفظ الرقم الوظيفي؟':'Save Employee ID?')+'</strong><br>'+t('saveSub')+'</p></div></div><div class="toast-btns"><button class="tbtn primary" onclick="confirmSave(\''+id+'\')">'+t('saveYes')+'</button><button class="tbtn" onclick="dismissToast()">'+t('saveNo')+'</button></div></div>';setTimeout(function(){dismissToast();},10000);}
  function confirmSave(id){localStorage.setItem('importSavedEmpId',id);dismissToast();if(data)renderSchedule();}
  function dismissToast(){var m=document.getElementById('toastMount');m.innerHTML='';m.style.display='none';}
  function changeMyId(){openIdActionModal('change');}function setAsMyId(){openIdActionModal('pin');}
  var _pendingIdAction=null;
  function openIdActionModal(kind){_pendingIdAction=kind;var m=document.getElementById('idActionModal');if(!m)return;document.getElementById('idActionTitle').textContent=t('idActTitle');document.getElementById('idActionIntroTitle').textContent=kind==='change'?t('idActChange'):t('idActPin');document.getElementById('idActionIntroDesc').textContent=kind==='change'?t('idActChangeSub'):t('idActPinSub');document.getElementById('idActionCancel').textContent=t('cancel');document.getElementById('idActionOk').textContent=t('ok');m.classList.add('open');}
  function closeIdActionModal(){var m=document.getElementById('idActionModal');if(m)m.classList.remove('open');_pendingIdAction=null;}
  function confirmIdAction(){if(_pendingIdAction==='change'){localStorage.removeItem('importSavedEmpId');closeIdActionModal();if(data)renderSchedule();}else if(_pendingIdAction==='pin'){if(data&&data.id)localStorage.setItem('importSavedEmpId',String(data.id));closeIdActionModal();if(data)renderSchedule();}else closeIdActionModal();}
  function calcStats(s){var r={work:0,off:0,morning:0,afternoon:0,night:0,standby:0,leaves:0};s.forEach(function(d){var g=d.shift_group||codeToGroup(d.shift_code||'');if(g==='Morning')r.morning++;else if(g==='Afternoon')r.afternoon++;else if(g==='Night')r.night++;else if(g==='Off Day')r.off++;else if(g==='Standby')r.standby++;else if(g==='Annual Leave'||g==='Sick Leave')r.leaves++;});r.work=r.morning+r.afternoon+r.night;return r;}
  function shiftClass(g){return{Morning:'s-morning',Afternoon:'s-afternoon',Night:'s-night','Off Day':'s-off','Annual Leave':'s-leave','Sick Leave':'s-leave',Training:'s-training',Standby:'s-standby',Other:'s-other'}[g]||'s-other';}
  function openStatsModal(){var el=document.getElementById('statsModalOverlay');if(el)el.style.display='flex';}
  function closeStatsModal(){var el=document.getElementById('statsModalOverlay');if(el)el.style.display='none';}
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeTips();closeStatsModal();closeMonthPicker();}});
  function jumpMonth(val){if(months.indexOf(val)>=0){month=val;renderSchedule();}}
  function toggleMonthPicker(){var p=document.getElementById('monthPopup');if(!p)return;p.style.cssText='';p.classList.toggle('open');if(p.classList.contains('open')){requestAnimationFrame(function(){var rect=p.getBoundingClientRect(),vw=window.innerWidth,margin=10;if(rect.right>vw-margin)p.style.transform='translateX(-'+(rect.right-(vw-margin))+'px)';else if(rect.left<margin)p.style.transform='translateX('+(margin-rect.left)+'px)';if(rect.bottom>window.innerHeight-margin){p.style.top='auto';p.style.bottom='calc(100% + 8px)';}});}}
  function closeMonthPicker(){var p=document.getElementById('monthPopup');if(p)p.classList.remove('open');}
  document.addEventListener('click',function(e){if(!e.target.closest('#mpBtn')&&!e.target.closest('#monthPopup'))closeMonthPicker();});
  function renderSchedule(){var sched=data.schedules[month]||[];var parts=month.split('-');var yr=parseInt(parts[0]),mo=parseInt(parts[1]);var firstDow=new Date(yr,mo-1,1).getDay(),dim=new Date(yr,mo,0).getDate(),now=new Date();var mLabel=T[lang].months[mo-1];var popupHTML='<div class="month-popup-grid">'+months.map(function(m){var mm=parseInt(m.split('-')[1]);return '<div class="mp-item '+(m===month?'active':'')+'" onclick="jumpMonth(\''+m+'\');closeMonthPicker()">'+T[lang].months[mm-1]+'</div>';}).join('')+'</div>';var savedId=localStorage.getItem('importSavedEmpId');var isMyId=savedId===String(data.id);var initials=(data.name||'?').split(' ').slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();var dayHdr=T[lang].days.map(function(d){return '<div>'+d+'</div>';}).join('');var cells='',dc=1;for(var w=0;w<6;w++){var rowHasDays=false;for(var d=0;d<7;d++){if(w===0&&d<firstDow){cells+='<div class="day empty"></div>';}else if(dc>dim){cells+='<div class="day empty"></div>';}else{rowHasDays=true;var dd=null;for(var i=0;i<sched.length;i++){if(sched[i].day===dc){dd=sched[i];break;}}var grp=dd?(dd.shift_group||codeToGroup(dd.shift_code||'')):'';var sc=grp?shiftClass(grp):'';var isToday=(now.getFullYear()===yr&&(now.getMonth()+1)===mo&&now.getDate()===dc);var code=dd?(dd.shift_code||(grp==='Off Day'?'OFF':grp==='Annual Leave'?'LV':grp==='Sick Leave'?'SL':grp==='Training'?'TR':grp==='Standby'?'ST':'')):'';var codeEl=code?'<span class="day-code">'+esc(code)+'</span>':'';cells+='<div class="day '+sc+(isToday?' today':'')+'"><span class="dnum">'+dc+'</span>'+codeEl+'</div>';dc++;}}if(dc>dim&&!rowHasDays)break;if(dc>dim)break;}var stats=calcStats(sched);var statsHTML=STAT_META.map(function(m){return '<div class="stat-card '+m.c+'"><span class="stat-ico">'+m.icon+'</span><div class="stat-val">'+stats[m.k]+'</div><div class="stat-lbl">'+(lang==='ar'?m.label_ar:m.label_en)+'</div></div>';}).join('');var avatarEl=document.getElementById('searchAvatar'),avatarWrap=document.getElementById('searchAvatarWrap'),chBtn=document.getElementById('searchChangeBtn');if(avatarEl)avatarEl.textContent=initials;if(avatarWrap)avatarWrap.style.display='flex';if(chBtn){if(isMyId){chBtn.textContent='✏️';chBtn.title='Change ID';chBtn.style.display='grid';chBtn.onclick=function(){changeMyId();};}else if(!savedId)chBtn.style.display='none';else{chBtn.textContent='📌';chBtn.title='Set as My ID';chBtn.style.display='grid';chBtn.onclick=function(){setAsMyId();};}}document.getElementById('area').innerHTML='<div id="exportArea" class="export-area"><div class="emp-banner"><div class="emp-info"><div class="emp-name-row"><div class="emp-name">'+esc(data.name)+'</div></div><div class="emp-dept">'+esc(data.department)+'</div></div><div class="emp-right"><div class="month-wrap"><button class="month-picker-btn" id="mpBtn" onclick="toggleMonthPicker()">'+esc(mLabel)+' <span class="mpb-arrow">▼</span></button><div class="month-popup" id="monthPopup">'+popupHTML+'</div></div></div></div><div class="cal-card"><div class="cal-head">'+dayHdr+'</div><div class="cal-body">'+cells+'</div></div></div><div class="actions-card"><div class="actions-grid"><button class="action-btn" onclick="dlPDF()"><span class="action-ico">📄</span>PDF</button><button class="action-btn" onclick="dlIMG()"><span class="action-ico">🖼️</span>'+(lang==='ar'?'صورة':'Image')+'</button><button class="action-btn" onclick="openStatsModal()"><span class="action-ico">📊</span>'+(lang==='ar'?'إحصائيات':'Stats')+'</button></div><div class="actions-grid" style="margin-top:8px"><button class="action-btn" onclick="dlICS()"><span class="action-ico">📆</span>ICS</button><button class="action-btn" onclick="shareS()"><span class="action-ico">🔗</span>'+(lang==='ar'?'مشاركة':'Share')+'</button><button class="action-btn" onclick="window.print()"><span class="action-ico">🖨️</span>'+(lang==='ar'?'طباعة':'Print')+'</button></div></div><div class="stats-modal-overlay" id="statsModalOverlay" onclick="closeStatsModal()" style="display:none"><div class="stats-modal" onclick="event.stopPropagation()"><div class="stats-modal-head"><span>'+(lang==='ar'?'الإحصائيات':'Statistics')+'</span><button onclick="closeStatsModal()" class="stats-modal-close">✕</button></div><div class="stats-modal-body">'+statsHTML+'</div></div></div>';}
  async function captureExportCanvas(){var source=document.getElementById('exportArea')||document.querySelector('.main');if(!source)throw new Error('no export area');var clone=source.cloneNode(true);var wrap=document.createElement('div');wrap.style.cssText='position:fixed;left:-9999px;top:0;width:420px;padding:16px;box-sizing:border-box;';wrap.style.background=getComputedStyle(document.body).backgroundColor||'#0d1117';wrap.appendChild(clone);document.body.appendChild(wrap);await new Promise(function(r){requestAnimationFrame(r);});var canvas=await html2canvas(wrap,{scale:3,backgroundColor:null,useCORS:true});document.body.removeChild(wrap);return canvas;}
  async function dlIMG(){try{var canvas=await captureExportCanvas();var a=document.createElement('a');a.download='import-'+data.id+'-'+month+'.png';a.href=canvas.toDataURL('image/png');a.click();}catch(e){alert(lang==='ar'?'تعذر حفظ الصورة.':'Image export failed.');}}
  async function dlPDF(){try{var canvas=await captureExportCanvas();var imgData=canvas.toDataURL('image/png');var jsPDF=window.jspdf.jsPDF;var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});var pageW=210,pageH=297,margin=10,imgW=pageW-margin*2,imgH=(canvas.height*imgW)/canvas.width;pdf.addImage(imgData,'PNG',margin,margin,imgW,imgH);var rem=imgH-(pageH-margin*2);while(rem>0){pdf.addPage();pdf.addImage(imgData,'PNG',margin,margin-(imgH-rem),imgW,imgH);rem-=(pageH-margin*2);}pdf.save('import-'+data.id+'-'+month+'.pdf');}catch(e){alert(lang==='ar'?'تعذر حفظ PDF.':'PDF export failed.');}}
  function dlICS(){var sched=data.schedules[month]||[];var parts=month.split('-');var yr=parseInt(parts[0]),mo=parseInt(parts[1]);var pad=function(n){return String(n).padStart(2,'0');};var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ImportMySchedule//EN','CALSCALE:GREGORIAN'];sched.forEach(function(d){var dt2=yr+''+pad(mo)+''+pad(d.day);var dn=new Date(yr,mo-1,d.day+1);var dtE=dn.getFullYear()+''+pad(dn.getMonth()+1)+''+pad(dn.getDate());lines.push('BEGIN:VEVENT','DTSTART;VALUE=DATE:'+dt2,'DTEND;VALUE=DATE:'+dtE,'SUMMARY:'+(d.shift_code||d.shift_group),'UID:'+dt2+'-'+data.id+'@import','END:VEVENT');});lines.push('END:VCALENDAR');var blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='import-'+data.id+'-'+month+'.ics';a.click();URL.revokeObjectURL(a.href);}
  function shareS(){var base=location.pathname.includes('/roster-site/')?'/roster-site':'';var url=location.origin+base+'/import/my-schedules/?emp='+encodeURIComponent(data.id);if(navigator.share)navigator.share({title:'Import - My Schedule',text:'Schedule: '+data.name,url:url});else{navigator.clipboard.writeText(url);alert(lang==='ar'?'تم نسخ الرابط ✅':'Link copied ✅');}}
  (function(){var cal=document.getElementById('brandCal'),q=document.getElementById('brandQ');if(!cal||!q)return;var sc=true;setInterval(function(){sc=!sc;cal.classList.toggle('show',sc);q.classList.toggle('show',!sc);},2600);})();
  (function(){var topbar=document.querySelector('.topbar'),aI=document.getElementById('auroraBarInner'),aB=document.getElementById('auroraBar');if(!topbar)return;function sp(){var h=topbar.offsetHeight||62;if(aB)aB.style.top=h+'px';}window.addEventListener('scroll',function(){if(aI)aI.classList.toggle('visible',window.scrollY>5);},{passive:true});setTimeout(sp,100);window.addEventListener('resize',sp);})();
  applyLangUI();
  var p=new URLSearchParams(location.search).get('emp');
  if(p){document.getElementById('empId').value=p;loadSchedule(p);}
  else{var saved=localStorage.getItem('importSavedEmpId');if(saved){document.getElementById('empId').value=saved;loadSchedule(saved);}}
</script>
</body>
</html>"""



def build_employee_month_entries(parsed: Dict[str, Any], emp: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return a list of day entries for a single month."""
    year = parsed["year"]
    month = parsed["month"]
    out: List[Dict[str, Any]] = []
    for d in sorted(parsed["date_cols"].keys()):
        try:
            dt.date(year, month, d)  # validate
        except ValueError:
            continue
        code = emp["shifts"].get(d, "")
        if not code:
            continue
        bucket, *_ = shift_bucket(code)
        out.append({
            "day": int(d),
            "shift_code": str(code),
            "shift_group": bucket,
        })
    return out



MONTH_NAME_TO_NUM = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

def month_key_from_filename(name: str) -> str | None:
    """Extract YYYY-MM key from filename.
    Handles: IMP_FEB_2026.xlsx | MARCH ROSTER MID.xlsx | FEBRUARY 2026.xlsx
    If no year found in filename, uses current year from Muscat time.
    """
    if not name:
        return None
    n = name.lower()
    n = re.sub(r"[\._\-]+", " ", n)
    # إزالة الحروف الملصقة بالأرقام مثل 2026v → 2026
    n = re.sub(r"(\d{4})[a-z]+", r"\1", n)
    n = re.sub(r"\s+", " ", n).strip()

    month_pattern = (
        r"\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul"
        r"|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b"
    )

    # محاولة 1: اسم الشهر + سنة (MARCH 2026 أو FEB_2026)
    m = re.search(month_pattern + r"\s*(\d{4})\b", n)
    if m:
        mon = MONTH_NAME_TO_NUM.get(m.group(1))
        if mon:
            return f"{int(m.group(2)):04d}-{mon:02d}"

    # محاولة 2: سنة + اسم الشهر (2026_MARCH)
    m = re.search(r"\b(\d{4})\s*" + month_pattern, n)
    if m:
        mon = MONTH_NAME_TO_NUM.get(m.group(2))
        if mon:
            return f"{int(m.group(1)):04d}-{mon:02d}"

    # محاولة 3: اسم الشهر فقط بدون سنة — نستخدم السنة الحالية
    m = re.search(month_pattern, n)
    if m:
        mon = MONTH_NAME_TO_NUM.get(m.group(1))
        if mon:
            today = muscat_today()
            year = today.year
            # إذا الشهر المكتشف أقل من الشهر الحالي بكثير، ربما يقصدون السنة القادمة
            if mon < today.month - 3:
                year += 1
            print(f"  ℹ️  No year in filename — using year {year} for month {mon}")
            return f"{year:04d}-{mon:02d}"

    return None


def main() -> None:
    repo_root = Path(__file__).resolve().parent
    out_root = repo_root / "docs" / "import"
    out_root.mkdir(parents=True, exist_ok=True)

    # Cache directory inside repo — committed by GitHub Actions
    # Stores: import-rosters/YYYY-MM.xlsx  +  YYYY-MM.meta.json
    cache_dir = repo_root / "import-rosters"
    cache_dir.mkdir(exist_ok=True)

    today = muscat_today()

    url = os.getenv("IMPORT_EXCEL_URL", "").strip()
    if not url:
        raise SystemExit("Missing env IMPORT_EXCEL_URL")

    # ── 0. حذف صفحات التواريخ القديمة لتجنب تراكم أشهر قديمة ──────
    # نحذف مجلدات YYYY-MM-DD التي لا تنتمي للأشهر الثلاثة المتوقعة
    # (هذا يمنع مشكلة فتح يناير بعد تحميل فبراير)
    print("🧹 Cleaning up old date pages...")

    source_name_url = os.getenv("IMPORT_SOURCE_NAME_URL", "").strip()

    # ── 1. تحميل الملف من OneDrive ──────────────────────────────
    data: bytes | None = None
    try:
        data = download_excel(url)
        print("✅ Excel downloaded successfully")
    except Exception as e:
        print(f"WARNING: Could not download Excel: {e}")
        print("Will attempt to use cached rosters...")

    # ── 2. قراءة اسم الملف من source_name.txt (اختياري) ─────────
    source_name = ""
    if source_name_url:
        try:
            source_name = download_text(source_name_url)
        except Exception as e:
            print(f"WARNING: Could not read source_name.txt: {e}")
    print(f"📄 Source file: {source_name or '(unknown)'}")

    # ── 3. استخراج الشهر — من اسم الملف أو من داخل الـ Excel ────
    incoming_key = month_key_from_filename(source_name) if source_name else None

    # لا نقرأ الشهر من اسم الشيت — قد يكون خاطئاً (شيت يناير داخل ملف فبراير)

    print(f"📅 Detected month: {incoming_key or 'unknown'}")

    # ── 4. حفظ في الكاش إذا نجح التحميل ────────────────────────
    # المنطق: نمسح كل الشيتات في الملف ونكاش كل شيت له اسم شهر.
    # لا نعتمد على incoming_key كبوابة — الملف قد يحتوي شهرين بدون اسم شهر في اسم الملف.
    if data:
        import tempfile
        cached_keys_from_sheets: List[str] = []
        try:
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tf:
                tf.write(data)
                tf_path = tf.name
            xls_check = pd.ExcelFile(tf_path)
            now_str = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # تتبع الشيتات المُكاشَة: sn_key -> sheet_name (لتجنب تعارض شهرين)
            cached_keys_this_run: dict = {}  # sn_key -> sheet_name

            all_sheet_names = xls_check.sheet_names
            for sheet_idx, sn in enumerate(all_sheet_names):
                # الأولوية 1: اسم الشيت يحتوي اسم الشهر
                sn_key = month_key_from_filename(sn)

                # الأولوية 2: فحص محتوى الشيت الفعلي
                if not sn_key:
                    sn_key = detect_sheet_month(tf_path, sn)
                    if sn_key:
                        print(f"  🔍 Sheet '{sn}': شهر مكتشف من المحتوى → {sn_key}")

                # الأولوية 3: اسم الملف للشيت الأول الغامض
                if not sn_key:
                    if incoming_key and incoming_key not in cached_keys_this_run:
                        sn_key = incoming_key
                        print(f"  ℹ️  Sheet '{sn}' (index {sheet_idx}): اسم غامض — سيُكاش باسم الملف ({incoming_key})")

                # الأولوية 4: الشهر التالي بالترتيب — لشيتات غامضة إضافية
                # (مثال: Sheet1=فبراير من اسم الملف، Sheet2=مارس تلقائياً)
                if not sn_key and cached_keys_this_run:
                    last_key = sorted(cached_keys_this_run.keys())[-1]
                    try:
                        ly, lm = map(int, last_key.split("-"))
                        next_m = lm % 12 + 1
                        next_y = ly + (1 if lm == 12 else 0)
                        sn_key = f"{next_y}-{next_m:02d}"
                        print(f"  ℹ️  Sheet '{sn}' (index {sheet_idx}): اسم غامض — الشهر التالي بالترتيب → {sn_key}")
                    except Exception:
                        pass

                if not sn_key:
                    print(f"  ⚠️  Sheet '{sn}': لا يمكن تحديد الشهر — تخطي")
                    continue

                if sn_key in cached_keys_this_run:
                    print(f"  ⚠️  Sheet '{sn}' و '{cached_keys_this_run[sn_key]}' كلاهما {sn_key} — سيُستخدم الأخير")

                cached_keys_this_run[sn_key] = sn

                # ── حماية الكاش ──────────────────────────────────────────
                # لا نكتب فوق كاش موجود إلا إذا كان الشهر مُثبَّتاً بشكل واضح:
                # - اسم الشيت يحتوي اسم الشهر صراحةً، أو
                # - محتوى الشيت يُثبت الشهر (detect_sheet_month)
                # أما التخمين بـ "الشهر التالي" أو اسم الملف → لا يُكتب فوق كاش موجود
                xlsx_cache = cache_dir / f"{sn_key}.xlsx"
                meta_cache = cache_dir / f"{sn_key}.meta.json"

                confirmed_by_content = (
                    month_key_from_filename(sn) is not None or           # اسم الشيت واضح
                    detect_sheet_month(tf_path, sn) == sn_key            # محتوى الشيت يُثبته
                )

                if xlsx_cache.exists() and not confirmed_by_content:
                    print(f"  🔒 Skipping overwrite of {sn_key}.xlsx — not confirmed by sheet name/content (تخمين فقط)")
                    cached_keys_from_sheets.append(sn_key)  # نعدّه موجوداً من الكاش القديم
                    continue

                xlsx_cache.write_bytes(data)
                meta_cache.write_text(json.dumps({
                    "month_key": sn_key,
                    "original_filename": source_name,
                    "sheet_name": sn,
                    "downloaded_at": now_str,
                }, ensure_ascii=False, indent=2), encoding="utf-8")
                cached_keys_from_sheets.append(sn_key)
                if confirmed_by_content:
                    print(f"  ✅ Cached sheet '{sn}' → {sn_key}.xlsx")
                else:
                    print(f"  ✅ Cached sheet '{sn}' → {sn_key}.xlsx (كاش جديد بالتخمين)")

            Path(tf_path).unlink(missing_ok=True)

            # لو لم تُكتشَف أي شيتات بشهر، ارجع لـ incoming_key كحل أخير
            if not cached_keys_from_sheets and incoming_key:
                xlsx_cache = cache_dir / f"{incoming_key}.xlsx"
                meta_cache = cache_dir / f"{incoming_key}.meta.json"
                xlsx_cache.write_bytes(data)
                meta_cache.write_text(json.dumps({
                    "month_key": incoming_key,
                    "original_filename": source_name,
                    "downloaded_at": now_str,
                }, ensure_ascii=False, indent=2), encoding="utf-8")
                cached_keys_from_sheets.append(incoming_key)
                print(f"  ✅ Cached (filename fallback) → {incoming_key}.xlsx")

            if not cached_keys_from_sheets:
                print("  ⚠️  لم يُكاشَ أي شهر — تأكد من أسماء الشيتات أو اسم الملف")

        except Exception as e:
            print(f"⚠️ Could not scan sheets for caching: {e}")

    else:
        print("⚠️ No data downloaded — relying on existing cache")

    # ── 5. حساب الأشهر الثلاثة (دائماً بناءً على تاريخ اليوم) ──────
    # الـ anchor دائماً هو اليوم الحقيقي — الملف المرفوع يُخزَّن في كاشه
    # بحسب شهره، ثم نولّد الصفحات للأشهر prev/curr/next بالنسبة لليوم.
    anchor_start = month_start(today)
    anchor_key = anchor_start.strftime("%Y-%m")

    prev_start = month_start(add_months(anchor_start, -1))
    curr_start = month_start(anchor_start)
    next_start = month_start(add_months(anchor_start, +1))

    prev_key = prev_start.strftime("%Y-%m")
    curr_key = curr_start.strftime("%Y-%m")
    next_key = next_start.strftime("%Y-%m")

    print(f"📅 Anchor month: {curr_key} (always based on today's date)")
    print(f"📅 Month range: {prev_key} → {curr_key} → {next_key}")

    # ── 5b. حذف صفحات التواريخ التي لا تنتمي للأشهر الثلاثة ─────────
    allowed_prefixes = {prev_key, curr_key, next_key}
    import shutil
    for date_dir in out_root.glob("2[0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]"):
        if date_dir.is_dir():
            folder_month = date_dir.name[:7]  # "YYYY-MM"
            if folder_month not in allowed_prefixes:
                shutil.rmtree(date_dir)
                print(f"  🗑️  Removed stale: {date_dir.name}")
    print("✅ Cleanup done")

    # ── 6. تحميل الكاش لكل شهر ───────────────────────────────────
    def load_cached(month_key: str) -> bytes | None:
        p = cache_dir / f"{month_key}.xlsx"
        return p.read_bytes() if p.exists() else None

    def cached_name(month_key: str) -> str:
        p = cache_dir / f"{month_key}.meta.json"
        if not p.exists():
            return ""
        try:
            return json.loads(p.read_text(encoding="utf-8")).get("original_filename", "")
        except Exception:
            return ""

    bytes_prev = load_cached(prev_key)
    bytes_curr = load_cached(curr_key)
    bytes_next = load_cached(next_key)

    # استخدام البيانات المحملة لتعبئة الكاش الناقص
    if data and incoming_key:
        if bytes_prev is None and incoming_key == prev_key:
            bytes_prev = data
            print(f"✅ Using downloaded data for {prev_key}")
        elif bytes_curr is None and incoming_key == curr_key:
            bytes_curr = data
            print(f"✅ Using downloaded data for {curr_key}")
        elif bytes_next is None and incoming_key == next_key:
            bytes_next = data
            print(f"✅ Using downloaded data for {next_key}")

    print(f"📦 Cache: prev={'✅' if bytes_prev else '❌'} | curr={'✅' if bytes_curr else '❌'} | next={'✅' if bytes_next else '❌'}")

    # ── 7. توليد الصفحات لكل شهر متوفر ─────────────────────────
    style, export_script = load_export_ui_template(repo_root)
    schedules_by_emp: Dict[str, Any] = {}
    parsed_for_today: Dict[str, Any] | None = None

    # قائمة الأشهر المتوفرة فعلاً (للـ date picker في JS)
    available_months: List[str] = []
    if bytes_prev: available_months.append(prev_key)
    if bytes_curr: available_months.append(curr_key)
    if bytes_next: available_months.append(next_key)
    print(f"📅 Available months: {available_months}")

    tmp_dir = repo_root / ".tmp_import"
    tmp_dir.mkdir(exist_ok=True)

    for month_bytes, month_key, month_start_date in [
        (bytes_prev, prev_key, prev_start),
        (bytes_curr, curr_key, curr_start),
        (bytes_next, next_key, next_start),
    ]:
        if not month_bytes:
            print(f"  ⏭️  Skipping {month_key} — not in cache")
            continue

        print(f"  🗓️  Generating {month_key}...")
        xlsx_path = tmp_dir / f"import_{month_key}.xlsx"
        xlsx_path.write_bytes(month_bytes)

        xls = pd.ExcelFile(str(xlsx_path))

        # ✅ تحقق أن الكاش يحتوي الشهر الصحيح — إذا ملوث استبدله أو تخطّه
        cache_valid = False
        for sn in xls.sheet_names:
            detected = detect_sheet_month(str(xlsx_path), sn)
            if detected == month_key or (month_key_from_filename(sn) == month_key):
                cache_valid = True
                break
            if not detected and not month_key_from_filename(sn) and incoming_key == month_key:
                cache_valid = True
                break

        if not cache_valid and data and incoming_key == month_key:
            print(f"  ⚠️  الكاش {month_key}.xlsx ملوث — إعادة كاش من الملف الجديد")
            xlsx_path.write_bytes(data)
            xls = pd.ExcelFile(str(xlsx_path))
            (cache_dir / f"{month_key}.xlsx").write_bytes(data)
        elif not cache_valid:
            print(f"  ⚠️  الكاش {month_key}.xlsx ملوث ولا يوجد ملف جديد — تخطي")
            stale_cache = cache_dir / f"{month_key}.xlsx"
            stale_meta  = cache_dir / f"{month_key}.meta.json"
            if stale_cache.exists(): stale_cache.unlink()
            if stale_meta.exists():  stale_meta.unlink()
            continue

        # ✅ اختر الشيت الصحيح بناءً على month_key:
        # الأولوية: 1) اسم الشيت المحفوظ في meta.json  2) البحث باسم الشهر  3) الشيت الأول
        target_year, target_month = map(int, month_key.split("-"))
        target_month_name = ["january","february","march","april","may","june",
                             "july","august","september","october","november","december"][target_month - 1]

        # تحقق من meta.json لو فيه sheet_name محدد
        sheet = None
        meta_path = cache_dir / f"{month_key}.meta.json"
        if meta_path.exists():
            try:
                saved_sheet = json.loads(meta_path.read_text(encoding="utf-8")).get("sheet_name", "")
                if saved_sheet and saved_sheet in xls.sheet_names:
                    sheet = saved_sheet
                    print(f"  📋 Selected sheet from meta: '{sheet}' for {month_key}")
            except Exception:
                pass

        if not sheet:
            # بحث باسم الشهر في أسماء الشيتات
            for sn in xls.sheet_names:
                if target_month_name in sn.lower():
                    sheet = sn
                    print(f"  📋 Selected sheet by month name: '{sheet}' for {month_key}")
                    break

        if not sheet:
            # الأولوية 3: فحص محتوى كل شيت لاكتشاف الشهر الفعلي
            for sn in xls.sheet_names:
                detected = detect_sheet_month(str(xlsx_path), sn)
                if detected == month_key:
                    sheet = sn
                    print(f"  🔍 Selected sheet by content scan: '{sheet}' for {month_key}")
                    break

        if not sheet:
            # الأولوية 4: نبني خريطة شاملة لكل شيتات الملف → شهورها
            # ونعطي الشيتات الغامضة شهوراً بالترتيب بدءاً من أقدم شهر مكتشف
            sheet_month_map: dict = {}  # sheet_name -> "YYYY-MM"
            detected_months = []
            for sn in xls.sheet_names:
                k = month_key_from_filename(sn) or detect_sheet_month(str(xlsx_path), sn)
                if k:
                    sheet_month_map[sn] = k
                    detected_months.append(k)

            # الشيتات الغامضة تأخذ الشهر التالي بالترتيب
            if detected_months:
                anchor_detected = sorted(detected_months)[0]
                ay, am = map(int, anchor_detected.split("-"))
                offset = 0
                for sn in xls.sheet_names:
                    if sn not in sheet_month_map:
                        # أضف بالترتيب بعد آخر شهر مكتشف
                        last = sorted(sheet_month_map.values())[-1] if sheet_month_map else anchor_detected
                        ly, lm = map(int, last.split("-"))
                        nm = lm % 12 + 1
                        ny = ly + (1 if lm == 12 else 0)
                        sheet_month_map[sn] = f"{ny}-{nm:02d}"

            # الآن ابحث عن month_key في الخريطة
            for sn, mk in sheet_month_map.items():
                if mk == month_key:
                    sheet = sn
                    print(f"  🗺️  Selected sheet by full map: '{sheet}' for {month_key}")
                    break

        if not sheet:
            print(f"  ❌ لا يوجد شيت يطابق {month_key} — تخطي لتجنب بيانات خاطئة")
            stale_cache = cache_dir / f"{month_key}.xlsx"
            stale_meta  = cache_dir / f"{month_key}.meta.json"
            if stale_cache.exists(): stale_cache.unlink()
            if stale_meta.exists():  stale_meta.unlink()
            continue
        src_name = cached_name(month_key) or source_name or sheet

        parsed = parse_month_sheet(str(xlsx_path), sheet, override_month_key=month_key)
        parsed["source_filename"] = src_name

        # ✅ دائماً نجبر السنة والشهر من month_key (اسم الملف) — لا نثق باسم الشيت
        try:
            _ky, _km = map(int, month_key.split("-"))
            parsed["year"] = _ky
            parsed["month"] = _km
            parsed["month_name"] = ["January","February","March","April","May","June",
                                    "July","August","September","October","November","December"][_km - 1]
            print(f"  📌 Forced month from key: {parsed['month_name']} {parsed['year']}")
        except Exception:
            pass

        # Provide nav bounds to the template so the date picker won't allow months with no pages.
        available_starts: list[dt.date] = []
        if bytes_prev: available_starts.append(prev_start)
        if bytes_curr: available_starts.append(curr_start)
        if bytes_next: available_starts.append(next_start)
        if available_starts:
            nav_min = min(available_starts)
            nav_max_start = max(available_starts)
            nav_max = dt.date(nav_max_start.year, nav_max_start.month, calendar.monthrange(nav_max_start.year, nav_max_start.month)[1])
            parsed["nav_min_date"] = nav_min.strftime("%Y-%m-%d")
            parsed["nav_max_date"] = nav_max.strftime("%Y-%m-%d")

        # بناء صفحات YYYY-MM-DD
        for d in iter_month_days(parsed["year"], parsed["month"]):
            day_dir = out_root / d.strftime("%Y-%m-%d")
            day_dir.mkdir(parents=True, exist_ok=True)
            html = build_duty_html(style, export_script, parsed, d, repo_base_path="/import", available_months=available_months)
            # ✅ تنظيف الـ surrogates قبل الكتابة
            html = html.encode("utf-8", errors="replace").decode("utf-8")
            (day_dir / "index.html").write_text(html, encoding="utf-8")

        # دمج جداول الموظفين
        mk = f"{parsed['year']}-{parsed['month']:02d}"
        for emp in parsed["employees"]:
            emp_id = str(emp["id"]).strip()
            if not emp_id:
                continue
            rec = schedules_by_emp.setdefault(emp_id, {
                "id": emp_id,
                "name": emp["name"],
                "department": emp["dept_name"],
                "schedules": {},
            })
            rec["schedules"][mk] = build_employee_month_entries(parsed, emp)

        if parsed["year"] == anchor_start.year and parsed["month"] == anchor_start.month:
            parsed_for_today = parsed
            print(f"  ✅ parsed_for_today set → {parsed['month_name']} {parsed['year']}")

    # ── 8. الصفحة الرئيسية ─────────────────────────────────────────
    landing_html: str | None = None

    # أولاً: نحاول بناء صفحة اليوم مباشرة من البيانات المحملة
    if parsed_for_today:
        landing_html = build_duty_html(style, export_script, parsed_for_today, today, repo_base_path="/import", available_months=available_months)
        today_dir = out_root / today.strftime("%Y-%m-%d")
        today_dir.mkdir(parents=True, exist_ok=True)
        (today_dir / "index.html").write_text(landing_html.encode("utf-8", errors="replace").decode("utf-8"), encoding="utf-8")
        print(f"✅ Landing page: today {today}")

    # ثانياً: أي يوم من الشهر الحالي (curr_key) من الصفحات المولّدة للتو
    if landing_html is None:
        matches = sorted(out_root.glob(f"{curr_key}-*/index.html"), reverse=True)
        if matches:
            landing_html = matches[0].read_text(encoding="utf-8")
            print(f"✅ Landing page: latest {curr_key} day → {matches[0].parent.name}")

    # ثالثاً: أي شهر متوفر — نأخذ الأحدث دائماً
    if landing_html is None:
        # نبحث فقط في الأشهر المسموح بها (prev/curr/next) لتجنب أشهر قديمة
        for mk in [curr_key, next_key, prev_key]:
            matches = sorted(out_root.glob(f"{mk}-*/index.html"), reverse=True)
            if matches:
                landing_html = matches[0].read_text(encoding="utf-8")
                print(f"⚠️ Landing page fallback: {matches[0].parent.name}")
                break

    if landing_html is None:
        landing_html = """<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h2>Import Duty Roster</h2><p>No data available yet. Please wait for the next update.</p>
        </body></html>"""
        print("⚠️ No pages generated — writing placeholder index")

    # ── الصفحة الرئيسية: redirect تلقائي لتاريخ اليوم ──────────
    # إذا لم توجد صفحة اليوم، يذهب لأقرب يوم متوفر من الأشهر المتاحة
    # نبني قائمة بكل التواريخ المتاحة لنضعها في JS
    available_dates_list: List[str] = []
    for _mk in [curr_key, next_key, prev_key]:
        for _f in sorted(out_root.glob(f"{_mk}-*/index.html")):
            available_dates_list.append(_f.parent.name)
    available_dates_js = json.dumps(sorted(set(available_dates_list)))

    redirect_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Import Duty Roster</title>
  <script>
    (function() {{
      var base = location.pathname.includes('/roster-site/') ? '/roster-site/import' : '/import';
      var today = new Date();
      var y = today.getFullYear();
      var m = String(today.getMonth() + 1).padStart(2, '0');
      var d = String(today.getDate()).padStart(2, '0');
      var todayStr = y + '-' + m + '-' + d;
      var available = {available_dates_js};

      // إذا وُجد تاريخ اليوم مباشرة اذهب إليه
      if (available.indexOf(todayStr) !== -1) {{
        window.location.replace(base + '/' + todayStr + '/');
        return;
      }}

      // وإلا اذهب لأقرب تاريخ متوفر (الأحدث قبل اليوم، أو الأول المتاح)
      var best = null;
      for (var i = available.length - 1; i >= 0; i--) {{
        if (available[i] <= todayStr) {{ best = available[i]; break; }}
      }}
      if (!best && available.length) best = available[available.length - 1];
      if (best) {{
        window.location.replace(base + '/' + best + '/');
      }} else {{
        document.body.innerHTML = '<p style="font-family:sans-serif;text-align:center;padding:40px;">لا توجد بيانات متاحة بعد. يرجى الانتظار.</p>';
      }}
    }})();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0; url=fallback/">
  </noscript>
</head>
<body>
  <p style="font-family:sans-serif;text-align:center;padding:40px;">جاري التوجيه...</p>
</body>
</html>"""

    (out_root / "index.html").write_text(redirect_html, encoding="utf-8")

    # fallback و now: redirect لتاريخ اليوم مباشرة — لا نعرض HTML قديم
    _simple_redirect = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Import Duty Roster</title>
  <script>
    (function() {{
      var base = location.pathname.includes('/roster-site/') ? '/roster-site/import' : '/import';
      var today = new Date();
      var y = today.getFullYear();
      var m = String(today.getMonth() + 1).padStart(2, '0');
      var d = String(today.getDate()).padStart(2, '0');
      var todayStr = y + '-' + m + '-' + d;
      var available = {available_dates_js};
      if (available.indexOf(todayStr) !== -1) {{
        window.location.replace(base + '/' + todayStr + '/');
        return;
      }}
      var best = null;
      for (var i = available.length - 1; i >= 0; i--) {{
        if (available[i] <= todayStr) {{ best = available[i]; break; }}
      }}
      if (!best && available.length) best = available[available.length - 1];
      if (best) window.location.replace(base + '/' + best + '/');
    }})();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0; url=../">
  </noscript>
</head>
<body>
  <p style="font-family:sans-serif;text-align:center;padding:40px;">جاري التوجيه...</p>
</body>
</html>"""

    fallback_dir = out_root / "fallback"
    fallback_dir.mkdir(parents=True, exist_ok=True)
    (fallback_dir / "index.html").write_text(_simple_redirect, encoding="utf-8")

    now_dir = out_root / "now"
    now_dir.mkdir(parents=True, exist_ok=True)
    (now_dir / "index.html").write_text(_simple_redirect, encoding="utf-8")

    # ── 9. ملفات JSON للموظفين ────────────────────────────────────
    sched_dir = out_root / "schedules"
    sched_dir.mkdir(parents=True, exist_ok=True)
    for emp_id, payload in schedules_by_emp.items():
        payload["months"] = sorted(payload.get("schedules", {}).keys())
        (sched_dir / f"{emp_id}.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )

    # ── 10. صفحة My Schedule ──────────────────────────────────────
    my_dir = out_root / "my-schedules"
    my_dir.mkdir(parents=True, exist_ok=True)
    (my_dir / "index.html").write_text(
        build_my_schedule_html(style, repo_base_path="/import"), encoding="utf-8"
    )

    # ── 11. ملف meta للتتبع ───────────────────────────────────────
    meta = {
        "generated_for": str(today),
        "months_generated": sorted({prev_key, curr_key, next_key} & {
            k for k, b in [(prev_key, bytes_prev), (curr_key, bytes_curr), (next_key, bytes_next)] if b
        }),
        "employees_total_unique": len(schedules_by_emp),
        "source_file": source_name,
        "incoming_month": incoming_key,
    }
    (out_root / "import_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print("✅ Generated Import pages in docs/import/")


if __name__ == "__main__":
    main()
