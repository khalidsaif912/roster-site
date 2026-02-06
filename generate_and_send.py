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

# Sheets
DEPARTMENTS = [
    ("Officers", "Officers"),
    ("Supervisors", "Supervisors"),
    ("Load Control", "Load Control"),
    ("Export Checker", "Export Checker"),
    ("Export Operators", "Export Operators"),
]

DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

SHIFT_MAP = {
    "MN06": ("🌅 صباح (MN06)", "صباح"),
    "ME06": ("🌅 صباح (ME06)", "صباح"),
    "ME07": ("🌅 صباح (ME07)", "صباح"),
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
    arabic = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'}
    farsi  = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'}
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
    # قوي: اسم - رقم
    if re.search(r"-\s*\d{3,}", v) and re.search(r"[A-Za-z\u0600-\u06FF]", v):
        return True
    # بديل: كلمتين أو أكثر
    parts = [p for p in v.split(" ") if p]
    return bool(re.search(r"[A-Za-z\u0600-\u06FF]", v) and len(parts) >= 2)

def looks_like_shift_code(s: str) -> bool:
    v = norm(s).upper()
    if not v:
        return False
    if looks_like_time(v):
        return False
    if v in ["OFF", "O", "LV", "TR", "ST", "SL", "AL", "STM", "STN"]:
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
    if c in ["TR"] or "TRAINING" in c:
        return ("📚 دورة/تدريب", "تدريب")
    if c in ["ST", "STM", "STN"] or "STANDBY" in c:
        return ("🧍 Standby", "مناوبات")
    if c in ["OFF", "O"] or re.search(r"(REST|OFF\s*DAY|REST\/OFF)", c):
        return ("🛌 راحة/أوف", "راحة")

    if c in SHIFT_MAP:
        return SHIFT_MAP[c]

    return (c0, "أخرى")

def current_shift_key(now: datetime) -> str:
    # نفس منطق الشفت: 21:00–04:59 ليل، 14:00–20:59 ظهر، غير كذا صباح :contentReference[oaicite:1]{index=1}
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


# =========================
# Excel header detection (المطلوب الجديد)
# =========================
def find_day_header_row(ws):
    """
    يبحث عن صف فيه أيام الأسبوع SUN..SAT (غالبًا صف فوق التواريخ 1..31)
    """
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        vals = [norm(x).upper() for x in row]
        hits = sum(1 for d in DAYS if any(d in v for v in vals if v))
        if hits >= 4:  # كفاية للتأكيد إنه صف الأيام
            return i
    return None

def find_date_row(ws, day_header_row_idx: int):
    """
    عادة صف التواريخ يكون تحت صف الأيام مباشرة.
    """
    if not day_header_row_idx:
        return None
    nxt = day_header_row_idx + 1
    if nxt <= ws.max_row:
        return nxt
    return None

def find_day_col_by_date_number(ws, date_row_idx: int, today_day_num: int):
    """
    يحدد العمود الصحيح بناءً على رقم التاريخ (1..31) الموجود في صف التواريخ
    """
    if not date_row_idx:
        return None

    for c in range(1, ws.max_column + 1):
        v = norm(ws.cell(row=date_row_idx, column=c).value)
        if not v:
            continue
        # حاول كرقم
        try:
            n = int(float(v))
            if n == today_day_num:
                return c
        except Exception:
            pass
    return None

def find_employee_header_row(ws):
    """
    نبحث عن صف رأس فيه EMPLOYEE/STAFF/NAME/الموظف
    """
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        first = norm(row[0] if row else "")
        up = first.upper()
        if "EMPLOYEE" in up or "STAFF" in up or "NAME" in up or "الموظف" in first:
            return i
    return None

def find_employee_col(ws, start_row: int, max_scan_rows: int = 140):
    """
    يحسب نقاط لكل عمود: كم خلية تشبه اسم موظف.
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


# =========================
# UI (Design like index(40).html)
# =========================
THEME_CSS = """
:root{
  --primary:#6366f1;
  --primary-dark:#4f46e5;
  --secondary:#ec4899;
  --success:#10b981;
  --warn:#fde68a;
  --bg:#0f172a;
  --bg-light:#1e293b;
  --border:#334155;
  --text:#f1f5f9;
  --text-muted:#cbd5e1;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0;padding:0}
body{
  font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#172554 100%);
  color:var(--text);
}
a{color:inherit}
.container{max-width:1100px;margin:0 auto;padding:16px 14px 26px}
.header{
  background:rgba(15,23,42,.78);
  backdrop-filter: blur(18px);
  border:1px solid rgba(148,163,184,.12);
  border-radius:18px;
  padding:14px 16px;
  box-shadow:0 10px 30px rgba(0,0,0,.25);
}
.header-top{
  display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;
}
.title{
  display:flex;gap:10px;align-items:center;
}
.badge{
  display:inline-flex;align-items:center;gap:8px;
  padding:8px 12px;border-radius:999px;
  background:rgba(99,102,241,.16);
  border:1px solid rgba(99,102,241,.25);
  font-weight:800;
}
.sub{
  margin-top:8px;
  color:var(--text-muted);
  font-size:13px;
}
.nav{
  display:flex;gap:10px;flex-wrap:wrap;
}
.nav a{
  text-decoration:none;
  padding:10px 12px;
  border-radius:14px;
  background:rgba(30,41,59,.6);
  border:1px solid rgba(148,163,184,.12);
  font-weight:800;
}
.nav a:hover{border-color:rgba(99,102,241,.35)}
.grid{
  margin-top:16px;
  display:grid;
  grid-template-columns:1fr;
  gap:14px;
}
.card{
  background:rgba(15,23,42,.72);
  backdrop-filter: blur(16px);
  border:1px solid rgba(148,163,184,.12);
  border-radius:18px;
  overflow:hidden;
  box-shadow:0 8px 24px rgba(0,0,0,.22);
}
.cardBar{height:6px;background:linear-gradient(90deg,var(--primary),rgba(99,102,241,.35))}
.cardHead{
  padding:14px 14px 10px;
  display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
}
.cardHead h2{
  margin:0;font-size:18px;font-weight:900;letter-spacing:-.2px;
}
.countPill{
  padding:8px 12px;border-radius:999px;
  background:rgba(16,185,129,.15);
  border:1px solid rgba(16,185,129,.25);
  font-weight:900;
}
.groupWrap{padding:0 14px 14px}
.groupTitle{
  display:inline-block;
  margin:10px 0 8px;
  padding:6px 12px;
  border-radius:999px;
  background:rgba(253,230,138,.12);
  border:1px solid rgba(253,230,138,.18);
  color:var(--warn);
  font-weight:900;
}
.table{
  width:100%;
  border-collapse:separate;
  border-spacing:0;
  overflow:hidden;
  border-radius:14px;
  border:1px solid rgba(148,163,184,.14);
  background:rgba(30,41,59,.35);
}
.table th{
  text-align:right;
  padding:10px 12px;
  background:rgba(30,41,59,.55);
  color:var(--text);
  font-size:13px;
}
.table td{
  padding:10px 12px;
  border-top:1px solid rgba(148,163,184,.12);
  color:var(--text);
  font-weight:700;
}
.table td:last-child{text-align:center;white-space:nowrap;font-weight:800;color:rgba(241,245,249,.92)}
.muted{
  color:var(--text-muted);
  font-weight:800;
  text-align:center;
  padding:18px 12px;
}
.footer{
  margin-top:14px;
  text-align:center;
  color:rgba(203,213,225,.8);
  font-size:12px;
}
@media (min-width:900px){
  .grid{grid-template-columns:1fr}
}
"""

def group_table_html(title: str, rows):
    if not rows:
        return ""
    trs = []
    for x in rows:
        trs.append(
            f"<tr>"
            f"<td>{x['name']}</td>"
            f"<td>{x['shift']}</td>"
            f"</tr>"
        )
    body = "\n".join(trs)
    return f"""
      <div class="groupTitle">{title} ({len(rows)})</div>
      <table class="table" dir="rtl">
        <thead>
          <tr>
            <th>الموظف</th>
            <th>الحالة / الشفت</th>
          </tr>
        </thead>
        <tbody>
          {body}
        </tbody>
      </table>
    """

def dept_card_html(dept_name: str, buckets) -> tuple[str, int]:
    total = 0
    groups_html = ""
    for g in GROUP_ORDER:
        arr = buckets.get(g, [])
        if not arr:
            continue
        total += len(arr)
        groups_html += group_table_html(g, arr)

    if total == 0:
        groups_html = '<div class="muted">لا توجد بيانات اليوم لهذا القسم</div>'

    html = f"""
    <div class="card">
      <div class="cardBar"></div>
      <div class="cardHead">
        <h2>{dept_name}</h2>
        <div class="countPill">الإجمالي: {total}</div>
      </div>
      <div class="groupWrap">
        {groups_html}
      </div>
    </div>
    """
    return html, total

def page_shell(title: str, now: datetime, active_group: str, total: int, content_html: str):
    date_txt = now.strftime("%Y-%m-%d")
    time_txt = now.strftime("%H:%M")
    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>{THEME_CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div class="title">
          <div class="badge">📋 جدول المناوبين</div>
          <div class="badge" style="background:rgba(236,72,153,.14);border-color:rgba(236,72,153,.25);">
            الشفت الحالي: {active_group}
          </div>
          <div class="badge" style="background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.22);">
            العدد: {total}
          </div>
        </div>
        <div class="nav">
          <a href="./">الصفحة الرئيسية</a>
          <a href="./now/">المناوب الآن</a>
        </div>
      </div>
      <div class="sub">تم التحديث: {date_txt} {time_txt} (مسقط)</div>
    </div>

    <div class="grid">
      {content_html}
    </div>

    <div class="footer">تم التحديث تلقائيًا بواسطة GitHub Actions</div>
  </div>
</body>
</html>
"""


# =========================
# Email
# =========================
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


# =========================
# Main
# =========================
def main():
    if not EXCEL_URL:
        raise RuntimeError("EXCEL_URL missing")

    now = datetime.now(TZ)
    today_day_num = now.day  # 1..31
    active_group = current_shift_key(now)  # صباح/ظهر/ليل
    pages_base = PAGES_BASE_URL or infer_pages_base_url()

    # Load Excel
    data = download_excel(EXCEL_URL)
    wb = load_workbook(BytesIO(data), data_only=True)

    # Build pages
    os.makedirs("docs", exist_ok=True)
    os.makedirs("docs/now", exist_ok=True)

    all_cards = ""
    now_cards = ""
    total_all = 0
    total_now = 0

    for sheet_name, dept_name in DEPARTMENTS:
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]

        # ✅ 1) تحديد صف الأيام + صف التواريخ + العمود حسب رقم تاريخ اليوم (1..31)
        day_header_row = find_day_header_row(ws)
        date_row = find_date_row(ws, day_header_row)
        day_col = find_day_col_by_date_number(ws, date_row, today_day_num)

        # fallback: إذا فشل رقم التاريخ، جرّب صف اسم الموظف + weekday (حل احتياطي)
        emp_header_row = find_employee_header_row(ws) or 1

        if not day_col:
            # احتياطي: لو لقي صف الأيام نحاول نطابق اليوم بالأسبوع داخل نفس صف الأيام
            # (بس رقم التاريخ هو الأساس حسب طلبك)
            dow = now.weekday()          # Mon=0..Sun=6
            today_dow = (dow + 1) % 7    # Sun=0
            for c in range(1, ws.max_column + 1):
                v = norm(ws.cell(row=day_header_row or emp_header_row, column=c).value).upper()
                if DAYS[today_dow] in v:
                    day_col = c
                    break

        if not day_col:
            buckets = {}
            card, cnt = dept_card_html(dept_name, buckets)
            all_cards += card
            now_cards += card
            continue

        # ✅ 2) تحديد عمود الموظفين (يفضل يبدأ بعد رأس الموظف)
        start_row_for_emp_scan = (emp_header_row + 1) if emp_header_row else 2
        emp_col = find_employee_col(ws, start_row_for_emp_scan)
        if not emp_col:
            buckets = {}
            card, cnt = dept_card_html(dept_name, buckets)
            all_cards += card
            now_cards += card
            continue

        # ✅ 3) قراءة البيانات
        buckets = {k: [] for k in GROUP_ORDER}
        buckets_now = {k: [] for k in GROUP_ORDER}

        # نبدأ القراءة من تحت رأس الموظف (إذا موجود) وإلا من 1
        data_start_row = (emp_header_row + 1) if emp_header_row else 1

        for r in range(data_start_row, ws.max_row + 1):
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

        # ✅ 4) HTML cards
        card_all, cnt_all = dept_card_html(dept_name, buckets)
        all_cards += card_all
        total_all += cnt_all

        card_now, cnt_now = dept_card_html(dept_name, buckets_now)
        now_cards += card_now
        total_now += cnt_now

    if not all_cards:
        all_cards = '<div class="card"><div class="muted">لا توجد بيانات</div></div>'
    if not now_cards:
        now_cards = '<div class="card"><div class="muted">لا يوجد مناوبين الآن</div></div>'

    full_page = page_shell("Roster - Full", now, active_group, total_all, all_cards)
    now_page = page_shell(f"Roster - Now ({active_group})", now, active_group, total_now, now_cards)

    with open("docs/index.html", "w", encoding="utf-8") as f:
        f.write(full_page)

    with open("docs/now/index.html", "w", encoding="utf-8") as f:
        f.write(now_page)

    # Email (مختصر + زر للصفحة)
    subject = f"Roster — {active_group} — {now.strftime('%Y-%m-%d')}"
    email_html = f"""
    <div style="font-family:Segoe UI,Arial;direction:rtl;background:#0f172a;padding:16px">
      <div style="max-width:820px;margin:0 auto;border-radius:18px;overflow:hidden;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.85)">
        <div style="padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.12);color:#f1f5f9;font-weight:900">
          📋 المناوب الآن — {active_group} — {now.strftime('%H:%M')} (مسقط)
        </div>
        <div style="padding:14px 16px">
          {now_cards}
          <div style="text-align:center;margin-top:16px;">
            <a href="{pages_base}/" style="display:inline-block;padding:12px 20px;border-radius:14px;background:#6366f1;color:#fff;text-decoration:none;font-weight:900;">
              فتح الصفحة الكاملة
            </a>
          </div>
        </div>
      </div>
    </div>
    """
    send_email(subject, email_html)


if __name__ == "__main__":
    main()