import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO

import requests
from openpyxl import load_workbook
import smtplib
from email.mime.text import MIMEText

# ============================================================================
# STAGE 1: WEBHOOK - التهيئة والمتغيرات
# ============================================================================
class WebhookConfig:
    """تمثيل نقطة البداية - تشابه مع Webhook في الورك فلو"""
    def __init__(self):
        self.excel_url = os.environ.get("EXCEL_URL", "").strip()
        self.smtp_host = os.environ.get("SMTP_HOST", "").strip()
        self.smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user = os.environ.get("SMTP_USER", "").strip()
        self.smtp_pass = os.environ.get("SMTP_PASS", "").strip()
        self.mail_from = os.environ.get("MAIL_FROM", "").strip()
        self.mail_to = os.environ.get("MAIL_TO", "").strip()
        self.pages_base_url = os.environ.get("PAGES_BASE_URL", "").strip()
        self.tz = ZoneInfo("Asia/Muscat")

# ============================================================================
# STAGE 2: HTTP REQUEST - جلب البيانات من الإنترنت
# ============================================================================
class HTTPRequestStage:
    """تمثيل HTTP Request - جلب ملف Excel"""
    @staticmethod
    def execute(excel_url: str) -> bytes:
        """جلب ملف Excel من الإنترنت"""
        if not excel_url:
            raise RuntimeError("EXCEL_URL missing")
        r = requests.get(excel_url, timeout=60)
        r.raise_for_status()
        return r.content

# ============================================================================
# STAGE 3: EXTRACT FROM FILE - استخراج البيانات من الأوراق
# ============================================================================
class ExtractFromFileStage:
    """تمثيل Extract from File - استخراج من أوراق مختلفة"""
    
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
    
    @staticmethod
    def clean(v) -> str:
        if v is None:
            return ""
        return re.sub(r"\s+", " ", str(v).replace("\u00A0", " ")).strip()

    @staticmethod
    def to_western_digits(s: str) -> str:
        if not s:
            return s
        arabic = {"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"}
        farsi = {"۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"}
        mp = {**arabic, **farsi}
        return "".join(mp.get(ch, ch) for ch in str(s))

    @staticmethod
    def norm(s: str) -> str:
        return ExtractFromFileStage.clean(ExtractFromFileStage.to_western_digits(s))

    @staticmethod
    def looks_like_time(s: str) -> bool:
        up = ExtractFromFileStage.norm(s).upper()
        return bool(
            re.match(r"^\d{3,4}\s*H?\s*-\s*\d{3,4}\s*H?$", up)
            or re.match(r"^\d{3,4}\s*H$", up)
            or re.match(r"^\d{3,4}$", up)
        )

    @staticmethod
    def looks_like_employee_name(s: str) -> bool:
        v = ExtractFromFileStage.norm(s)
        if not v:
            return False
        up = v.upper()
        if ExtractFromFileStage.looks_like_time(up):
            return False
        if re.search(r"(ANNUAL\s*LEAVE|SICK\s*LEAVE|REST\/OFF\s*DAY|REST|OFF\s*DAY|TRAINING|STANDBY)", up):
            return False
        if re.search(r"-\s*\d{3,}", v) and re.search(r"[A-Za-z\u0600-\u06FF]", v):
            return True
        parts = [p for p in v.split(" ") if p]
        return bool(re.search(r"[A-Za-z\u0600-\u06FF]", v) and len(parts) >= 2)

    @staticmethod
    def looks_like_shift_code(s: str) -> bool:
        v = ExtractFromFileStage.norm(s).upper()
        if not v:
            return False
        if ExtractFromFileStage.looks_like_time(v):
            return False
        if v in ["OFF", "O", "LV", "TR", "ST", "SL", "AL"]:
            return True
        if re.match(r"^(MN|AN|NN|NT|ME|AE|NE)\d{1,2}", v):
            return True
        if re.search(r"(ANNUAL\s*LEAVE|SICK\s*LEAVE|REST\/OFF\s*DAY|REST|OFF\s*DAY|TRAINING|STANDBY)", v):
            return True
        return False

    @staticmethod
    def map_shift(code: str):
        c0 = ExtractFromFileStage.norm(code)
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

        if c in ExtractFromFileStage.SHIFT_MAP:
            return ExtractFromFileStage.SHIFT_MAP[c]

        return (c0, "أخرى")

    @staticmethod
    def find_day_column(ws, today_dow: int) -> tuple:
        """البحث عن صف الرأس وعمود اليوم الحالي"""
        header_row_idx = None
        header_row = None
        
        for i in range(1, min(ws.max_row + 1, 50)):
            first_cell = ExtractFromFileStage.norm(ws.cell(row=i, column=1).value).upper()
            
            if any(keyword in first_cell for keyword in ["EMPLOYEE", "STAFF", "NAME", "الموظف"]):
                header_row_idx = i
                header_row = [ExtractFromFileStage.norm(ws.cell(row=i, column=c).value) for c in range(1, ws.max_column + 1)]
                break
        
        if not header_row_idx:
            return None, None
        
        day_col = None
        for col_idx, cell_value in enumerate(header_row, start=1):
            cell_upper = cell_value.upper()
            if ExtractFromFileStage.DAYS[today_dow] in cell_upper:
                day_col = col_idx
                break
        
        return header_row_idx, day_col

    @staticmethod
    def find_employee_col(ws, start_row: int, max_scan_rows: int = 120):
        """البحث عن عمود الموظفين"""
        scores = {}
        r_end = min(ws.max_row, start_row + max_scan_rows)
        
        for r in range(start_row, r_end + 1):
            for c in range(1, ws.max_column + 1):
                v = ws.cell(row=r, column=c).value
                if ExtractFromFileStage.looks_like_employee_name(v):
                    scores[c] = scores.get(c, 0) + 1
        
        if not scores:
            return None
        
        return max(scores.items(), key=lambda kv: kv[1])[0]

    @staticmethod
    def execute(excel_bytes: bytes, today_dow: int) -> dict:
        """استخراج البيانات من جميع الأوراق"""
        wb = load_workbook(BytesIO(excel_bytes), data_only=True)
        extracted_data = {}
        
        for sheet_name, dept_name in ExtractFromFileStage.DEPARTMENTS:
            if sheet_name not in wb.sheetnames:
                continue
            
            ws = wb[sheet_name]
            header_row_idx, day_col = ExtractFromFileStage.find_day_column(ws, today_dow)
            
            if not header_row_idx or not day_col:
                extracted_data[dept_name] = {"error": f"Cannot find day column in {dept_name}"}
                continue
            
            emp_col = ExtractFromFileStage.find_employee_col(ws, header_row_idx + 1)
            if not emp_col:
                extracted_data[dept_name] = {"error": f"Cannot find employee column in {dept_name}"}
                continue
            
            dept_data = []
            for r in range(header_row_idx + 1, ws.max_row + 1):
                name = ExtractFromFileStage.norm(ws.cell(row=r, column=emp_col).value)
                if not ExtractFromFileStage.looks_like_employee_name(name):
                    continue

                raw = ExtractFromFileStage.norm(ws.cell(row=r, column=day_col).value)
                if not ExtractFromFileStage.looks_like_shift_code(raw):
                    continue

                label, grp = ExtractFromFileStage.map_shift(raw)
                dept_data.append({
                    "name": name,
                    "shift": label,
                    "group": grp
                })
            
            extracted_data[dept_name] = dept_data
        
        return extracted_data

