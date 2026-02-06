import os
import re
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo

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

# Excel sheets
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


# =========================
# Detect rows/cols (Days row + Date numbers row)
# =========================
def _row_values(ws, r: int):
    return [norm(ws.cell(row=r, column=c).value) for c in range(1, ws.max_column + 1)]

def _count_day_tokens(vals) -> int:
    ups = [v.upper() for v in vals if v]
    count = 0
    for d in DAYS:
        if any(d in x for x in ups):
            count += 1
    return count

def _is_date_number(v: str) -> bool:
    v = norm(v)
    if not v:
        return False
    # يقبل "1" أو "01" أو "1.0"
    if re.match(r"^\d{1,2}(\.0)?$", v):
        n = int(float(v))
        return 1 <= n <= 31
    return False

def find_days_and_dates_rows(ws, scan_rows: int = 60):
    """
    نبحث عن صف فيه أيام (SUN..SAT) بكثرة
    ثم الصف اللي بعده يكون فيه أرقام تاريخ (1..31)
    """
    max_r = min(ws.max_row, scan_rows)
    days_row = None

    for r in range(1, max_r + 1):
        vals = _row_values(ws, r)
        if _count_day_tokens(vals) >= 3:  # يكفي وجود 3 أيام أو أكثر
            days_row = r
            break

    if not days_row:
        return None, None

    # ابحث عن صف التواريخ بعده (غالبًا +1)
    date_row = None
    for r in range(days_row + 1, min(days_row + 4, ws.max_row) + 1):
        vals = _row_values(ws, r)
        nums = sum(1 for v in vals if _is_date_number(v))
        if nums >= 5:  # صف فيه أرقام كثيرة
            date_row = r
            break

    return days_row, date_row

def find_day_col(ws, days_row: int, date_row: int, today_dow: int, today_day: int):
    """
    يثبت العمود الصحيح باستخدام:
    - فوق: اسم اليوم (SUN..SAT)
    - تحت: رقم التاريخ (1..31)
    """
    if not days_row or not date_row:
        return None

    day_key = DAYS[today_dow]

    best_col = None
    for c in range(1, ws.max_column + 1):
        top = norm(ws.cell(row=days_row, column=c).value).upper()
        bot = norm(ws.cell(row=date_row, column=c).value)

        if day_key in top and _is_date_number(bot):
            n = int(float(bot))
            if n == today_day:
                best_col = c
                break

    # fallback: لو ما لقى (يوم+تاريخ) مع بعض، جرّب التاريخ فقط
    if not best_col:
        for c in range(1, ws.max_column + 1):
            bot = norm(ws.cell(row=date_row, column=c).value)
            if _is_date_number(bot) and int(float(bot)) == today_day:
                best_col = c
                break

    return best_col

def find_employee_col(ws, start_row: int, max_scan_rows: int = 160):
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
# UI (Theme قريب جدًا من index(40).html)
# =========================
THEME_CSS = r"""
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
header{
  background:rgba(15,23,42,.78);
  backdrop-filter:blur(20px);
  border-bottom:1px solid rgba(148,163,184,.12);
  padding:10px 16px;
  position:sticky;
  top:0;
  z-index:10;
}
.header-inner{
  max-width:1100px;
  margin:0 auto;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.brand{
  display:flex;
  align-items:center;
  gap:10px;
}
.brand .logo{
  width:38px;height:38px;border-radius:12px;
  background:linear-gradient(135deg,var(--primary),#7c3aed);
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 10px 26px rgba(99,102,241,.25);
  font-weight:900;
}
.brand .title{
  line-height:1.1;
}
.brand .title .h{
  font-weight:900;
  font-size:16px;
}
.brand .title .sub{
  font-size:12px;
  color:var(--text-muted);
  margin-top:2px;
}

.nav{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
.btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:10px 14px;
  border-radius:12px;
  border:1px solid rgba(148,163,184,.22);
  background:rgba(255,255,255,.06);
  color:var(--text);
  text-decoration:none;
  font-weight:800;
}
.btn.primary{
  background:linear-gradient(135deg,var(--primary),#7c3aed);
  border-color:rgba(99,102,241,.55);
}
.btn:hover{transform:translateY(-1px)}
main{
  max-width:1100px;
  margin:0 auto;
  padding:18px 14px 30px;
}
.panel{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(148,163,184,.18);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.25);
  backdrop-filter:blur(10px);
  padding:14px;
}
.meta{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:12px;
}
.chip{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(148,163,184,.16);
  padding:8px 12px;
  border-radius:999px;
  font-size:12px;
  color:var(--text-muted);
}
.deptCard{
  background:rgba(255,255,255,.05);
  border:1px solid rgba(148,163,184,.18);
  border-radius:16px;
  overflow:hidden;
  margin-top:12px;
}
.deptBar{height:5px}
.deptHead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:12px 14px;
}
.deptName{
  font-size:16px;
  font-weight:900;
}
.deptCount{
  min-width:54px;
  text-align:center;
  padding:6px 10px;
  border-radius:12px;
  background:rgba(99,102,241,.10);
  border:1px solid rgba(99,102,241,.22);
  color:#c7d2fe;
}
.groupTitle{
  padding:8px 14px;
  font-weight:900;
  color:#e2e8f0;
  border-top:1px solid rgba(148,163,184,.12);
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.table{
  width:100%;
  border-collapse:collapse;
}
.table th,.table td{
  padding:10px 12px;
  border-top:1px solid rgba(148,163,184,.12);
  font-size:13px;
}
.table th{
  text-align:right;
  color:var(--text-muted);
  background:rgba(15,23,42,.22);
}
.table td:last-child{text-align:center;white-space:nowrap}
.empty{
  padding:14px;
  text-align:center;
  color:var(--text-muted);
  border-top:1px solid rgba(148,163,184,.12);
}
.footer{
  margin-top:14px;
  text-align:center;
  color:rgba(203,213,225,.75);
  font-size:12px;
}
hr.sep{
  border:none;
  border-top:1px solid rgba(148,163,184,.12);
  margin:12px 0;
}
@media(max-width:520px){
  .brand .title .h{font-size:14px}
  .btn{padding:9px 12px}
}
"""

