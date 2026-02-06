import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO

import requests
from openpyxl import load_workbook
import smtplib
from email.mime.text import MIMEText

# =========================
# Settings / Secrets
# =========================
EXCEL_URL = os.environ.get("EXCEL_URL", "").strip()

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip()
MAIL_TO = os.environ.get("MAIL_TO", "").strip()

PAGES_BASE_URL = os.environ.get("PAGES_BASE_URL", "").strip()  # optional

TZ = ZoneInfo("Asia/Muscat")

# =========================
# Sheets (تأكد الأسماء مطابقة للإكسل)
# =========================
DEPARTMENTS = [
    ("Officers", "Officers"),
    ("Supervisors", "Supervisors"),
    ("Load Control", "Load Control"),
    ("Export Checker", "Export Checker"),
    ("Export Operators", "Export Operators"),
]

# order: 0=SUN .. 6=SAT
DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

SHIFT_MAP = {
    "MN06": ("🌅 صباح (MN06)", "صباح"),
    "ME07": ("🌅 صباح (ME07)", "صباح"),
    "ME06": ("🌅 صباح (ME06)", "صباح"),
    "MN08": ("🌅 صباح (MN08)", "صباح"),
    "MN12": ("🌆 ظهر (MN12)", "ظهر"),
    "AN13": ("🌆 ظهر (AN13)", "ظهر"),
    "AE14": ("🌆 ظهر (AE14)", "ظهر"),
    "NN21": ("🌙 ليل (NN21)", "ليل"),
    "NE22": ("🌙 ليل (NE22)", "ليل"),
}

GROUP_ORDER = ["صباح", "ظهر", "ليل", "مناوبات", "راحة", "إجازات", "تدريب", "أخرى"]


# =========================
# Helpers
# =========================
def clean(v) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).replace("\u00A0", " ")).strip()


def to_western_digits(s: str) -> str:
    if not s:
        return s
    arabic = {"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"}
    farsi = {"۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"}
    mp = {**arabic, **farsi}
    return "".join(mp.get(ch, ch) for ch in str(s))


def norm(s: str) -> str:
    return clean(to_western_digits(s))


def looks_like_time(s: str) -> bool:
    up = norm(s).upper()
    return bool(
        re.match(r"^\d{3,4}\s*H?\s*-\s*\d{3,4}\s*H?$", up)
        or re.match(r"^\d{3,4}\s*H$", up)
        or re.match(r"^\d{3,4}$", up)
    )


def looks_like_employee_name(s: str) -> bool:
    v = norm(s)
    if not v:
        return False
    up = v.upper()
    if looks_like_time(up):
        return False
    if re.search(r"(ANNUAL\s*LEAVE|SICK\s*LEAVE|REST\/OFF\s*DAY|REST|OFF\s*DAY|TRAINING|STANDBY)", up):
        return False
    if re.search(r"-\s*\d{3,}", v) and re.search(r"[A-Za-z\u0600-\u06FF]", v):
        return True
    parts = [p for p in v.split(" ") if p]
    return bool(re.search(r"[A-Za-z\u0600-\u06FF]", v) and len(parts) >= 2)


def looks_like_shift_code(s: str) -> bool:
    v = norm(s).upper()
    if not v:
        return False
    if looks_like_time(v):
        return False
    if v in ["OFF", "O", "LV", "TR", "ST", "SL", "AL"]:
        return True
    if re.match(r"^(MN|AN|NN|NT|ME|AE|NE)\d{1,2}", v):
        return True
    if re.search(r"(ANNUAL\s*LEAVE|SICK\s*LEAVE|REST\/OFF\s*DAY|REST|OFF\s*DAY|TRAINING|STANDBY)", v):
        return True
    return False


def map_shift(code: str):
    c0 = norm(code)
    c = c0.upper()
    if not c or c == "0":
        return ("-", "أخرى")

    if c == "AL" or "ANNUAL LEAVE" in c:
        return ("🏖️ إجازة سنوية", "إجازات")
    if c == "SL" or "SICK LEAVE" in c:
        return ("🤒 إجازة مرضية", "إجازات")
    if c == "LV":
        return ("🏖️ إجازة", "إجازات")
    if c == "TR" or "TRAINING" in c:
        return ("📚 دورة/تدريب", "تدريب")
    if c == "ST" or "STANDBY" in c:
        return ("🧍 Standby", "مناوبات")
    if c in ["OFF", "O"] or re.search(r"(REST|OFF\s*DAY|REST\/OFF)", c):
        return ("🛌 راحة/أوف", "راحة")

    if c in SHIFT_MAP:
        return SHIFT_MAP[c]

    return (c0, "أخرى")


