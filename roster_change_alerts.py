#!/usr/bin/env python3
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Muscat")


def _normalize_schedule(schedule):
    if not isinstance(schedule, list):
        return []
    normalized = []
    for item in schedule:
        if not isinstance(item, dict):
            continue
        normalized.append({
            "date": str(item.get("date", "")).strip(),
            "day": item.get("day"),
            "day_name_ar": str(item.get("day_name_ar", "")).strip(),
            "day_name_en": str(item.get("day_name_en", "")).strip(),
            "shift_code": str(item.get("shift_code", "")).strip(),
            "shift_label": str(item.get("shift_label", "")).strip(),
            "shift_group": str(item.get("shift_group", "")).strip(),
        })
    normalized.sort(key=lambda x: x.get("date", ""))
    return normalized


def _schedule_map(schedule):
    return {item["date"]: item for item in _normalize_schedule(schedule) if item.get("date")}


def _changed_days(old_schedule, new_schedule):
    old_map = _schedule_map(old_schedule)
    new_map = _schedule_map(new_schedule)

    changed = []
    all_dates = sorted(set(old_map.keys()) | set(new_map.keys()))

    for date_key in all_dates:
        old_item = old_map.get(date_key, {})
        new_item = new_map.get(date_key, {})

        old_code = str(old_item.get("shift_code", "")).strip().upper()
        new_code = str(new_item.get("shift_code", "")).strip().upper()

        old_label = str(old_item.get("shift_label", "")).strip()
        new_label = str(new_item.get("shift_label", "")).strip()

        old_group = str(old_item.get("shift_group", "")).strip()
        new_group = str(new_item.get("shift_group", "")).strip()

        if (old_code, old_label, old_group) == (new_code, new_label, new_group):
            continue

        changed.append({
            "date": date_key,
            "day": new_item.get("day") or old_item.get("day"),
            "day_name_ar": new_item.get("day_name_ar") or old_item.get("day_name_ar") or "",
            "day_name_en": new_item.get("day_name_en") or old_item.get("day_name_en") or "",
            "old_shift_code": old_code or "",
            "old_shift_label": old_label or old_code or "-",
            "old_shift_group": old_group or "",
            "new_shift_code": new_code or "",
            "new_shift_label": new_label or new_code or "-",
            "new_shift_group": new_group or "",
        })

    return changed


def _build_hash(month_key, changed_days):
    raw_parts = [month_key]
    for item in changed_days:
        raw_parts.append(
            "|".join([
                str(item.get("date", "")),
                str(item.get("old_shift_code", "")),
                str(item.get("new_shift_code", "")),
                str(item.get("old_shift_label", "")),
                str(item.get("new_shift_label", "")),
            ])
        )
    raw = "||".join(raw_parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _month_text(month_key):
    try:
        year, month = [int(x) for x in month_key.split("-")]
        dt = datetime(year, month, 1, tzinfo=TZ)
        month_en = dt.strftime("%B %Y")
        month_ar_names = [
            "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
            "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
        ]
        month_ar = f"{month_ar_names[month - 1]} {year}"
        return month_ar, month_en
    except Exception:
        return month_key, month_key


def build_month_change_alert(month_key, old_schedule, new_schedule):
    old_normalized = _normalize_schedule(old_schedule)
    new_normalized = _normalize_schedule(new_schedule)

    # أول إنشاء للشهر أو لا يوجد نسخة قديمة: لا نعتبره تغييرًا
    if not old_normalized:
        return {
            "month": month_key,
            "is_active": False,
            "change_hash": "",
            "changed_at": "",
            "total_changed_days": 0,
            "summary": {
                "ar": "",
                "en": "",
            },
            "days": [],
        }

    changed_days = _changed_days(old_normalized, new_normalized)

    if not changed_days:
        return {
            "month": month_key,
            "is_active": False,
            "change_hash": "",
            "changed_at": "",
            "total_changed_days": 0,
            "summary": {
                "ar": "",
                "en": "",
            },
            "days": [],
        }

    month_ar, month_en = _month_text(month_key)
    total = len(changed_days)
    change_hash = _build_hash(month_key, changed_days)
    changed_at = datetime.now(TZ).isoformat()

    return {
        "month": month_key,
        "is_active": True,
        "change_hash": change_hash,
        "changed_at": changed_at,
        "total_changed_days": total,
        "summary": {
            "ar": f"تم تعديل {total} يوم في جدولك لشهر {month_ar}.",
            "en": f"{total} day(s) changed in your roster for {month_en}.",
        },
        "days": changed_days,
    }