def _dept_color(i: int) -> str:
    palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#dc2626", "#ea580c"]
    return palette[i % len(palette)]

def build_group_table(group_name: str, rows):
    if not rows:
        return ""

    trs = []
    for x in rows:
        trs.append(
            f"<tr>"
            f"<td style='text-align:right'>{x['name']}</td>"
            f"<td>{x['shift']}</td>"
            f"</tr>"
        )

    return f"""
      <div class="groupTitle">
        <span>{group_name}</span>
        <span style="color:rgba(203,213,225,.85);font-weight:800">{len(rows)}</span>
      </div>
      <table class="table" dir="rtl">
        <thead>
          <tr>
            <th>الموظف</th>
            <th style="text-align:center">الحالة / الشفت</th>
          </tr>
        </thead>
        <tbody>
          {''.join(trs)}
        </tbody>
      </table>
    """

def build_dept_card(dept_name: str, buckets, color: str):
    total = sum(len(buckets.get(g, [])) for g in GROUP_ORDER)
    parts = []
    for g in GROUP_ORDER:
        arr = buckets.get(g, [])
        if arr:
            parts.append(build_group_table(g, arr))

    if not parts:
        parts_html = "<div class='empty'>لا توجد مناوبات اليوم لهذا القسم</div>"
    else:
        parts_html = "".join(parts)

    return f"""
    <div class="deptCard">
      <div class="deptBar" style="background:linear-gradient(90deg,{color},{color}aa)"></div>
      <div class="deptHead">
        <div class="deptName">{dept_name}</div>
        <div class="deptCount">{total}</div>
      </div>
      {parts_html}
    </div>
    """

def page_html(title: str, subtitle: str, now: datetime, chips: list[str], content_html: str):
    chips_html = "".join([f"<div class='chip'>{c}</div>" for c in chips])

    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>{THEME_CSS}</style>
</head>
<body>

<header>
  <div class="header-inner">
    <div class="brand">
      <div class="logo">📋</div>
      <div class="title">
        <div class="h">{title}</div>
        <div class="sub">{subtitle}</div>
      </div>
    </div>

    <div class="nav">
      <a class="btn" href="./">🏠 الصفحة الرئيسية</a>
      <a class="btn primary" href="./now/">⏱️ المناوب الآن</a>
    </div>
  </div>
</header>

<main>
  <div class="panel">
    <div class="meta">{chips_html}</div>
    {content_html}
    <div class="footer">تم التحديث تلقائيًا بواسطة GitHub Actions</div>
  </div>
</main>

