#!/usr/bin/env python3
import re
from pathlib import Path

TARGET = Path("generate_employee_schedules.py")

if not TARGET.exists():
    raise SystemExit("generate_employee_schedules.py not found")

text = TARGET.read_text(encoding="utf-8")

# 1) Add import if missing
import_marker = "from openpyxl import load_workbook"
import_line = "from roster_change_alerts import build_month_change_alert"

if import_line not in text:
    if import_marker not in text:
        raise SystemExit("Could not find import marker in generate_employee_schedules.py")
    text = text.replace(import_marker, import_marker + "\n" + import_line, 1)

# 2) Idempotent: if already patched, exit cleanly
if "build_month_change_alert(" in text and 'existing_data["change_alerts"]' in text:
    TARGET.write_text(text, encoding="utf-8")
    print("generate_employee_schedules.py already patched")
    raise SystemExit(0)

# 3) Replace the exact update line with a safer injected block
update_line = '        existing_data["schedules"].update(data["schedules"])'

if update_line not in text:
    raise SystemExit('Could not find update line: existing_data["schedules"].update(data["schedules"])')

replacement = '''        # حساب تنبيه التغيير قبل تحديث الشهر نفسه
        month_key = next(iter(data["schedules"].keys()))
        new_month_schedule = data["schedules"][month_key]
        old_month_schedule = existing_data.get("schedules", {}).get(month_key, [])

        existing_data.setdefault("change_alerts", {})
        existing_data["change_alerts"][month_key] = build_month_change_alert(
            month_key=month_key,
            old_schedule=old_month_schedule,
            new_schedule=new_month_schedule,
        )

        existing_data["schedules"].update(data["schedules"])'''

text = text.replace(update_line, replacement, 1)

TARGET.write_text(text, encoding="utf-8")
print("Patched generate_employee_schedules.py successfully")