# ============================================================================
# STAGE 4: MERGE - دمج البيانات
# ============================================================================
class MergeStage:
    """تمثيل Merge - دمج جميع البيانات المستخرجة"""
    
    @staticmethod
    def execute(extracted_data: dict, active_group: str) -> dict:
        """دمج البيانات وتنظيمها"""
        merged = {
            "all_employees": {},
            "current_shift_employees": {},
            "total_all": 0,
            "total_now": 0
        }
        
        for dept_name, dept_data in extracted_data.items():
            if isinstance(dept_data, dict) and "error" in dept_data:
                merged["all_employees"][dept_name] = dept_data
                continue
            
            # تنظيم حسب المجموعات
            buckets = {}
            buckets_now = {}
            
            for emp in dept_data:
                grp = emp.get("group", "أخرى")
                if grp not in buckets:
                    buckets[grp] = []
                buckets[grp].append(emp)
                
                if grp == active_group:
                    if grp not in buckets_now:
                        buckets_now[grp] = []
                    buckets_now[grp].append(emp)
            
            merged["all_employees"][dept_name] = buckets
            merged["current_shift_employees"][dept_name] = buckets_now
            
            # عد الموظفين
            for grp, emps in buckets.items():
                merged["total_all"] += len(emps)
            for grp, emps in buckets_now.items():
                merged["total_now"] += len(emps)
        
        return merged