def current_shift_key(now: datetime) -> str:
    t = now.hour * 60 + now.minute
    if t >= 21 * 60 or t < 5 * 60:
        return "ليل"
    if t >= 14 * 60:
        return "ظهر"
    return "صباح"


def download_excel(url: str) -> bytes:
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.content


def _as_int(v):
    try:
        if v is None:
            return None
        s = norm(v)
        if s == "":
            return None
        return int(float(s))
    except Exception:
        return None


def _day_token(v: str) -> str:
    """
    يطبع رمز اليوم SUN/MON/... حتى لو كانت الخلايا عمودية/مخلوطة
    """
    s = norm(v).upper()
    s = re.sub(r"[^A-Z]", "", s)  # keep only letters
    for d in DAYS:
        if d in s:
            return d
    return ""


def find_header_row(ws):
    """
    Finds row containing Employee/Name anywhere in the row (not only column A)
    """
    KEYWORDS = ["EMPLOYEE", "STAFF", "NAME", "الموظف", "موظف", "الموظفين"]
    max_r = min(ws.max_row, 80)
    max_c = min(ws.max_column, 40)

    for r in range(1, max_r + 1):
        cells = []
        for c in range(1, max_c + 1):
            v = norm(ws.cell(row=r, column=c).value)
            if v:
                cells.append(v)
        joined = " | ".join(cells).upper()
        if any(k in joined for k in KEYWORDS):
            return r
    return None


