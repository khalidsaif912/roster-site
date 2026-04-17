#!/usr/bin/env python3
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Muscat")

# أسماء الأشهر بالعربية
_MONTHS_AR = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

# أسماء أيام الأسبوع بالعربية (Mon=0 ... Sun=6)
_WEEKDAYS_AR = [
    "الإثنين", "الثلاثاء", "الأربعاء", "الخميس",
    "الجمعة", "السبت", "الأحد",
]


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


def _fmt_day_date(date_key):
    """يعيد (يوم_عربي, يوم_إنجليزي, تاريخ_مختصر dd/mm) من YYYY-MM-DD."""
    try:
        dt = datetime.strptime(date_key, "%Y-%m-%d")
        wd = dt.weekday()
        return _WEEKDAYS_AR[wd], dt.strftime("%a"), dt.strftime("%d/%m")
    except Exception:
        return "", "", date_key


def _shift_display(label, code):
    """يختار النص الأنسب لعرض الوردية، ويستخدم — للفراغ."""
    label = (label or "").strip()
    code = (code or "").strip()
    if label and code and label.lower() != code.lower():
        return f"{label} ({code})"
    return label or code or "—"


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

        day_ar, day_en, short_date = _fmt_day_date(date_key)
        day_name_ar = (
            new_item.get("day_name_ar")
            or old_item.get("day_name_ar")
            or day_ar
            or ""
        )
        day_name_en = (
            new_item.get("day_name_en")
            or old_item.get("day_name_en")
            or day_en
            or ""
        )

        old_display = _shift_display(old_label, old_code)
        new_display = _shift_display(new_label, new_code)

        # سطر جاهز للعرض في الواجهة
        line_ar = f"{day_name_ar} {short_date}: {old_display} ← {new_display}".strip()
        line_en = f"{day_name_en} {short_date}: {old_display} → {new_display}".strip()

        changed.append({
            "date": date_key,
            "short_date": short_date,
            "day": new_item.get("day") or old_item.get("day"),
            "day_name_ar": day_name_ar,
            "day_name_en": day_name_en,
            "old_shift_code": old_code or "",
            "old_shift_label": old_label or old_code or "—",
            "old_shift_group": old_group or "",
            "new_shift_code": new_code or "",
            "new_shift_label": new_label or new_code or "—",
            "new_shift_group": new_group or "",
            "old_display": old_display,
            "new_display": new_display,
            "line_ar": line_ar,
            "line_en": line_en,
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
        month_ar = f"{_MONTHS_AR[month - 1]} {year}"
        return month_ar, month_en
    except Exception:
        return month_key, month_key


def _empty_alert(month_key):
    return {
        "month": month_key,
        "is_active": False,
        "change_hash": "",
        "changed_at": "",
        "total_changed_days": 0,
        "summary": {"ar": "", "en": ""},
        "title": {"ar": "", "en": ""},
        "lines": {"ar": [], "en": []},
        "days": [],
    }


def build_month_change_alert(month_key, old_schedule, new_schedule):
    old_normalized = _normalize_schedule(old_schedule)
    new_normalized = _normalize_schedule(new_schedule)

    # أول إنشاء للشهر أو لا يوجد نسخة قديمة: لا نعتبره تغييرًا
    if not old_normalized:
        return _empty_alert(month_key)

    changed_days = _changed_days(old_normalized, new_normalized)
    if not changed_days:
        return _empty_alert(month_key)

    month_ar, month_en = _month_text(month_key)
    total = len(changed_days)
    change_hash = _build_hash(month_key, changed_days)
    changed_at = datetime.now(TZ).isoformat()

    # عنوان قصير
    title_ar = f"تحديث جدول {month_ar}"
    title_en = f"Roster updated — {month_en}"

    # ملخص أنيق ومضبوط لغويًا
    if total == 1:
        summary_ar = f"تم تعديل يوم واحد في جدولك لشهر {month_ar}."
    elif total == 2:
        summary_ar = f"تم تعديل يومين في جدولك لشهر {month_ar}."
    elif 3 <= total <= 10:
        summary_ar = f"تم تعديل {total} أيام في جدولك لشهر {month_ar}."
    else:
        summary_ar = f"تم تعديل {total} يومًا في جدولك لشهر {month_ar}."

    summary_en = (
        f"{total} day changed in your roster for {month_en}."
        if total == 1
        else f"{total} days changed in your roster for {month_en}."
    )

    # أسطر جاهزة للعرض (سطر لكل يوم متغيّر)
    lines_ar = [d["line_ar"] for d in changed_days]
    lines_en = [d["line_en"] for d in changed_days]

    return {
        "month": month_key,
        "is_active": True,
        "change_hash": change_hash,
        "changed_at": changed_at,
        "total_changed_days": total,
        "title": {"ar": title_ar, "en": title_en},
        "summary": {"ar": summary_ar, "en": summary_en},
        "lines": {"ar": lines_ar, "en": lines_en},
        "days": changed_days,
    }
