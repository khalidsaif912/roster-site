import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO

import requests
from openpyxl import load_workbook
import smtplib
from email.mime.text import MIMEText

EXCEL_URL = os.environ.get("EXCEL_URL", "").strip()

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip()
MAIL_TO = os.environ.get("MAIL_TO", "").strip()

PAGES_BASE_URL = os.environ.get("PAGES_BASE_URL", "").strip()

TZ = ZoneInfo("Asia/Muscat")

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


def as_int(v):
    """تحويل آمن إلى رقم صحيح"""
    try:
        if v is None:
            return None
        s = norm(v)
        if not s:
            return None
        # إزالة أي نصوص إضافية والحصول على الرقم فقط
        match = re.search(r'\d+', s)
        if match:
            return int(match.group())
        return None
    except:
        return None


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


def find_today_column_smart(ws, today_day: int, today_dow: int):
    """
    استراتيجية ذكية متعددة المراحل لإيجاد عمود اليوم الصحيح
    
    المراحل:
    1. البحث عن صف يحتوي على أرقام 1-31
    2. البحث عن صف يحتوي على أسماء الأيام (SUN-SAT)
    3. التحقق من المطابقة بين رقم اليوم واسم اليوم
    4. اختيار أفضل مطابقة
    """
    
    print(f"\n[SMART] البحث عن عمود اليوم: {today_day} ({DAYS[today_dow]})")
    
    # المرحلة 1: البحث عن صف الأرقام (1-31)
    date_rows = []  # [(row_index, {day_num: col_index})]
    
    for r in range(1, min(ws.max_row + 1, 15)):
        day_map = {}
        for c in range(1, ws.max_column + 1):
            val = as_int(ws.cell(row=r, column=c).value)
            if val and 1 <= val <= 31:
                day_map[val] = c
        
        if len(day_map) >= 5:  # على الأقل 5 أيام في الصف
            date_rows.append((r, day_map))
            print(f"[SMART] وجدنا صف أرقام: الصف {r} يحتوي على {len(day_map)} يوم")
    
    # المرحلة 2: البحث عن صف أسماء الأيام
    day_name_rows = []  # [(row_index, {day_index: col_index})]
    
    for r in range(1, min(ws.max_row + 1, 15)):
        day_name_map = {}
        for c in range(1, ws.max_column + 1):
            txt = norm(ws.cell(row=r, column=c).value).upper()
            for day_idx, day_name in enumerate(DAYS):
                if day_name in txt:
                    day_name_map[day_idx] = c
                    break
        
        if len(day_name_map) >= 3:  # على الأقل 3 أيام في الصف
            day_name_rows.append((r, day_name_map))
            print(f"[SMART] وجدنا صف أسماء: الصف {r} يحتوي على {len(day_name_map)} اسم يوم")
    
    # المرحلة 3: محاولة المطابقة المثالية
    # نبحث عن صف أرقام يحتوي على اليوم المطلوب وصف أسماء يحتوي على اسم اليوم المطلوب
    # ونتحقق من أنهما في نفس العمود (أو قريبين)
    
    best_match = None
    best_score = 0
    
    for date_row_idx, date_map in date_rows:
        if today_day not in date_map:
            continue
        
        date_col = date_map[today_day]
        
        # نحاول إيجاد صف أسماء قريب
        for name_row_idx, name_map in day_name_rows:
            if today_dow not in name_map:
                continue
            
            name_col = name_map[today_dow]
            
            # حساب النقاط بناءً على:
            # 1. المسافة بين الصفين (كلما أقرب كلما أفضل)
            # 2. المسافة بين العمودين (يجب أن يكونا نفس العمود أو قريبين)
            
            row_distance = abs(date_row_idx - name_row_idx)
            col_distance = abs(date_col - name_col)
            
            # نقاط: كلما قلت المسافة كلما زادت النقاط
            score = 100 - (row_distance * 10) - (col_distance * 5)
            
            print(f"[SMART] مطابقة محتملة: صف أرقام {date_row_idx} عمود {date_col} + صف أسماء {name_row_idx} عمود {name_col} = نقاط {score}")
            
            if score > best_score:
                best_score = score
                best_match = {
                    'date_row': date_row_idx,
                    'date_col': date_col,
                    'name_row': name_row_idx,
                    'name_col': name_col,
                    'col_distance': col_distance
                }
    
    # إذا وجدنا مطابقة جيدة
    if best_match and best_match['col_distance'] <= 2:  # الأعمدة قريبة من بعض
        print(f"[SMART] ✅ مطابقة مثالية! استخدام العمود {best_match['date_col']}")
        return best_match['date_row'], best_match['date_col']
    
    # المرحلة 4: استراتيجية بديلة - استخدام صف الأرقام فقط
    for date_row_idx, date_map in date_rows:
        if today_day in date_map:
            col = date_map[today_day]
            print(f"[SMART] ⚠️ استخدام صف الأرقام فقط: الصف {date_row_idx} العمود {col}")
            return date_row_idx, col
    
    # المرحلة 5: استراتيجية بديلة - استخدام صف الأسماء + حساب موقع العمود
    for name_row_idx, name_map in day_name_rows:
        if today_dow in name_map:
            col = name_map[today_dow]
            print(f"[SMART] ⚠️ استخدام صف الأسماء فقط: الصف {name_row_idx} العمود {col}")
            # نبحث عن صف أرقام قريب لتحديد الصف الصحيح
            closest_date_row = None
            min_distance = 999
            for dr, _ in date_rows:
                dist = abs(dr - name_row_idx)
                if dist < min_distance:
                    min_distance = dist
                    closest_date_row = dr
            
            if closest_date_row:
                return closest_date_row, col
            else:
                return name_row_idx, col
    
    print(f"[SMART] ❌ لم نجد عمود اليوم!")
    return None, None