</body>
</html>
"""


# =========================
# Email
# =========================
def send_email(subject: str, html: str):
    if not (SMTP_HOST and SMTP_USER and SMTP_PASS and MAIL_FROM and MAIL_TO):
        return  # إذا ما تبي إيميل/أو ناسي secrets لا يطيح السكربت

    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = subject
    msg["From"] = MAIL_FROM
    msg["To"] = MAIL_TO

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(MAIL_FROM, [x.strip() for x in MAIL_TO.split(",") if x.strip()], msg.as_string())

def infer_pages_base_url():
    # الافتراضي لصفحتك الحالية
    return "https://khalidsaif912.github.io/roster-site"


# =========================
# Main
# =========================
def main():
    if not EXCEL_URL:
        raise RuntimeError("EXCEL_URL missing")

    now = datetime.now(TZ)
    dow = now.weekday()           # Mon=0..Sun=6
    today_dow = (dow + 1) % 7     # Sun=0..Sat=6
    today_day = now.day           # 1..31

    active_group = current_shift_key(now)  # صباح/ظهر/ليل
    pages_base = PAGES_BASE_URL or infer_pages_base_url()

    data = download_excel(EXCEL_URL)
    wb = load_workbook(BytesIO(data), data_only=True)

    total_all = 0
    total_now = 0

    cards_all = []
    cards_now = []

    for i, (sheet_name, dept_name) in enumerate(DEPARTMENTS):
        if sheet_name not in wb.sheetnames:
            continue

        ws = wb[sheet_name]

        days_row, date_row = find_days_and_dates_rows(ws)
        day_col = find_day_col(ws, days_row, date_row, today_dow, today_day)

        if not (days_row and date_row and day_col):
            cards_all.append(
                build_dept_card(
                    dept_name,
                    {},
                    _dept_color(i),
                ).replace("لا توجد مناوبات اليوم لهذا القسم",
                          f"⚠️ لم أستطع تحديد عمود اليوم/التاريخ في شيت {dept_name}")
            )
            continue

        # نبدأ تحت صف التاريخ مباشرة (هذا المهم عشان ما يتخطى صفوف موظفين فوق بالغلط)
        start_row = date_row + 1

        emp_col = find_employee_col(ws, start_row=start_row)
        if not emp_col:
            cards_all.append(
                build_dept_card(
                    dept_name,
                    {},
                    _dept_color(i),
                ).replace("لا توجد مناوبات اليوم لهذا القسم",
                          f"⚠️ لم أستطع تحديد عمود الموظفين في شيت {dept_name}")
            )
            continue

        buckets = {k: [] for k in GROUP_ORDER}
        buckets_now = {k: [] for k in GROUP_ORDER}

        for r in range(start_row, ws.max_row + 1):
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

        total_dept = sum(len(buckets.get(g, [])) for g in GROUP_ORDER)
        total_dept_now = sum(len(buckets_now.get(g, [])) for g in GROUP_ORDER)

        total_all += total_dept
        total_now += total_dept_now

        color = _dept_color(i)
        cards_all.append(build_dept_card(dept_name, buckets, color))

        # صفحة المناوب الآن: لو فاضي نعرض رسالة لطيفة
        if total_dept_now == 0:
            cards_now.append(
                build_dept_card(dept_name, {}, color).replace(
                    "لا توجد مناوبات اليوم لهذا القسم",
                    "لا يوجد مناوبين الآن لهذا القسم"
                )
            )
        else:
            cards_now.append(build_dept_card(dept_name, buckets_now, color))

    # Write pages
    os.makedirs("docs", exist_ok=True)
    os.makedirs("docs/now", exist_ok=True)

    chips_all = [
        f"📅 {now.strftime('%Y-%m-%d')} (مسقط)",
        f"⏱️ {now.strftime('%H:%M')}",
        f"📌 اليوم: {DAYS[today_dow]} / التاريخ: {today_day}",
        f"👥 الإجمالي: {total_all}",
    ]
    chips_now = [
        f"📅 {now.strftime('%Y-%m-%d')} (مسقط)",
        f"⏱️ {now.strftime('%H:%M')}",
        f"⏱️ المناوب الآن: {active_group}",
        f"👥 العدد الآن: {total_now}",
    ]

    html_all = page_html(
        title="Roster",
        subtitle="Duty Roster (All Sections)",
        now=now,
        chips=chips_all,
        content_html="".join(cards_all) if cards_all else "<div class='empty'>لا توجد بيانات</div>",
    )
    html_now = page_html(
        title="Roster",
        subtitle=f"Duty Roster (Now: {active_group})",
        now=now,
        chips=chips_now,
        content_html="".join(cards_now) if cards_now else "<div class='empty'>لا يوجد مناوبين الآن</div>",
    )

    with open("docs/index.html", "w", encoding="utf-8") as f:
        f.write(html_all)

    with open("docs/now/index.html", "w", encoding="utf-8") as f:
        f.write(html_now)

    # Email (اختياري)
    subject = f"Duty Roster — {active_group} — {now.strftime('%Y-%m-%d')}"
    email_html = f"""
    <div style="font-family:Segoe UI,Arial;direction:rtl;background:#0f172a;padding:16px">
      <div style="max-width:720px;margin:0 auto;background:#111827;border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:16px;color:#f1f5f9">
        <div style="font-size:18px;font-weight:900;margin-bottom:6px">📋 المناوب الآن ({active_group})</div>
        <div style="color:#cbd5e1;font-size:12px;margin-bottom:10px">تم الإرسال: {now.strftime('%H:%M')} (مسقط)</div>
        <div>
          {' '.join(cards_now) if cards_now else '<div style="color:#cbd5e1">لا يوجد مناوبين الآن</div>'}
        </div>
        <div style="text-align:center;margin-top:14px;">
          <a href="{pages_base}/" style="display:inline-block;padding:12px 18px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;text-decoration:none;font-weight:900;">
            فتح الصفحة الكاملة
          </a>
        </div>
      </div>
    </div>
    """
    send_email(subject, email_html)


if __name__ == "__main__":
    main()