#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import requests

from parse_training_source_html import parse_source_html


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def onedrive_to_download_url(url: str) -> str:
    """
    يحوّل رابط مشاركة OneDrive إلى رابط تنزيل مباشر للملف.
    
    روابط OneDrive المشتركة تفتح الـ viewer وليس الملف مباشرة.
    الحل: استبدال آخر جزء في الرابط بـ download=1
    
    أنواع الروابط المدعومة:
      https://1drv.ms/u/s!Axxx
      https://onedrive.live.com/...
      https://<tenant>.sharepoint.com/:u:/...
    """
    import re

    # SharePoint / OneDrive for Business
    # مثال: https://company.sharepoint.com/:u:/g/personal/.../AbcXyz?e=token
    # نبدّل /:u:/ أو /:x:/ إلى /download ونُبقي الـ query string
    sp_match = re.match(r'(https://[^/]+\.sharepoint\.com/)(:[\w]+:/[^?]+)(\?.*)?', url)
    if sp_match:
        base = sp_match.group(1)
        path = sp_match.group(2)
        query = sp_match.group(3) or ''
        # نُضيف download=1 إلى query string
        sep = '&' if query else '?'
        return url + sep + 'download=1'

    # OneDrive personal short links (1drv.ms) أو onedrive.live.com
    if '1drv.ms' in url or 'onedrive.live.com' in url:
        sep = '&' if '?' in url else '?'
        return url + sep + 'download=1'

    # إذا كان الرابط يحتوي على download=1 بالفعل أو رابط مباشر
    return url


def download_shared_html(share_url: str) -> bytes:
    download_url = onedrive_to_download_url(share_url)

    response = requests.get(
        download_url,
        headers={"Accept": "text/html, text/plain, */*", "User-Agent": "training-page-sync/training-root"},
        timeout=120,
        allow_redirects=True,
    )
    response.raise_for_status()

    # تحقق أن المحتوى هو HTML حقيقي وليس صفحة OneDrive
    content = response.content
    content_type = response.headers.get('Content-Type', '')
    text_preview = content[:500].decode('utf-8', errors='replace').lower()

    # إذا كان الـ response صفحة OneDrive وليس الملف
    if 'onedrive' in text_preview and '<table' not in text_preview:
        raise RuntimeError(
            f"الرابط يُعيد صفحة OneDrive وليس الملف مباشرة.\n"
            f"URL المستخدم: {download_url}\n"
            f"Content-Type: {content_type}\n"
            f"تأكد أن الرابط في TRAINING_PAGE_SOURCE_URL هو رابط تنزيل مباشر."
        )

    return content


def load_existing_archive(path: Path) -> dict:
    if not path.exists():
        return {"months": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if "months" not in data or not isinstance(data["months"], list):
        return {"months": []}
    return data


def merge_months(existing: dict, incoming: dict) -> dict:
    merged = {item["month_id"]: item for item in existing.get("months", []) if "month_id" in item}
    for item in incoming.get("months", []):
        if "month_id" in item:
            merged[item["month_id"]] = item
    return {"months": [merged[key] for key in sorted(merged.keys())]}


def write_if_changed(path: Path, content: bytes) -> bool:
    if path.exists() and path.read_bytes() == content:
        return False
    path.write_bytes(content)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync shared HTML and rebuild pages under docs/training/.")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--data-file", default="training_courses_data.json")
    parser.add_argument("--generator-script", default="generate_training_archive_pages.py")
    parser.add_argument("--site-output-dir", default="docs/training")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    data_file = (repo_root / args.data_file).resolve()
    generator_script = (repo_root / args.generator_script).resolve()
    site_output_dir = (repo_root / args.site_output_dir).resolve()

    share_url = os.environ.get("TRAINING_PAGE_SOURCE_URL")
    if not share_url:
        raise RuntimeError("Missing environment variable: TRAINING_PAGE_SOURCE_URL")

    payload = download_shared_html(share_url)
    incoming = parse_source_html(payload.decode("utf-8", errors="replace"))
    existing = load_existing_archive(data_file)
    merged = merge_months(existing, incoming)
    changed = write_if_changed(data_file, json.dumps(merged, ensure_ascii=False, indent=2).encode("utf-8"))

    subprocess.run([sys.executable, str(generator_script), str(data_file), "-o", str(site_output_dir)], check=True)

    print(f"[OK] synced source HTML into {data_file.name}")
    print(f"[OK] rebuilt training pages in {site_output_dir}")
    print(f"[INFO] data_changed={str(changed).lower()}")
    print(f"[INFO] source_sha256={sha256_bytes(payload).lower()}")
    print(f"[INFO] months_in_archive={len(merged.get('months', []))}")


if __name__ == "__main__":
    main()
