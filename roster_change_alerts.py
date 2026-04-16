import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional


def _schedule_map(month_schedule: Optional[List[Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    mapped: Dict[str, Dict[str, Any]] = {}
    for item in month_schedule or []:
        date_key = str(item.get("date") or "").strip()
        if date_key:
            mapped[date_key] = item
    return mapped


def _clean_shift_label(value: str) -> str:
    text = str(value or "").strip()
    return " ".join(text.split())


def _serialize_days(days: List[Dict[str, Any]]) -> str:
    return json.dumps(days, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_employee_change_alert(
    emp_id: str,
    month_key: str,
    old_month_schedule: Optional[List[Dict[str, Any]]],
    new_month_schedule: Optional[List[Dict[str, Any]]],
    changed_at_iso: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build a per-employee alert payload when a roster for the same month changes.

    Returns None when there is no previous month snapshot or when nothing changed.
    """
    if not old_month_schedule or not new_month_schedule:
        return None

    old_by_date = _schedule_map(old_month_schedule)
    new_by_date = _schedule_map(new_month_schedule)

    changed_days: List[Dict[str, Any]] = []
    for date_key in sorted(set(old_by_date.keys()) | set(new_by_date.keys())):
        old_item = old_by_date.get(date_key)
        new_item = new_by_date.get(date_key)
        if old_item == new_item:
            continue

        old_shift_code = str((old_item or {}).get("shift_code") or "").strip().upper()
        new_shift_code = str((new_item or {}).get("shift_code") or "").strip().upper()
        old_shift_label = _clean_shift_label((old_item or {}).get("shift_label", ""))
        new_shift_label = _clean_shift_label((new_item or {}).get("shift_label", ""))
        old_shift_group = str((old_item or {}).get("shift_group") or "").strip()
        new_shift_group = str((new_item or {}).get("shift_group") or "").strip()

        if (
            old_shift_code == new_shift_code
            and old_shift_label == new_shift_label
            and old_shift_group == new_shift_group
        ):
            continue

        template = new_item or old_item or {}
        changed_days.append(
            {
                "date": date_key,
                "day": template.get("day"),
                "day_name_ar": template.get("day_name_ar", ""),
                "day_name_en": template.get("day_name_en", ""),
                "old_shift_code": old_shift_code,
                "old_shift_label": old_shift_label,
                "old_shift_group": old_shift_group,
                "new_shift_code": new_shift_code,
                "new_shift_label": new_shift_label,
                "new_shift_group": new_shift_group,
            }
        )

    if not changed_days:
        return None

    changed_at = changed_at_iso or datetime.now().isoformat()
    digest_source = f"{emp_id}|{month_key}|{_serialize_days(changed_days)}"
    change_hash = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:16]

    month_display_en = month_key
    month_display_ar = month_key
    try:
        parsed_month = datetime.strptime(f"{month_key}-01", "%Y-%m-%d")
        month_display_en = parsed_month.strftime("%B %Y")
        month_display_ar = f"{parsed_month.month:02d}/{parsed_month.year}"
    except Exception:
        pass

    total = len(changed_days)
    return {
        "month": month_key,
        "is_active": True,
        "changed_at": changed_at,
        "change_hash": change_hash,
        "total_changed_days": total,
        "days": changed_days,
        "summary": {
            "en": f"Your {month_display_en} roster changed on {total} day{'s' if total != 1 else ''}.",
            "ar": f"تم تغيير جدولك لشهر {month_display_ar} في {total} يوم{'ين' if total == 2 else ''}.",
        },
    }