# ============================================================================
# STAGE 5: CODE IN JAVASCRIPT - معالجة البيانات وإنشاء الـ HTML
# ============================================================================
class CodeProcessingStage:
    """تمثيل Code in JavaScript - معالجة وتحويل البيانات"""
    
    GROUP_ORDER = ["صباح", "ظهر", "ليل", "مناوبات", "راحة", "إجازات", "تدريب", "أخرى"]
    
    @staticmethod
    def current_shift_key(now: datetime) -> str:
        """تحديد الشفت الحالي"""
        t = now.hour * 60 + now.minute
        if t >= 21 * 60 or t < 5 * 60:
            return "ليل"
        if t >= 14 * 60:
            return "ظهر"
        return "صباح"

    @staticmethod
    def build_group_table(title: str, rows):
        """بناء جدول مجموعة واحدة"""
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

    @staticmethod
    def build_dept_section(dept_name: str, buckets):
        """بناء قسم قسم واحد"""
        section = f"""
          <div style="text-align:center;font-size:22px;font-weight:800;margin:6px 0 12px 0;">
            {dept_name}
          </div>
        """
        total = 0
        has_any = False
        for g in CodeProcessingStage.GROUP_ORDER:
            arr = buckets.get(g, [])
            if not arr:
                continue
            has_any = True
            total += len(arr)
            section += CodeProcessingStage.build_group_table(g, arr)

        if not has_any:
            section += """
              <div style="text-align:center;color:#b00020;font-weight:800;margin:10px 0;">
                ⚠️ لا توجد مناوبات اليوم لهذا القسم
              </div>
            """
        return section, total

    @staticmethod
    def execute(merged_data: dict, now: datetime) -> dict:
        """معالجة البيانات إلى صيغة HTML"""
        all_sections_html = ""
        now_sections_html = ""
        
        for dept_name, buckets in merged_data["all_employees"].items():
            if isinstance(buckets, dict) and "error" in buckets:
                all_sections_html += f"<div style='text-align:center;color:#b00020;font-weight:800;'>⚠️ {buckets['error']}</div>"
                all_sections_html += "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
                continue
            
            dept_section, _ = CodeProcessingStage.build_dept_section(dept_name, buckets)
            all_sections_html += dept_section + "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
        
        for dept_name, buckets in merged_data["current_shift_employees"].items():
            if isinstance(buckets, dict) and "error" in buckets:
                continue
            
            if not buckets:
                dept_section_now = f"""
                  <div style="text-align:center;font-size:22px;font-weight:800;margin:6px 0 12px 0;">{dept_name}</div>
                  <div style="text-align:center;color:#94a3b8;font-weight:800;margin:10px 0;">
                    لا يوجد مناوبين الآن لهذا القسم
                  </div>
                """
            else:
                dept_section_now, _ = CodeProcessingStage.build_dept_section(dept_name, buckets)
            
            now_sections_html += dept_section_now + "<hr style='border:none;border-top:1px solid #eee;margin:18px 0;'>"
        
        return {
            "all_sections_html": all_sections_html,
            "now_sections_html": now_sections_html,
            "timestamp": now
        }

# ============================================================================
# STAGE 6: PAGE SHELL - بناء الصفحات
# ============================================================================
class PageShellStage:
    """تمثيل بناء الصفحات النهائية"""
    
    @staticmethod
    def page_shell(title: str, body_html: str, now: datetime, extra_top_html: str = ""):
        """بناء قالب الصفحة"""
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

    @staticmethod
    def execute(processed_data: dict, merged_data: dict, now: datetime, pages_base_url: str) -> dict:
        """بناء الصفحات والبريد الإلكتروني"""
        total_all = merged_data["total_all"]
        total_now = merged_data["total_now"]
        active_group = CodeProcessingStage.current_shift_key(now)
        
        all_sections_html = processed_data["all_sections_html"]
        now_sections_html = processed_data["now_sections_html"]
        
        full_page = PageShellStage.page_shell(
            "Duty Roster - Full",
            all_sections_html or "<div style='text-align:center;color:#94a3b8;font-weight:800;'>لا توجد بيانات</div>",
            now,
            extra_top_html=f"<div style='margin-top:10px;font-weight:900;'>الإجمالي: {total_all}</div>",
        )

        now_page = PageShellStage.page_shell(
            f"Duty Roster - Now ({active_group})",
            now_sections_html or "<div style='text-align:center;color:#94a3b8;font-weight:800;'>لا يوجد مناوبين الآن</div>",
            now,
            extra_top_html=f"<div style='margin-top:10px;font-weight:900;'>المناوب الآن: {active_group} — العدد: {total_now}</div>",
        )
        
        email_html = f"""
        <div style="font-family:Arial;direction:rtl;background:#eef1f7;padding:16px">
          <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid #e6e6e6">
            <h2 style="margin:0 0 10px 0;">📋 المناوب الآن ({active_group})</h2>
            <div style="color:#64748b;margin-bottom:12px;">تم الإرسال: {now.strftime('%H:%M')} (مسقط)</div>
            <div>{now_sections_html}</div>
            <div style="text-align:center;margin-top:14px;">
              <a href="{pages_base_url}/" style="display:inline-block;padding:12px 22px;border-radius:14px;background:#1e40af;color:#fff;text-decoration:none;font-weight:900;">
                فتح الصفحة الكاملة
              </a>
            </div>
          </div>
        </div>
        """
        
        return {
            "full_page": full_page,
            "now_page": now_page,
            "email_html": email_html,
            "active_group": active_group
        }

