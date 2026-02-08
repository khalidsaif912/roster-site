
# generate_and_send.py (FINAL CLEAN FIX)
import os
import smtplib
from datetime import datetime
from zoneinfo import ZoneInfo
from email.mime.text import MIMEText

TZ = ZoneInfo("Asia/Muscat")

SMTP_HOST = os.environ.get("SMTP_HOST","")
SMTP_PORT = int(os.environ.get("SMTP_PORT","587"))
SMTP_USER = os.environ.get("SMTP_USER","")
SMTP_PASS = os.environ.get("SMTP_PASS","")
MAIL_FROM = os.environ.get("MAIL_FROM","")
MAIL_TO = os.environ.get("MAIL_TO","")

SUBSCRIBE_URL = os.environ.get("SUBSCRIBE_URL","")
SUBSCRIBE_TOKEN = os.environ.get("SUBSCRIBE_TOKEN","")

def page_shell(now):
    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>Duty Roster</title></head>
<body style="font-family:Arial;background:#eef1f7;padding:16px">
<h2>📋 جدول المناوبين</h2>
<p>📅 {now.strftime('%Y-%m-%d %H:%M')}</p>

<div style="background:#fff;padding:14px;border-radius:14px">
<form method="POST" action="__SUBSCRIBE_URL__" target="_blank">
<input type="hidden" name="token" value="__SUBSCRIBE_TOKEN__">
<input name="email" type="email" required placeholder="بريدك الإلكتروني">
<button type="submit">اشترك</button>
</form>
</div>

</body></html>"""

def send_email(html):
    msg = MIMEText(html, "html", "utf-8")
    msg["From"] = MAIL_FROM
    msg["To"] = MAIL_TO
    msg["Subject"] = "Duty Roster"

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(MAIL_FROM, MAIL_TO.split(","), msg.as_string())

def main():
    now = datetime.now(TZ)
    html = page_shell(now)

    if SUBSCRIBE_URL:
        html = html.replace("__SUBSCRIBE_URL__", SUBSCRIBE_URL)
    if SUBSCRIBE_TOKEN:
        html = html.replace("__SUBSCRIBE_TOKEN__", SUBSCRIBE_TOKEN)

    os.makedirs("docs", exist_ok=True)
    with open("docs/index.html", "w", encoding="utf-8") as f:
        f.write(html)

    send_email(html)

if __name__ == "__main__":
    main()