def find_employee_col(ws, start_row: int, max_scan_rows: int = 220):
    """
    Scores columns by how many cells look like employee names.
    """
    scores = {}
    r_end = min(ws.max_row, start_row + max_scan_rows)
    for r in range(start_row, r_end + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(row=r, column=c).value
            if looks_like_employee_name(v):
                scores[c] = scores.get(c, 0) + 1
    if not scores:
        return None
    return max(scores.items(), key=lambda kv: kv[1])[0]


# ========= أهم تعديل هنا =========
def find_days_row(ws, scan_down: int = 250):
    """
    Finds the BEST days row (SUN..SAT) by scoring:
    - distinct day hits in the row (>=3)
    - numeric day-of-month hits (1..31) in the row BELOW it
    This avoids picking wrong repeated headers / other tables.
    """
    max_r = min(ws.max_row, scan_down)
    max_c = ws.max_column

    best = None  # (score, row_idx, vals)

    for r in range(1, max_r + 1):
        vals = []
        day_hits = set()

        for c in range(1, max_c + 1):
            v = ws.cell(row=r, column=c).value
            nv = norm(v)
            vals.append(nv)
            tok = _day_token(nv)
            if tok:
                day_hits.add(tok)

        if len(day_hits) < 3:
            continue

        r2 = r + 1
        if r2 > ws.max_row:
            continue

        num_hits = 0
        for c in range(1, max_c + 1):
            v2 = ws.cell(row=r2, column=c).value
            iv = _as_int(v2)
            if iv is not None and 1 <= iv <= 31:
                num_hits += 1

        score = (len(day_hits) * 10) + num_hits
        if best is None or score > best[0]:
            best = (score, r, vals)

    if best:
        return best[1], best[2]
    return None, None


# ========= أهم تعديل هنا =========
def find_day_col(ws, today_dow: int, today_dom: int):
    """
    Determine today's column using:
    - best days row (SUN..SAT)
    - row below has day-of-month numbers
    Strategy:
      1) Find columns where date==today_dom
      2) Prefer the one whose day token matches today's DOW
      3) Otherwise fallback to the first date match
    """
    days_row_idx, days_row_vals = find_days_row(ws, scan_down=250)
    if not days_row_idx:
        return None

    date_row_idx = days_row_idx + 1
    if date_row_idx > ws.max_row:
        return None

    token = DAYS[today_dow]

    date_match_cols = []
    for c in range(1, ws.max_column + 1):
        iv = _as_int(ws.cell(row=date_row_idx, column=c).value)
        if iv == today_dom:
            date_match_cols.append(c)

    if not date_match_cols:
        return None

    for c in date_match_cols:
        if c <= len(days_row_vals) and _day_token(days_row_vals[c - 1]) == token:
            return c

    return date_match_cols[0]


# =========================
# HTML builders
# =========================
def build_group_table(title: str, rows):
    trs = []
    for x in rows:
        trs.append(
            f"""
          <tr>
            <td style="text-align:right;padding:9px 10px;border-bottom:1px solid #eee;">{x["name"]}</td>
            <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #eee;white-space:nowrap;">{x["shift"]}</td>
          </tr>
        """
        )
    body = "\n".join(trs) if trs else '<tr><td colspan="2" style="padding:10px;text-align:center;">—</td></tr>'

    return f"""
      <div style="margin:12px 0;">
        <div style="display:inline-block;margin:0 auto 8px auto;padding:6px 12px;border-radius:999px;background:#eef2ff;color:#1e3a8a;font-weight:800;">
          {title} ({len(rows)})
        </div>

        <table border="0" cellspacing="0" cellpadding="0"
               style="width:92%;margin:10px auto 0 auto;border:1px solid #e6e6e6;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0;background:#fff;">
          <thead>
            <tr style="background:#f6f7f9;font-weight:800;">
              <th style="text-align:right;padding:10px;">الموظف</th>
              <th style="text-align:center;padding:10px;">الحالة / الشفت</th>
            </tr>
          </thead>
          <tbody>
            {body}
          </tbody>
        </table>
      </div>
    """


def build_dept_section(dept_name: str, buckets):
    section = f"""
      <div style="text-align:center;font-size:22px;font-weight:800;margin:6px 0 12px 0;">
        {dept_name}
      </div>
    """
    total = 0
    has_any = False
    for g in GROUP_ORDER:
        arr = buckets.get(g, [])
        if not arr:
            continue
        has_any = True
        total += len(arr)
        section += build_group_table(g, arr)

    if not has_any:
        section += """
          <div style="text-align:center;color:#b00020;font-weight:800;margin:10px 0;">
            ⚠️ لا توجد مناوبات اليوم لهذا القسم
          </div>
        """
    return section, total


def page_shell(title: str, body_html: str, now: datetime, extra_top_html: str = ""):
    greg = now.strftime("%d %B %Y")
    t = now.strftime("%H:%M")
    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body{{margin:0;background:#eef1f7;font-family:Arial,system-ui,sans-serif;color:#0f172a;}}
    .wrap{{max-width:980px;margin:0 auto;padding:16px 12px 30px;}}
    .header{{background:linear-gradient(135deg,#1e40af 0%,#1976d2 50%,#0ea5e9 100%);color:#fff;padding:22px 16px;border-radius:18px;text-align:center;}}
    .date{{margin-top:8px;display:inline-block;background:rgba(255,255,255,.18);padding:6px 14px;border-radius:999px;font-weight:700;font-size:13px;}}
    .nav{{margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}}
    .nav a{{background:#fff;color:#1e40af;text-decoration:none;font-weight:800;padding:10px 14px;border-radius:14px;border:1px solid rgba(15,23,42,.1);}}
    .card{{margin-top:16px;background:#fff;border-radius:18px;border:1px solid rgba(15,23,42,.07);box-shadow:0 4px 18px rgba(15,23,42,.08);padding:14px;}}
    .footer{{margin-top:18px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.9;}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div style="font-size:22px;font-weight:900;">📋 جدول المناوبين</div>
      <div class="date">📅 {greg} — ⏱️ {t} (مسقط)</div>
      {extra_top_html}
      <div class="nav">
        <a href="./">الصفحة الرئيسية</a>
        <a href="./now/">المناوب الآن</a>
      </div>
    </div>

    <div class="card">
      {body_html}
    </div>

    <div class="footer">
      تم التحديث تلقائيًا بواسطة GitHub Actions
    </div>
  </div>
</body>
</html>
"""


def send_email(subject: str, html: str):
    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = subject
    msg["From"] = MAIL_FROM
    msg["To"] = MAIL_TO

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(MAIL_FROM, [x.strip() for x in MAIL_TO.split(",") if x.strip()], msg.as_string())


def infer_pages_base_url():
    return "https://khalidsaif912.github.io/roster-site"


def main():
    if not EXCEL_URL:
        raise RuntimeError("EXCEL_URL missing")

    now = datetime.now(TZ)

    # Python weekday(): Mon=0..Sun=6 -> convert to Sun=0..Sat=6
    dow = now.weekday()
    today_dow = (dow + 1) % 7
    today_dom = now.day  # 1..31

    active_group = current_shift_key(now)
    pages_base = PAGES_BASE_URL or infer_pages_base_url()

    data = download_excel(EXCEL_URL)
    wb = load_workbook(BytesIO(data), data_only=True)

    all_sections_html = ""
    now_sections_html = ""
    total_all = 0
    total_now = 0

    for sheet_name, dept_name in DEPARTMENTS:
        if sheet_name not in wb.sheetnames:
            all_sections_html += f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ الشيت غير موجود: {dept_name}</div>"
            all_sections_html += "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
            continue

        ws = wb[sheet_name]

        header_row_idx = find_header_row(ws)
        if not header_row_idx:
            all_sections_html += f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ لم أستطع تحديد صف (Employee/Name) في شيت {dept_name}</div>"
            all_sections_html += "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
            continue

        day_col = find_day_col(ws, today_dow, today_dom)
        if not day_col:
            all_sections_html += f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ لم أستطع تحديد عمود اليوم في شيت {dept_name}</div>"
            all_sections_html += "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
            continue

        emp_col = find_employee_col(ws, header_row_idx + 1)
        if not emp_col:
            all_sections_html += f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ لم أستطع تحديد عمود الموظفين في شيت {dept_name}</div>"
            all_sections_html += "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
            continue

        buckets = {k: [] for k in GROUP_ORDER}
        buckets_now = {k: [] for k in GROUP_ORDER}

        for r in range(header_row_idx + 1, ws.max_row + 1):
            name = norm(ws.cell(row=r, column=emp_col).value)
            if not looks_like_employee_name(name):
                continue

            raw = norm(ws.cell(row=r, column=day_col).value)
            if not looks_like_shift_code(raw):
                continue

            label, grp = map_shift(raw)
            buckets.setdefault(grp, []).append({"name": name, "shift": label})

            if grp == active_group:
                buckets_now.setdefault(grp, []).append({"name": name, "shift": label})

        dept_section, dept_count = build_dept_section(dept_name, buckets)
        all_sections_html += dept_section + "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
        total_all += dept_count

        dept_section_now, dept_count_now = build_dept_section(dept_name, buckets_now)
        if dept_count_now == 0:
            dept_section_now = f"""
              <div style="text-align:center;font-size:22px;font-weight:800;margin:6px 0 12px 0;">{dept_name}</div>
              <div style="text-align:center;color:#94a3b8;font-weight:800;margin:10px 0;">
                لا يوجد مناوبين الآن لهذا القسم
              </div>
            """
        now_sections_html += dept_section_now + "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
        total_now += dept_count_now

    os.makedirs("docs", exist_ok=True)
    os.makedirs("docs/now", exist_ok=True)

    full_page = page_shell(
        "Duty Roster - Full",
        all_sections_html or "<div style='text-align:center;color:#94a3b8;font-weight:800;'>لا توجد بيانات</div>",
        now,
        extra_top_html=f"<div style='margin-top:10px;font-weight:900;'>الإجمالي: {total_all}</div>",
    )

    now_page = page_shell(
        f"Duty Roster - Now ({active_group})",
        now_sections_html or "<div style='text-align:center;color:#94a3b8;font-weight:800;'>لا يوجد مناوبين الآن</div>",
        now,
        extra_top_html=f"<div style='margin-top:10px;font-weight:900;'>المناوب الآن: {active_group} — العدد: {total_now}</div>",
    )

    with open("docs/index.html", "w", encoding="utf-8") as f:
        f.write(full_page)

    with open("docs/now/index.html", "w", encoding="utf-8") as f:
        f.write(now_page)

    subject = f"Duty Roster — {active_group} — {now.strftime('%Y-%m-%d')}"
    email_html = f"""
    <div style="font-family:Arial;direction:rtl;background:#eef1f7;padding:16px">
      <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid #e6e6e6">
        <h2 style="margin:0 0 10px 0;">📋 المناوب الآن ({active_group})</h2>
        <div style="color:#64748b;margin-bottom:12px;">تم الإرسال: {now.strftime('%H:%M')} (مسقط)</div>
        <div>{now_sections_html}</div>
        <div style="text-align:center;margin-top:14px;">
          <a href="{pages_base}/" style="display:inline-block;padding:12px 22px;border-radius:14px;background:#1e40af;color:#fff;text-decoration:none;font-weight:900;">
            فتح الصفحة الكاملة
          </a>
        </div>
      </div>
    </div>
    """
    send_email(subject, email_html)


if __name__ == "__main__":
    main()