def find_employee_col(ws, start_row: int, max_scan_rows: int = 120):
    """البحث عن عمود الموظفين بناءً على عدد الأسماء الصحيحة"""
    scores = {}
    r_end = min(ws.max_row, start_row + max_scan_rows)
    
    for r in range(start_row, r_end + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(row=r, column=c).value
            if looks_like_employee_name(v):
                scores[c] = scores.get(c, 0) + 1
    
    if not scores:
        return None
    
    best_col = max(scores.items(), key=lambda kv: kv[1])[0]
    print(f"[SMART] عمود الموظفين: {best_col} (عدد الأسماء: {scores[best_col]})")
    return best_col


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
    today_day = now.day  # رقم اليوم في الشهر (1-31)
    dow = now.weekday()
    today_dow = (dow + 1) % 7  # تحويل: 0=الاثنين → 1=الأحد في نظام SUN-SAT
    
    print(f"\n{'='*60}")
    print(f"التاريخ: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"اليوم: {DAYS[today_dow]} (رقم {today_day})")
    print(f"{'='*60}")

    active_group = current_shift_key(now)
    pages_base = PAGES_BASE_URL or infer_pages_base_url()

    data = download_excel(EXCEL_URL)
    wb = load_workbook(BytesIO(data), data_only=True)

    all_sections_html = ""
    now_sections_html = ""
    total_all = 0
    total_now = 0

    for sheet_name, dept_name in DEPARTMENTS:
        print(f"\n{'='*60}")
        print(f"معالجة شيت: {sheet_name} ({dept_name})")
        print(f"{'='*60}")
        
        if sheet_name not in wb.sheetnames:
            print(f"⚠️ الشيت غير موجود!")
            continue
        
        ws = wb[sheet_name]
        print(f"حجم الشيت: {ws.max_row} صف × {ws.max_column} عمود")

        # استخدام الاستراتيجية الذكية
        header_row, day_col = find_today_column_smart(ws, today_day, today_dow)
        
        if not header_row or not day_col:
            dept_html = f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ لم أستطع تحديد عمود اليوم {today_day} ({DAYS[today_dow]}) في شيت {dept_name}</div>"
            all_sections_html += dept_html + "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
            continue

        # البحث عن عمود الموظفين
        emp_col = find_employee_col(ws, header_row + 1)
        if not emp_col:
            dept_html = f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ لم أستطع تحديد عمود الموظفين في شيت {dept_name}</div>"
            all_sections_html += dept_html + "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
            continue

        buckets = {k: [] for k in GROUP_ORDER}
        buckets_now = {k: [] for k in GROUP_ORDER}

        # قراءة البيانات
        for r in range(header_row + 1, ws.max_row + 1):
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
        
        print(f"✅ تم معالجة {dept_count} موظف")

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

    print(f"\n{'='*60}")
    print(f"الإجمالي: {total_all} موظف")
    print(f"المناوب الآن ({active_group}): {total_now} موظف")
    print(f"{'='*60}\n")

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