# ============================================================================
# STAGE 7: SEND EMAIL & RESPOND - إرسال الرسائل
# ============================================================================
class SendEmailStage:
    """تمثيل إرسال البريد الإلكتروني"""
    
    @staticmethod
    def send_email(subject: str, html: str, smtp_config):
        """إرسال بريد إلكتروني"""
        msg = MIMEText(html, "html", "utf-8")
        msg["Subject"] = subject
        msg["From"] = smtp_config["mail_from"]
        msg["To"] = smtp_config["mail_to"]

        with smtplib.SMTP(smtp_config["smtp_host"], smtp_config["smtp_port"]) as s:
            s.starttls()
            s.login(smtp_config["smtp_user"], smtp_config["smtp_pass"])
            s.sendmail(
                smtp_config["mail_from"],
                [x.strip() for x in smtp_config["mail_to"].split(",") if x.strip()],
                msg.as_string()
            )

    @staticmethod
    def execute(pages_data: dict, now: datetime, smtp_config):
        """تنفيذ مرحلة الإرسال"""
        os.makedirs("docs", exist_ok=True)
        os.makedirs("docs/now", exist_ok=True)

        # حفظ الصفحات
        with open("docs/index.html", "w", encoding="utf-8") as f:
            f.write(pages_data["full_page"])

        with open("docs/now/index.html", "w", encoding="utf-8") as f:
            f.write(pages_data["now_page"])

        # إرسال البريد الإلكتروني
        subject = f"Duty Roster — {pages_data['active_group']} — {now.strftime('%Y-%m-%d')}"
        SendEmailStage.send_email(subject, pages_data["email_html"], smtp_config)
        
        return {"status": "success", "message": "Email sent and pages saved"}

# ============================================================================
# MAIN ORCHESTRATION - التنسيق الرئيسي
# ============================================================================
def infer_pages_base_url():
    return "https://khalidsaif912.github.io/roster-site"

def main():
    """المسار الرئيسي - تشابه مع سير الورك فلو"""
    
    # STAGE 1: WEBHOOK - التهيئة
    print("📍 STAGE 1: WEBHOOK - Loading Configuration")
    config = WebhookConfig()
    
    if not config.excel_url:
        raise RuntimeError("EXCEL_URL missing")
    
    now = datetime.now(config.tz)
    dow = now.weekday()
    today_dow = (dow + 1) % 7
    
    # STAGE 2: HTTP REQUEST - جلب البيانات
    print("📍 STAGE 2: HTTP REQUEST - Downloading Excel File")
    excel_bytes = HTTPRequestStage.execute(config.excel_url)
    
    # STAGE 3: EXTRACT FROM FILE - استخراج البيانات
    print("📍 STAGE 3: EXTRACT FROM FILE - Extracting from Sheets")
    extracted_data = ExtractFromFileStage.execute(excel_bytes, today_dow)
    
    # STAGE 4: MERGE - دمج البيانات
    print("📍 STAGE 4: MERGE - Merging Extracted Data")
    active_group = CodeProcessingStage.current_shift_key(now)
    merged_data = MergeStage.execute(extracted_data, active_group)
    
    # STAGE 5: CODE PROCESSING - معالجة البيانات
    print("📍 STAGE 5: CODE PROCESSING - Processing Data to HTML")
    processed_data = CodeProcessingStage.execute(merged_data, now)
    
    # STAGE 6: PAGE SHELL - بناء الصفحات
    print("📍 STAGE 6: PAGE SHELL - Building Pages")
    pages_base = config.pages_base_url or infer_pages_base_url()
    pages_data = PageShellStage.execute(processed_data, merged_data, now, pages_base)
    
    # STAGE 7: SEND EMAIL - إرسال البريد
    print("📍 STAGE 7: SEND EMAIL & RESPOND - Sending Results")
    smtp_config = {
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_user": config.smtp_user,
        "smtp_pass": config.smtp_pass,
        "mail_from": config.mail_from,
        "mail_to": config.mail_to,
    }
    result = SendEmailStage.execute(pages_data, now, smtp_config)
    
    print(f"✅ {result['message']}")

if __name__ == "__main__":
    main()
