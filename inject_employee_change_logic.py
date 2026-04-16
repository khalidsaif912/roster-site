from pathlib import Path

TARGET = Path('generate_employee_schedules.py')
IMPORT_NEEDLE = 'from openpyxl import load_workbook\n'
IMPORT_INSERT = 'from openpyxl import load_workbook\nfrom roster_change_alerts import build_employee_change_alert\n'

BLOCK_OLD = '''    # قراءة البيانات القديمة\n    existing_data = {"name": "", "id": emp_id, "department": "", "schedules": {}}\n    if os.path.exists(filepath):\n        try:\n            with open(filepath, 'r', encoding='utf-8') as f:\n                existing_data = json.load(f)\n        except:\n            pass\n\n    # دمج البيانات\n    existing_data["name"] = data["name"]\n    existing_data["department"] = data["department"]\n    existing_data["schedules"].update(data["schedules"])\n\n    # حفظ\n    with open(filepath, 'w', encoding='utf-8') as f:\n        json.dump(existing_data, f, ensure_ascii=False, indent=2)\n'''

BLOCK_NEW = '''    # قراءة البيانات القديمة\n    existing_data = {\n        "name": "",\n        "id": emp_id,\n        "department": "",\n        "schedules": {},\n        "change_alerts": {},\n    }\n    if os.path.exists(filepath):\n        try:\n            with open(filepath, 'r', encoding='utf-8') as f:\n                existing_data = json.load(f)\n        except:\n            pass\n\n    existing_data.setdefault("schedules", {})\n    existing_data.setdefault("change_alerts", {})\n\n    # CHANGE-ALERT HOOK START\n    changed_at_iso = datetime.now(TZ).isoformat()\n    for month_key, new_month_schedule in data["schedules"].items():\n        old_month_schedule = existing_data.get("schedules", {}).get(month_key)\n        alert_payload = build_employee_change_alert(\n            emp_id=emp_id,\n            month_key=month_key,\n            old_month_schedule=old_month_schedule,\n            new_month_schedule=new_month_schedule,\n            changed_at_iso=changed_at_iso,\n        )\n        if alert_payload:\n            existing_data["change_alerts"][month_key] = alert_payload\n    # CHANGE-ALERT HOOK END\n\n    # دمج البيانات\n    existing_data["name"] = data["name"]\n    existing_data["department"] = data["department"]\n    existing_data["schedules"].update(data["schedules"])\n\n    # حفظ\n    with open(filepath, 'w', encoding='utf-8') as f:\n        json.dump(existing_data, f, ensure_ascii=False, indent=2)\n'''


def main() -> None:
    if not TARGET.exists():
        raise SystemExit(f'File not found: {TARGET}')

    text = TARGET.read_text(encoding='utf-8')

    if 'from roster_change_alerts import build_employee_change_alert' not in text:
        if IMPORT_NEEDLE not in text:
            raise SystemExit('Could not find import anchor for load_workbook')
        text = text.replace(IMPORT_NEEDLE, IMPORT_INSERT, 1)

    if 'CHANGE-ALERT HOOK START' not in text:
        if BLOCK_OLD not in text:
            raise SystemExit('Could not find the expected save block in generate_employee_schedules.py')
        text = text.replace(BLOCK_OLD, BLOCK_NEW, 1)

    TARGET.write_text(text, encoding='utf-8')
    print('Patched generate_employee_schedules.py successfully.')


if __name__ == '__main__':
    main()
